import { readFile, writeFile, mkdir, open, unlink, rename } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadData } from "../../src/data.js";
import { atomicJson, hash, now, readJson, resolveRoot, exists } from "../../src/utils.js";
import { Logger } from "../../src/logger.js";
import { StopRun, type Message, type TurnOptions } from "../../src/client.js";
import type { Config } from "../../src/types.js";
import { NoRagEngine, verifyCheckpoint, type Checkpoint } from "../no-rag-v19/engine.js";
import { IndividualVertexClient } from "./client.js";
import { SuiteBudget } from "../paid-v17/client.js";
import { report } from "../paid-v17/report.js";
import { createVertexSdk, type VertexSettings } from "../vertex-v18/connection.js";
import { finalize } from "../../delivery/finalize.js";
import { REPAIR_IDS, checkInherited, recoveryRecords, recoveryContext } from "./repair-plan.js";

const suite = "pro-judge-v20-359-repair-1";
const root = resolveRoot("output/individual-v20", suite);
const parentRoot = resolveRoot("output/individual-v20/pro-judge-v20-359-r2");
type Parent = { fingerprint: string; config: Config; vertex: VertexSettings; inputHashes: Record<string, string>; budgetDirectory: string; sources: Record<string, string> };

async function main() {
  const { values } = parseArgs({ options: { run: { type: "boolean" }, "dry-run": { type: "boolean" } } });
  if (!!values.run === !!values["dry-run"]) throw new Error("Escolha --run ou --dry-run.");
  if (await exists(`${parentRoot}/run.lock`)) throw new Error("Experimento original em execução.");
  const parent = await readJson<Parent>(`${parentRoot}/manifest.json`), data = await loadData();
  const old = await readJson<Checkpoint>(`${parentRoot}/checkpoint.json`);
  verifyCheckpoint(old, parent.fingerprint, data, parent.config);
  if (JSON.stringify(parent.inputHashes) !== JSON.stringify(data.inputHashes)) throw new Error("Dados originais alterados.");
  const budgetRoot = parent.budgetDirectory;
  const authorization = await readJson<{ budgetUsd: number }>(`${budgetRoot}/authorization.json`);
  if (authorization.budgetUsd !== 75) throw new Error("Autorização financeira difere do teto de US$75.");
  const config = structuredClone(parent.config); config.direct!.budgetUsd = authorization.budgetUsd;
  const prompts = await readJson<{ classifier: string; judge: string }>(`${parentRoot}/prompts.json`);
  const parentHashes: Record<string, string> = {};
  for (const file of ["manifest.json", "checkpoint.json", "records.json", "prompts.json", "requests.jsonl"]) parentHashes[file] = hash(await readFile(`${parentRoot}/${file}`, "utf8"));
  const context = recoveryContext(old, (await readFile(`${parentRoot}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line)));
  const sources: Record<string, string> = {};
  for (const file of [...Object.keys(parent.sources), "experiments/individual-v20/repair.ts", "experiments/individual-v20/repair-plan.ts", "delivery/finalize.ts"]) sources[file] = hash(await readFile(resolveRoot(file), "utf8"));
  const fingerprint = hash(JSON.stringify({ parentHashes, sources, config, prompts, context, ids: REPAIR_IDS }));
  const plan = { version: 20, mode: "models_only", suite, fingerprint, parent: parentRoot, parentFingerprint: parent.fingerprint, parentHashes,
    ids: data.questions.map(q => q.id), inputHashes: data.inputHashes, config, vertex: parent.vertex, promptsUnchanged: true,
    classifierModel: config.classifierModel, judgeModel: config.judgeModel, budgetDirectory: budgetRoot, budgetUsd: authorization.budgetUsd,
    recovery: { authorization: "Usuária: pode tentar executar essas pendencias para atualizar o csv", ids: REPAIR_IDS,
      freshClassifierIds: Object.keys(context), reusedProposalIds: ["Q0319"], inheritedDecisions: 354,
      maxNewAttemptsPerStage: 5, previousAttempts: Object.fromEntries(REPAIR_IDS.map(id => [id, old.records[id]!.attempts])),
      evaluationCaution: "Derivação com recuperação dirigida; não substitui o resultado original cego da v20." }, sources };
  if (values["dry-run"]) { await atomicJson(`${root}/plan.json`, plan); return { plan, budget: await new SuiteBudget(`${budgetRoot}/spend.json`, 75).summary() }; }
  await mkdir(root, { recursive: true });
  const shared = await open(`${budgetRoot}/execution.lock`, "wx");
  await shared.writeFile(JSON.stringify({ at: now(), pid: process.pid, suite }));
  let lock;
  try { lock = await open(`${root}/run.lock`, "wx"); } catch (error) { await shared.close(); await unlink(`${budgetRoot}/execution.lock`); throw error; }
  let summary: any;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
    if (await exists(`${root}/manifest.json`)) {
      if ((await readJson<any>(`${root}/manifest.json`)).fingerprint !== fingerprint) throw new Error("Identidade da recuperação alterada.");
    } else {
      await atomicJson(`${root}/manifest.json`, { ...plan, createdAt: now() });
      await atomicJson(`${root}/prompts.json`, prompts);
      await atomicJson(`${root}/recovery-context.json`, context);
      for (const file of ["experiments/individual-v20/repair.ts", "experiments/individual-v20/repair-plan.ts"]) await atomicJson(`${root}/source-snapshot/${file}.json`, { file, text: await readFile(resolveRoot(file), "utf8") });
    }
    const checkpoint: Checkpoint = await exists(`${root}/checkpoint.json`) ? await readJson(`${root}/checkpoint.json`) : { version: 1, fingerprint, records: recoveryRecords(old) };
    verifyCheckpoint(checkpoint, fingerprint, data, config); checkInherited(old, checkpoint.records);
    const sdk = createVertexSdk(parent.vertex, 30000);
    for (const model of [config.classifierModel, config.judgeModel]) await sdk.models.get({ model });
    await atomicJson(`${root}/preflight.json`, { at: now(), models: [config.classifierModel, config.judgeModel], inferenceCalls: 0 });
    const budget = new SuiteBudget(`${budgetRoot}/spend.json`, 75);
    class RecoveryClient extends IndividualVertexClient {
      override turn(role: "classifier" | "judge", messages: Message[], schema: z.ZodType, ids: string[], beforeSend: (id: string) => Promise<void>, options?: TurnOptions) {
        if (ids.some(id => !REPAIR_IDS.includes(id as typeof REPAIR_IDS[number]))) throw new Error("Chamada fora dos cinco IDs autorizados.");
        const enriched = role === "classifier" ? [...messages, { role: "user" as const, content: JSON.stringify({ recuperacao: ids.map(id => context[id]) }) }] : messages;
        return super.turn(role, enriched, schema, ids, beforeSend, options);
      }
    }
    const client = new RecoveryClient(config, new Logger(root), budget, `${budgetRoot}/repair-cooldowns`, {}, parent.vertex);
    const engine = new NoRagEngine(data, config, prompts, client, checkpoint, root);
    const startedAt = now(); let stopped: string | null = null;
    await engine.save(); await client.logger.event("invocation", { startedAt, fingerprint, recoveryIds: REPAIR_IDS, budgetBefore: await budget.summary() });
    try { await engine.run(); } catch (error) { if (!(error instanceof StopRun)) throw error; stopped = error.message; await engine.save(); }
    checkInherited(old, checkpoint.records);
    const result = await report(root, data, checkpoint.records, stopped, client.calls, startedAt);
    await atomicJson(`${root}/report.json`, { ...result, recovery: plan.recovery });
    summary = { completed: result.completed, pending: result.pending, stopped, calls: client.calls, budget: await budget.summary() };
    await atomicJson(`${root}/last-run.json`, { at: now(), ...summary });
    await atomicJson(`${root}/status.json`, { ...await readJson<any>(`${root}/status.json`), state: stopped ? "stopped" : "finished", currentBatch: [] });
  } finally { await lock.close(); await unlink(`${root}/run.lock`); await shared.close(); await unlink(`${budgetRoot}/execution.lock`); }
  if (summary.pending.length || summary.stopped) { process.exitCode = 2; return summary; }
  // Recheck frozen parent and inherited records immediately before export.
  for (const [file, digest] of Object.entries(parentHashes)) if (hash(await readFile(`${parentRoot}/${file}`, "utf8")) !== digest) throw new Error("Fonte original foi alterada durante a recuperação.");
  const delivery = await finalize(suite, suite, { version: 20 });
  await atomicJson(`${delivery.directory}/recovery-provenance.json`, { at: now(), parentHashes, parent: parentRoot, ...plan.recovery,
    feedbackSource: `${root}/recovery-context.json`, referenceDelivered: false, newCalls: summary.calls, budget: summary.budget });
  const newCsv = await readFile(delivery.rootCsv, "utf8"), rootCsv = resolveRoot("publicacao.csv");
  const previous = await readFile(rootCsv, "utf8"), previousHash = hash(previous);
  const backup = resolveRoot(`output/delivery/root-history/${previousHash}.csv`);
  if (!await exists(backup)) { await mkdir(resolveRoot("output/delivery/root-history"), { recursive: true }); await writeFile(backup, previous); }
  if (await readFile(backup, "utf8") !== previous) throw new Error("Backup do CSV anterior diverge.");
  await writeFile(`${rootCsv}.repair.tmp`, newCsv); await rename(`${rootCsv}.repair.tmp`, rootCsv);
  if (await readFile(rootCsv, "utf8") !== newCsv) throw new Error("CSV da raiz diverge da entrega validada.");
  await atomicJson(resolveRoot("output/delivery/current.json"), { at: now(), source: delivery.directory, csvHash: hash(newCsv), previousHash, previousCsvBackup: backup });
  return { ...summary, delivery, rootCsvUpdated: rootCsv, previousCsvBackup: backup };
}
main().then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
