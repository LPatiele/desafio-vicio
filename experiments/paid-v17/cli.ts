import "dotenv/config";
import { parseArgs } from "node:util";
import { readFile, readdir, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getConfig, loadPrompts } from "../../src/config.js";
import { loadData, indexThemes } from "../../src/data.js";
import type { Config, RecordState } from "../../src/types.js";
import { ProposalSchema, VerdictSchema } from "../../src/types.js";
import { loadOriginalLabels } from "../../src/retrieval/context.js";
import { KnowledgeStore, LocalContextService, localCitations } from "../../src/knowledge/store.js";
import { validateProposal, validateVerdict } from "../../src/validation.js";
import { decideRecord } from "../../src/retrieval/decision.js";
import { Logger } from "../../src/logger.js";
import { atomicJson, exists, hash, now, readJson, redact, resolveRoot, sleep } from "../../src/utils.js";
import { StopRun } from "../../src/client.js";
import { ReactiveClient, SuiteBudget } from "./client.js";
import { BatchEngine, recoverRetrievalOnly, verifySessions, type Checkpoint } from "./engine.js";
import { report } from "./report.js";
import { assertBudgetScope, baselineReady, conditionOrder, runSequential } from "./sequence.js";

const Options = z.object({ suite: z.string().regex(/^[a-z0-9-]{1,60}$/), budget: z.number().positive().optional(), limit: z.number().int().min(1).max(359), dry: z.boolean(), condition: z.enum(["all", "batches", "b1", "b10", "b20", "b30"]) });
const args = parseArgs({ options: { suite: { type: "string", default: "paid-v17-359" }, "budget-usd": { type: "string" }, limit: { type: "string", default: "359" }, "dry-run": { type: "boolean", default: false }, condition: { type: "string", default: "all" } } }).values;
const options = Options.parse({ suite: args.suite, budget: args["budget-usd"] === undefined ? undefined : Number(args["budget-usd"]), limit: Number(args.limit), dry: args["dry-run"], condition: args.condition });

async function sourceHashes() {
  const visit = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(e => e.isDirectory() ? visit(path.join(directory, e.name)) : [path.join(directory, e.name)]))).flat();
  };
  const originalFiles = [...await visit(resolveRoot("src")), resolveRoot("package-lock.json")].sort();
  const originalCodeHash = hash((await Promise.all(originalFiles.map(async file => `${path.relative(resolveRoot(), file)}:${hash(await readFile(file, "utf8"))}`))).join("\n"));
  const experimentFiles = (await visit(import.meta.dirname)).filter(file => file.endsWith(".ts")).sort();
  const experimentCodeHash = hash((await Promise.all(experimentFiles.map(async file => `${path.basename(file)}:${hash(await readFile(file, "utf8"))}`))).join("\n"));
  return { originalCodeHash, experimentCodeHash };
}

async function modelCapabilities(config: Config) {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!key) throw new Error("Chave Gemini ausente no .env.");
  const models: { id: string; inputTokenLimit: number; outputTokenLimit: number }[] = [];
  for (const model of [config.classifierModel, config.judgeModel]) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Consulta de capacidades ${model}: HTTP ${response.status}.`);
    const info = await response.json() as any;
    if (!info.supportedGenerationMethods?.includes("generateContent") || !Number.isInteger(info.outputTokenLimit) || info.outputTokenLimit < 1024 || !Number.isInteger(info.inputTokenLimit)) throw new Error(`Capacidades insuficientes ou desconhecidas: ${model}. Nenhuma inferência foi enviada.`);
    models.push({ id: model, inputTokenLimit: info.inputTokenLimit, outputTokenLimit: info.outputTokenLimit });
  }
  return { models, checkedAt: now(), actualProjectRateLimits: null };
}

async function main() {
  if (!options.dry && options.budget === undefined) throw new Error("Defina --budget-usd com o teto TOTAL aprovado para os quatro experimentos; não há gasto padrão implícito.");
  const base = await getConfig(resolveRoot("config/individual-v16-projeto3.json"));
  const data = await loadData(), prompts = await loadPrompts(base), code = await sourceHashes();
  const baseline = await readJson<{ codeHash: string }>(resolveRoot("output/experiments/gemini35-v16-projeto2-359/manifest.json"));
  if (code.originalCodeHash !== baseline.codeHash) throw new Error("Código original mudou; preserve o teste atual antes de executar a suíte.");
  const ids = data.questions.slice(0, options.limit).map(q => q.id);
  const sizes = conditionOrder(options.condition);
  const plan = { version: 17, suite: options.suite, baseConfig: "config/individual-v16-projeto3.json", ids, conditions: sizes.map(batchSize => ({ name: `b${batchSize}`, batchSize, batches: Math.ceil(ids.length / batchSize), minimumModelCalls: 3 * Math.ceil(ids.length / batchSize), maximumOutputTokens: { classifier: Math.min(65536, base.direct!.classifier.maxOutputTokens * batchSize), judge: Math.min(65536, base.direct!.judge.maxOutputTokens * batchSize) } })),
    pacing: "reactive_only", preventiveSleep: false, inferenceConcurrency: 1, executionOrder: sizes.map(size => `b${size}`), deferredConditions: sizes.includes(1) ? [{ name: "b1", requires: "v16:359 decisões e processo encerrado" }] : [], budgetUsdShared: options.budget ?? null,
    reportedLimits: { rpmPerModel: 1000, inputTpmPerModel: 4000000, verifiedInProject: false },
    note: "Limites pagos são uma hipótese fornecida pelo usuário; sem pausa preventiva. HTTP 429 gera cooldown compartilhado e retentativa. Cinco envios totais por questão e etapa. Não interrompe nem muda o código do experimento v16.", ...code };
  const store = await KnowledgeStore.open(resolveRoot(base.knowledge!.snapshot), data);
  try {
    for (const id of ids) store.gapsFor(id);
    if (options.dry) return { ...plan, questions: ids.length, baselineCodePreserved: true };
    const root = resolveRoot("output/paid-v17", options.suite); await mkdir(root, { recursive: true });
    if (await exists(`${root}/authorization.json`)) assertBudgetScope(sizes, options.budget!, await readJson(`${root}/authorization.json`));
    const queueLockFile = `${root}/sequence.lock`;
    let queueLock;
    try { queueLock = await open(queueLockFile, "wx"); }
    catch { throw new Error("Uma sequência dessa suíte já está ativa ou deixou uma trava. Confira o processo proprietário antes de retomar."); }
    try {
    await queueLock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
    await atomicJson(`${root}/invocation-plan.json`, { ...plan, at: now() });
    const preflight = await modelCapabilities(base); await atomicJson(`${root}/preflight.json`, preflight);
    const budget = new SuiteBudget(`${root}/spend.json`, options.budget!);
    const labels = await loadOriginalLabels(data), stopReason: { message?: string } = {};
    const { results, queued } = await runSequential(sizes, async size => {
      if (size === 1) {
        const baselineDirectory = resolveRoot("output/experiments/gemini35-v16-projeto2-359");
        const allIds = data.questions.map(q => q.id);
        let notified = false;
        while (true) {
          const running = await exists(`${baselineDirectory}/run.lock`);
          const records = await readJson<Record<string, RecordState>>(`${baselineDirectory}/records.json`);
          if (baselineReady(allIds, records, running)) break;
          if (!running) throw new StopRun("b1 adiado: o teste v16 está interrompido com questões pendentes. Finalize as 359 questões antes de iniciar b1.");
          if (!notified) { console.log("b1 adiado: aguardando o teste v16 concluir as 359 questões e encerrar o processo."); notified = true; }
          await sleep(30000);
        }
      }
      const directory = `${root}/b${size}`; await mkdir(directory, { recursive: true });
      const lockFile = `${directory}/run.lock`, lock = await open(lockFile, "wx");
      const startedAt = now();
      try {
        await lock.writeFile(JSON.stringify({ pid: process.pid, at: startedAt }));
        const config: Config = structuredClone(base);
        config.direct!.budgetUsd = options.budget!;
        config.batchSize = size; config.maxRequestCharacters = 2000000; config.minIntervalMs = 0; config.retryBaseDelayMs = 0;
        for (const role of ["classifier", "judge"] as const) {
          const model = role === "classifier" ? config.classifierModel : config.judgeModel;
          config.direct![role].maxOutputTokens = Math.min(65536, preflight.models.find(m => m.id === model)!.outputTokenLimit, base.direct![role].maxOutputTokens * size);
          config.direct![role].minIntervalMs = 0;
          config.direct![role].requestsPerMinute = 1000; config.direct![role].tokensPerMinute = 4000000;
          delete config.direct![role].requestsPerDay;
        }
        const { budgetUsd: _budget, ...directIdentity } = config.direct!;
        const scientificConfig = { ...config, direct: directIdentity };
        const fingerprint = hash(JSON.stringify({ config: scientificConfig, ids, inputs: data.inputHashes, prompts: prompts.hashes, code, knowledge: store.manifestHash, adapter: "per-question-tools-v17" }));
        let recovery: any;
        if (await exists(`${directory}/recovery.json`)) {
          recovery = await readJson(`${directory}/recovery.json`);
          const seedText = await readFile(`${directory}/recovery-checkpoint.json`, "utf8");
          if (hash(seedText) !== recovery.checkpointHash || JSON.stringify(recovery.inputHashes) !== JSON.stringify(data.inputHashes) || JSON.stringify(recovery.promptHashes) !== JSON.stringify(prompts.hashes) || recovery.knowledgeManifestHash !== store.manifestHash) throw new Error("Proveniência do checkpoint de recuperação difere da condição atual.");
        }
        const manifestFile = `${directory}/manifest.json`;
        if (await exists(manifestFile)) { if ((await readJson<{ fingerprint: string }>(manifestFile)).fingerprint !== fingerprint) throw new Error("Configuração, código ou entradas mudaram; use outra suíte."); }
        else { await atomicJson(manifestFile, { fingerprint, config, ids, inputHashes: data.inputHashes, promptHashes: prompts.hashes, knowledgeIdentity: { manifestHash: store.manifestHash, databaseHash: store.manifest.databaseHash }, ...code, createdAt: startedAt, pacing: "reactive_only", ...(recovery ? { recoveredRetrieval: recovery } : {}) }); await atomicJson(`${directory}/prompts.json`, prompts); }
        const checkpoint: Checkpoint = await exists(`${directory}/checkpoint.json`) ? await readJson(`${directory}/checkpoint.json`) : recovery ? recoverRetrievalOnly(await readJson(`${directory}/recovery-checkpoint.json`), recovery.originalFingerprint, fingerprint) : { version: 1, fingerprint, records: Object.fromEntries(ids.map(id => [id, { id, errors: [] }])), sessions: {} };
        if (checkpoint.version !== 1 || checkpoint.fingerprint !== fingerprint || JSON.stringify(Object.keys(checkpoint.records).sort()) !== JSON.stringify([...ids].sort())) throw new Error("Checkpoint inválido.");
        const service = new LocalContextService(store, data, labels, config), themes = indexThemes(data.themes);
        verifySessions(checkpoint, service);
        for (const [id, r] of Object.entries(checkpoint.records)) {
          if (r.id !== id || !Array.isArray(r.errors) || Object.values(r.attempts ?? {}).some(n => !Number.isInteger(n) || n < 0 || n > 5)) throw new Error("Registro/tentativas inválidos.");
          const question = data.questions.find(q => q.id === id)!;
          if (r.proposal && validateProposal(ProposalSchema.parse(r.proposal), question, themes).length) throw new Error("Proposta salva inválida.");
          if (r.knowledge) service.validate(r);
          if (r.verdict && (!r.proposal || validateVerdict(VerdictSchema.parse(r.verdict), r.proposal, themes).length || JSON.stringify(r.knowledge?.sourcesUsed) !== JSON.stringify(localCitations(r.verdict, r.knowledge!)))) throw new Error("Parecer salvo inválido.");
          if (r.decision && JSON.stringify(r.decision) !== JSON.stringify(decideRecord(r, question, themes, config))) throw new Error("Decisão salva alterada.");
        }
        const selectedData = { ...data, questions: data.questions.filter(q => ids.includes(q.id)) };
        const client = new ReactiveClient(config, new Logger(directory), budget, `${root}/cooldowns`, stopReason);
        const engine = new BatchEngine(selectedData, config, size, prompts, service, client, checkpoint, directory);
        await engine.save(); await client.logger.event("invocation", { at: startedAt, fingerprint, budgetUsdShared: options.budget, ids });
        let stopped: string | null = null;
        try { await engine.run(); }
        catch (error) { if (!(error instanceof StopRun)) throw error; stopped = error.message; await engine.save(); }
        const result = await report(directory, selectedData, checkpoint.records, stopped, client.calls, startedAt);
        await atomicJson(`${directory}/last-run.json`, { at: now(), completed: result.completed, pending: result.pending, stopped, budgetShared: await budget.summary() });
        return { condition: `b${size}`, completed: result.completed, pending: result.pending.length, stopped };
      } finally { await lock.close(); await unlink(lockFile); }
    });
    const summary = { at: now(), suite: options.suite, executionOrder: sizes.map(size => `b${size}`), queued, budgetShared: await budget.summary(), conditions: results.map((r, i) => r.status === "fulfilled" ? r.value : { condition: `b${sizes[i]}`, error: String(r.reason) }) };
    await atomicJson(`${root}/summary.json`, summary); return summary;
    } finally { await queueLock.close(); await unlink(queueLockFile); }
  } finally { store.close(); }
}
main().then(value => console.log(JSON.stringify(redact(value), null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
