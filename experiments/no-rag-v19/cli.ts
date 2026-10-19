import "dotenv/config";
import { parseArgs } from "node:util";
import { readFile, readdir, mkdir, open, unlink, cp } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../../src/config.js";
import { loadData } from "../../src/data.js";
import { Logger } from "../../src/logger.js";
import { StopRun } from "../../src/client.js";
import { atomicJson, exists, hash, now, readJson, resolveRoot } from "../../src/utils.js";
import { SuiteBudget } from "../paid-v17/client.js";
import { assertBudgetScope } from "../paid-v17/sequence.js";
import { report } from "../paid-v17/report.js";
import { VertexClient } from "../vertex-v18/client.js";
import { createVertexSdk, VertexSettingsSchema, vertexError } from "../vertex-v18/connection.js";
import { NoRagEngine, verifyCheckpoint, type Checkpoint } from "./engine.js";

const Settings = z.object({
  baseConfig: z.literal("config/individual-v16-projeto3.json"), vertexConfig: z.literal("config/vertex-v18.json"),
  batchSize: z.literal(10), classifierPrompt: z.literal("classificador.md"), judgePrompt: z.literal("juiz.md"),
  sharedBudgetSuite: z.literal("paid-v17-359"), knowledgeEnabled: z.literal(false), retrievalEnabled: z.literal(false), toolsEnabled: z.literal(false),
}).strict();
async function codeIdentity() {
  const visit = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.filter(e => e.name !== "node_modules").map(e => e.isDirectory() ? visit(path.join(directory, e.name)) : [path.join(directory, e.name)]))).flat();
  };
  const digest = async (files: string[]) => hash((await Promise.all(files.sort().map(async file => `${path.relative(resolveRoot(), file)}:${hash(await readFile(file, "utf8"))}`))).join("\n"));
  const originalCodeHash = await digest([...await visit(resolveRoot("src")), resolveRoot("package-lock.json")]);
  const dependencies = [...await visit(resolveRoot("experiments/vertex-v18")), ...await visit(resolveRoot("experiments/paid-v17"))].filter(f => /\.(?:ts|json)$/.test(f));
  const codeHash = await digest([...await visit(import.meta.dirname), ...dependencies]);
  return { originalCodeHash, codeHash };
}

async function main() {
  const args = parseArgs({ options: { suite: { type: "string", default: "model-only-v19-359" }, limit: { type: "string", default: "359" }, "dry-run": { type: "boolean", default: false }, run: { type: "boolean", default: false } } }).values;
  if (!/^[a-z0-9-]{1,60}$/.test(args.suite!) || [args["dry-run"], args.run].filter(Boolean).length !== 1) throw new Error("Escolha --dry-run ou --run e um nome válido para a suíte.");
  const limit = Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 359) throw new Error("Limite de questões inválido.");
  const settings = Settings.parse(await readJson(resolveRoot("config/no-rag-v19.json")));
  const vertex = VertexSettingsSchema.parse(await readJson(resolveRoot(settings.vertexConfig)));
  const config = await getConfig(resolveRoot(settings.baseConfig));
  delete config.knowledge; delete config.retrieval; delete config.research;
  config.classifierModel = vertex.classifierModel; config.judgeModel = vertex.judgeModel;
  config.classifierPrompt = "classificador.v3.md"; config.judgePrompt = "juiz.v3.md";
  config.batchSize = settings.batchSize; config.maxRequestCharacters = 2000000; config.minIntervalMs = 0; config.retryBaseDelayMs = 0;
  if (!vertex.pricing) throw new Error("Preços Vertex não configurados.");
  const parent = resolveRoot("output/paid-v17", settings.sharedBudgetSuite);
  const authorization = await readJson<{ totalBudgetUsd: number; allowedConditions: string[] }>(`${parent}/authorization.json`);
  assertBudgetScope([settings.batchSize], authorization.totalBudgetUsd, authorization);
  config.direct!.budgetUsd = authorization.totalBudgetUsd;
  config.direct!.quotaScope = `vertex-${vertex.project}-${vertex.location}`;
  for (const role of ["classifier", "judge"] as const) {
    const price = vertex.pricing[role], profile = config.direct![role];
    profile.inputUsdPerMillion = price.inputUsdPerMillion; profile.cachedInputUsdPerMillion = price.cachedInputUsdPerMillion; profile.outputUsdPerMillion = price.outputUsdPerMillion;
    profile.maxOutputTokens = 65536; profile.minIntervalMs = 0;
    delete profile.longContext; delete profile.requestsPerDay;
  }
  const all = await loadData(), data = { ...all, questions: all.questions.slice(0, limit) };
  const classifier = await readFile(path.join(import.meta.dirname, "prompts", settings.classifierPrompt), "utf8");
  const judge = await readFile(path.join(import.meta.dirname, "prompts", settings.judgePrompt), "utf8");
  const prompts = { classifier, judge }, promptHashes = { classifier: hash(classifier), judge: hash(judge) };
  const code = await codeIdentity();
  if ((await readJson<{ codeHash: string }>(resolveRoot("output/experiments/gemini35-v16-projeto2-359/manifest.json"))).codeHash !== code.originalCodeHash) throw new Error("Código original alterado; preserve os experimentos anteriores.");
  const ids = data.questions.map(q => q.id);
  const fingerprint = hash(JSON.stringify({ config, vertex, settings, ids, inputHashes: data.inputHashes, promptHashes, code }));
  const plan = { version: 19, channel: "vertex", project: vertex.project, mode: "models_only", knowledgeEnabled: false, retrievalEnabled: false, toolsEnabled: false, originalLabelsDelivered: false, referenceDelivered: false,
    suite: args.suite, questions: ids.length, ids, batchSize: settings.batchSize, batches: Math.ceil(ids.length / settings.batchSize), minimumInferenceCalls: 2 * Math.ceil(ids.length / settings.batchSize),
    concurrency: 1, maxAttemptsPerQuestionAndStage: 5, sharedBudgetSuite: settings.sharedBudgetSuite, sharedBudgetLimitUsd: authorization.totalBudgetUsd, classifierModel: config.classifierModel, judgeModel: config.judgeModel,
    sourcePrompts: "v3, cópias versionadas sem instruções de recuperação", promptHashes, code, fingerprint, previousResultsPreserved: true };
  if (args["dry-run"]) return plan;
  for (const lockFile of [`${parent}/sequence.lock`, `${parent}/resume-chain.lock`, resolveRoot("output/vertex-v18/vertex-v18-359/run.lock"), resolveRoot("output/vertex-v18/vertex-v18-359/resume-chain.lock")]) if (await exists(lockFile)) throw new Error("Há trava de execução anterior; confira seu proprietário antes de iniciar.");
  const root = resolveRoot("output/no-rag-v19", args.suite!);
  await mkdir(root, { recursive: true });
  const lockFile = `${root}/run.lock`, lock = await open(lockFile, "wx");
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
    const manifestFile = `${root}/manifest.json`;
    if (await exists(manifestFile)) {
      if ((await readJson<{ fingerprint: string }>(manifestFile)).fingerprint !== fingerprint) throw new Error("Identidade v19 alterada. Use outra suíte para preservar a comparação.");
    } else {
      await atomicJson(manifestFile, { ...plan, config, vertex, inputHashes: data.inputHashes, createdAt: now() });
      await atomicJson(`${root}/prompts.json`, prompts);
      await cp(import.meta.dirname, `${root}/source-snapshot`, { recursive: true });
    }
    const checkpoint: Checkpoint = await exists(`${root}/checkpoint.json`) ? await readJson(`${root}/checkpoint.json`) : { version: 1, fingerprint, records: Object.fromEntries(ids.map(id => [id, { id, errors: [] }])) };
    verifyCheckpoint(checkpoint, fingerprint, data, config);
    const budget = new SuiteBudget(`${parent}/spend.json`, authorization.totalBudgetUsd);
    const sdk = createVertexSdk(vertex, config.timeoutMs), models = [];
    for (const model of [config.classifierModel, config.judgeModel]) { const info = await sdk.models.get({ model }); models.push({ requested: model, name: info.name }); }
    await atomicJson(`${root}/preflight.json`, { at: now(), models, budgetBefore: await budget.summary() });
    const client = new VertexClient(config, new Logger(root), budget, `${root}/cooldowns`, {}, vertex, sdk);
    const engine = new NoRagEngine(data, config, prompts, client, checkpoint, root);
    const startedAt = now(); let stopped: string | null = null;
    await engine.save(); await client.logger.event("invocation", { startedAt, fingerprint, mode: "models_only", budgetBefore: await budget.summary() });
    try { await engine.run(); }
    catch (error) { if (!(error instanceof StopRun)) throw error; stopped = error.message; await engine.save(); }
    const result = await report(root, data, checkpoint.records, stopped, client.calls, startedAt);
    result.caution = "Concordância com referência própria provisória, sem garantia de precisão jurídica de 95%. Nesta condição, ambos os modelos recebem somente questão/taxonomia/proposta: RAG, ferramentas, rótulos originais e recuperação automática desabilitados. A referência de avaliação é carregada somente após o processamento. Cinco envios por questão e etapa; pendências técnicas não são convertidas em decisões fictícias.";
    await atomicJson(`${root}/report.json`, result);
    const summary = { at: now(), mode: "models_only", completed: result.completed, pending: result.pending.length, stopped, allQuestionsCompleted: result.completed === ids.length,
      published: result.overall.published, reviewed: result.overall.reviewed, budgetShared: await budget.summary() };
    await atomicJson(`${root}/last-run.json`, summary);
    const status = await readJson<Record<string, unknown>>(`${root}/status.json`);
    await atomicJson(`${root}/status.json`, { ...status, state: stopped ? "stopped" : "finished", currentBatch: [], stopped });
    if (stopped) process.exitCode = 2;
    return summary;
  } finally { await lock.close(); await unlink(lockFile); }
}
main().then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {
  const failure = vertexError(error);
  console.error(JSON.stringify({ error: failure.status ? failure.raw.error : { message: error.message } }));
  process.exitCode = 1;
});
