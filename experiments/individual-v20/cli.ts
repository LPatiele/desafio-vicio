import { parseArgs } from "node:util";
import { mkdir, open, unlink, readFile } from "node:fs/promises";
import { prepare, estimate, authorizedBudget } from "./plan.js";
import { createVertexSdk, vertexError } from "../vertex-v18/connection.js";
import { IndividualVertexClient } from "./client.js";
import { SuiteBudget } from "../paid-v17/client.js";
import { report } from "../paid-v17/report.js";
import { NoRagEngine, verifyCheckpoint, type Checkpoint } from "../no-rag-v19/engine.js";
import { Logger } from "../../src/logger.js";
import { StopRun } from "../../src/client.js";
import { atomicJson, exists, hash, now, readJson, resolveRoot } from "../../src/utils.js";
import { finalize } from "../../delivery/finalize.js";

async function main() {
  const { values } = parseArgs({ options: {
    suite: { type: "string", default: "pro-judge-v20-359-r2" }, limit: { type: "string", default: "359" },
    "dry-run": { type: "boolean" }, preflight: { type: "boolean" }, run: { type: "boolean" }, "budget-usd": { type: "string" },
  } });
  if ([values["dry-run"], values.preflight, values.run].filter(Boolean).length !== 1 || !/^[a-z0-9-]{1,60}$/.test(values.suite!)) throw new Error("Escolha --dry-run, --preflight ou --run e um nome válido.");
  const budgetArg = values["budget-usd"] === undefined ? null : Number(values["budget-usd"]);
  if (budgetArg !== null && (!Number.isFinite(budgetArg) || budgetArg <= 0)) throw new Error("Teto financeiro inválido.");
  const p = await prepare(Number(values.limit));
  const { config, vertex, data, prompts, fingerprint } = p;
  const root = resolveRoot("output/individual-v20", values.suite!);
  const budgetRoot = resolveRoot("output/individual-v20", p.settings.budgetSuite);
  const plan = { version: 20, suite: values.suite, mode: "models_only", channel: "vertex", project: vertex.project,
    classifierModel: config.classifierModel, judgeModel: config.judgeModel,
    classifierReasoning: config.direct!.classifier.reasoningEffort, judgeReasoning: config.direct!.judge.reasoningEffort,
    questions: data.questions.length, batchSize: 1, concurrency: 1, minimumInferenceCalls: 2 * data.questions.length,
    maxAttemptsPerQuestionAndStage: 5, knowledgeEnabled: false, retrievalEnabled: false, toolsEnabled: false,
    originalLabelsDelivered: false, referenceDelivered: false, promptsPreservedFromV19: true, proposalsReused: false,
    baselineFingerprint: p.baselineFingerprint, fingerprint, costScenarios: await estimate(p),
    budgetUsd: budgetArg, budgetAuthorizationRequired: true, budgetScope: "all_v20_attempts_including_interrupted", budgetDirectory: budgetRoot,
    caution: "Troca de juiz e lote mudam juntos; a comparação com v19 não isola o efeito do modelo. A autorização antiga b30/b20/b10 não inclui este teste individual." };
  if (values["dry-run"]) { await atomicJson(`${root}/plan.json`, plan); return plan; }
  if (values.preflight) {
    const sdk = createVertexSdk(vertex, Math.min(config.timeoutMs, 30000));
    const models = [];
    for (const model of [config.classifierModel, config.judgeModel]) { const result = await sdk.models.get({ model }); models.push({ requested: model, name: result.name }); }
    const preflight = { at: now(), project: vertex.project, location: vertex.location, models, inferenceCalls: 0,
      note: "Metadados acessíveis; isso não comprova disponibilidade de generateContent ou abatimento do crédito." };
    await atomicJson(`${root}/preflight.json`, preflight); return preflight;
  }
  const authorizationFile = `${budgetRoot}/authorization.json`;
  authorizedBudget(await exists(authorizationFile) ? await readJson(authorizationFile) : null, budgetArg);
  await mkdir(root, { recursive: true });
  await mkdir(budgetRoot, { recursive: true });
  const sharedLockFile = `${budgetRoot}/execution.lock`, sharedLock = await open(sharedLockFile, "wx");
  await sharedLock.writeFile(JSON.stringify({ pid: process.pid, at: now(), suite: values.suite }));
  const lockFile = `${root}/run.lock`;
  let lock;
  try { lock = await open(lockFile, "wx"); }
  catch (error) { await sharedLock.close(); await unlink(sharedLockFile); throw error; }
  let summary: { completed: number; pending: number; stopped: string | null; budget: unknown };
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
    let authorization = await exists(authorizationFile) ? await readJson<{ budgetUsd: number }>(authorizationFile) : null;
    authorizedBudget(authorization, budgetArg);
    if (!authorization) {
      authorization = { budgetUsd: budgetArg! };
      await atomicJson(authorizationFile, { ...authorization, at: now(), scope: "individual-v20", source: "Teto fornecido explicitamente no comando de execução.", previousBudgetsPreserved: true });
    }
    config.direct!.budgetUsd = authorization.budgetUsd;
    const manifestFile = `${root}/manifest.json`;
    if (await exists(manifestFile)) {
      if ((await readJson<{ fingerprint: string }>(manifestFile)).fingerprint !== fingerprint) throw new Error("Identidade da v20 alterada. Use outra suíte para preservar resultados anteriores.");
    } else {
      await atomicJson(manifestFile, { ...plan, inputHashes: data.inputHashes, ids: data.questions.map(q => q.id), config, vertex, sources: p.sources,
        budgetUsd: authorization.budgetUsd, promptHashes: { classifier: hash(prompts.classifier), judge: hash(prompts.judge) }, createdAt: now() });
      await atomicJson(`${root}/prompts.json`, prompts);
      for (const file of Object.keys(p.sources)) await atomicJson(`${root}/source-snapshot/${file}.json`, { file, text: await readFile(resolveRoot(file), "utf8") });
    }
    const checkpoint: Checkpoint = await exists(`${root}/checkpoint.json`) ? await readJson(`${root}/checkpoint.json`) : { version: 1, fingerprint, records: Object.fromEntries(data.questions.map(q => [q.id, { id: q.id, errors: [] }])) };
    verifyCheckpoint(checkpoint, fingerprint, data, config);
    // Verify authentication and connectivity before consuming any per-item attempt.
    const sdk = createVertexSdk(vertex, Math.min(config.timeoutMs, 30000));
    const models = [];
    for (const model of [config.classifierModel, config.judgeModel]) { const info = await sdk.models.get({ model }); models.push({ requested: model, name: info.name }); }
    await atomicJson(`${root}/preflight.json`, { at: now(), models, inferenceCalls: 0 });
    const budget = new SuiteBudget(`${budgetRoot}/spend.json`, authorization.budgetUsd);
    const client = new IndividualVertexClient(config, new Logger(root), budget, `${root}/cooldowns`, {}, vertex);
    const engine = new NoRagEngine(data, config, prompts, client, checkpoint, root);
    const startedAt = now(); let stopped: string | null = null;
    await engine.save();
    await client.logger.event("invocation", { startedAt, fingerprint, mode: "models_only", budgetBefore: await budget.summary() });
    try { await engine.run(); } catch (error) { if (!(error instanceof StopRun)) throw error; stopped = error.message; await engine.save(); }
    const result = await report(root, data, checkpoint.records, stopped, client.calls, startedAt);
    result.caution = "Concordância com referência própria provisória, sem garantia de 95%. Um item por chamada e uma inferência por vez; cinco tentativas totais por questão/etapa. Ambos os modelos sem RAG, ferramentas ou rótulos originais. A referência só é carregada após a inferência. Lote e juiz mudam juntos em relação à v19.";
    await atomicJson(`${root}/report.json`, result);
    summary = { completed: result.completed, pending: result.pending.length, stopped, budget: await budget.summary() };
    await atomicJson(`${root}/last-run.json`, { at: now(), ...summary });
    const status = await readJson<Record<string, unknown>>(`${root}/status.json`);
    await atomicJson(`${root}/status.json`, { ...status, state: stopped ? "stopped" : "finished", currentBatch: [], stopped });
  } finally { await lock.close(); await unlink(lockFile); await sharedLock.close(); await unlink(sharedLockFile); }
  if (summary.stopped || summary.pending) process.exitCode = 2;
  const delivery = summary.completed === 359 && !summary.pending ? await finalize(values.suite!, values.suite!, { version: 20 }) : null;
  return { ...summary, delivery };
}
main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  const failure = vertexError(error);
  console.error(JSON.stringify({ error: failure.status ? failure.raw.error : { message: error.message } })); process.exitCode = 1;
});
