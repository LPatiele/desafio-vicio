import "dotenv/config";
import { parseArgs } from "node:util";
import { readFile, readdir, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { getConfig, loadPrompts } from "../../src/config.js";
import { loadData, indexThemes } from "../../src/data.js";
import { ProposalSchema, VerdictSchema } from "../../src/types.js";
import { loadOriginalLabels } from "../../src/retrieval/context.js";
import { KnowledgeStore, LocalContextService, localCitations } from "../../src/knowledge/store.js";
import { validateProposal, validateVerdict } from "../../src/validation.js";
import { decideRecord } from "../../src/retrieval/decision.js";
import { Logger } from "../../src/logger.js";
import { atomicJson, exists, hash, now, readJson, redact, resolveRoot } from "../../src/utils.js";
import { StopRun } from "../../src/client.js";
import { SuiteBudget } from "../paid-v17/client.js";
import { BatchEngine, verifySessions, type Checkpoint } from "../paid-v17/engine.js";
import { report } from "../paid-v17/report.js";
import { assertBudgetScope } from "../paid-v17/sequence.js";
import { VertexClient } from "./client.js";
import { createVertexSdk, VertexSettingsSchema, vertexEndpoint, vertexError, type VertexSettings } from "./connection.js";

async function hashes() {
  const visit = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.filter(e => e.name !== "node_modules").map(e => e.isDirectory() ? visit(path.join(directory, e.name)) : [path.join(directory, e.name)]))).flat();
  };
  const digest = async (files: string[]) => hash((await Promise.all(files.sort().map(async f => `${path.relative(resolveRoot(), f)}:${hash(await readFile(f, "utf8"))}`))).join("\n"));
  return {
    originalCodeHash: await digest([...await visit(resolveRoot("src")), resolveRoot("package-lock.json")]),
    adapterCodeHash: await digest((await visit(resolveRoot("experiments/paid-v17"))).filter(f => f.endsWith(".ts"))),
    vertexCodeHash: await digest((await visit(import.meta.dirname)).filter(f => f.endsWith(".ts") || /package(?:-lock)?\.json$/.test(f))),
  };
}

async function check(settings: VertexSettings, timeout: number) {
  const sdk = createVertexSdk(settings, timeout), models: object[] = [];
  for (const model of [settings.classifierModel, settings.judgeModel]) {
    const info = await sdk.models.get({ model });
    models.push({ requested: model, name: info.name, displayName: info.displayName, metadataAccess: true });
  }
  return { at: now(), channel: "vertex", authentication: "ADC", project: settings.project, location: settings.location, models, generationTested: false, creditEligibilityVerified: settings.creditEligibilityVerified, creditEvidence: settings.creditEvidence ?? null, note: "Acesso a metadados não comprova autorização de inferência nem aplicação do bônus. Elegibilidade documental do programa não comprova saldo ou abatimento do crédito específico. Não houve generateContent." };
}

async function main() {
  const args = parseArgs({ options: {
    config: { type: "string", default: "config/vertex-v18.json" },
    suite: { type: "string", default: "vertex-v18-359" },
    condition: { type: "string", default: "b20" },
    limit: { type: "string", default: "359" },
    "budget-usd": { type: "string" },
    "shared-budget-suite": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    run: { type: "boolean", default: false },
  } }).values;
  if (!/^[a-z0-9-]{1,60}$/.test(args.suite!) || !/^b(?:1|10|20|30)$/.test(args.condition!)) throw new Error("Suíte ou condição inválida.");
  if ([args["dry-run"], args.check, args.run].filter(Boolean).length !== 1) throw new Error("Escolha exatamente uma ação: --dry-run, --check ou --run.");
  const size = Number(args.condition!.slice(1)), limit = Number(args.limit), budgetUsd = Number(args["budget-usd"]);
  const sharedSuite = args["shared-budget-suite"];
  if (sharedSuite && !/^[a-z0-9-]{1,60}$/.test(sharedSuite)) throw new Error("Suíte de orçamento compartilhado inválida.");
  const sharedRoot = sharedSuite ? resolveRoot("output/paid-v17", sharedSuite) : null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 359) throw new Error("Limite de questões inválido.");
  const settings = VertexSettingsSchema.parse(await readJson(resolveRoot(args.config!)));
  const base = await getConfig(resolveRoot("config/individual-v16-projeto3.json"));
  const code = await hashes();
  const baseline = await readJson<{ codeHash: string }>(resolveRoot("output/experiments/gemini35-v16-projeto2-359/manifest.json"));
  if (code.originalCodeHash !== baseline.codeHash) throw new Error("Código original mudou; confira a preservação da v16.");
  if (args.check) {
    const preflight = await check(settings, 30000);
    await atomicJson(resolveRoot("output/vertex-v18/preflight.json"), preflight);
    return preflight;
  }
  const data = await loadData(), prompts = await loadPrompts(base);
  const ids = data.questions.slice(0, limit).map(q => q.id);
  const plan = { version: 18, channel: "vertex", authentication: "ADC", settings, condition: args.condition, ids, questions: ids.length,
    batchSize: size, batches: Math.ceil(ids.length / size), concurrency: 1, transportAttempts: 1,
    maxAttemptsPerQuestionAndStage: 5, pacing: "reactive_only", budgetUsd: Number.isFinite(budgetUsd) ? budgetUsd : null,
    sharedBudgetSuite: sharedSuite ?? null,
    endpoints: [settings.classifierModel, settings.judgeModel].map(m => vertexEndpoint(settings, m)),
    previousResultsPreserved: true, importsPreviousCheckpoint: false, originalCodePreserved: true, ...code };
  const store = await KnowledgeStore.open(resolveRoot(base.knowledge!.snapshot), data);
  try {
    if (args["dry-run"]) return plan;
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("Defina --budget-usd com teto explícito para este novo experimento Vertex.");
    if (!settings.creditEligibilityVerified || !settings.creditName) throw new Error("Confirme o nome e a elegibilidade do crédito em config/vertex-v18.json antes de iniciar inferência.");
    if (!settings.pricing) throw new Error("Informe preços Vertex verificados em config/vertex-v18.json; preços do AI Studio não serão presumidos iguais.");
    if (sharedRoot) assertBudgetScope([size], budgetUsd, await readJson(`${sharedRoot}/authorization.json`));
    const preflight = await check(settings, 30000);
    const config = structuredClone(base);
    config.classifierModel = settings.classifierModel; config.judgeModel = settings.judgeModel;
    config.batchSize = size; config.maxRequestCharacters = 2000000; config.minIntervalMs = 0; config.retryBaseDelayMs = 0;
    config.direct!.budgetUsd = budgetUsd;
    config.direct!.quotaScope = `vertex-${settings.project}-${settings.location}`;
    for (const role of ["classifier", "judge"] as const) {
      const profile = config.direct![role];
      Object.assign(profile, { inputUsdPerMillion: settings.pricing[role].inputUsdPerMillion, cachedInputUsdPerMillion: settings.pricing[role].cachedInputUsdPerMillion, outputUsdPerMillion: settings.pricing[role].outputUsdPerMillion });
      delete profile.longContext;
      profile.maxOutputTokens = Math.min(65536, base.direct![role].maxOutputTokens * size);
      profile.minIntervalMs = 0;
      delete profile.requestsPerDay;
    }
    const { budgetUsd: _budget, ...direct } = config.direct!;
    const fingerprint = hash(JSON.stringify({ config: { ...config, direct }, settings, ids, inputs: data.inputHashes, prompts: prompts.hashes, code, knowledge: store.manifestHash, channel: "vertex-adc-v18" }));
    const root = resolveRoot("output/vertex-v18", args.suite!), directory = `${root}/${args.condition}`;
    await mkdir(directory, { recursive: true });
    const lockFile = `${root}/run.lock`, lock = await open(lockFile, "wx");
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
      // Each suite has an immutable budget ceiling. Creating another condition
      // in it does not grant a second budget.
      const authorization = `${root}/authorization.json`;
      const budgetFile = sharedRoot ? `${sharedRoot}/spend.json` : `${root}/spend.json`;
      if (await exists(authorization)) {
        const saved = await readJson<{ budgetUsd: number; sharedBudgetSuite?: string | null }>(authorization);
        if (saved.budgetUsd !== budgetUsd || (saved.sharedBudgetSuite ?? null) !== (sharedSuite ?? null)) throw new Error("Teto ou vínculo do orçamento da suíte Vertex mudou. Preserve o orçamento já registrado.");
      } else await atomicJson(authorization, { budgetUsd, sharedBudgetSuite: sharedSuite ?? null, budgetFile, channel: "vertex", project: settings.project, at: now() });
      if (await exists(`${directory}/manifest.json`)) {
        if ((await readJson<{ fingerprint: string }>(`${directory}/manifest.json`)).fingerprint !== fingerprint) throw new Error("Identidade do experimento mudou; use outra suíte.");
      } else {
        await atomicJson(`${directory}/manifest.json`, { ...plan, config, fingerprint, inputHashes: data.inputHashes, promptHashes: prompts.hashes, knowledgeManifestHash: store.manifestHash, createdAt: now() });
        await atomicJson(`${directory}/prompts.json`, prompts);
      }
      await atomicJson(`${directory}/preflight.json`, preflight);
      const checkpoint: Checkpoint = await exists(`${directory}/checkpoint.json`) ? await readJson(`${directory}/checkpoint.json`) : { version: 1, fingerprint, records: Object.fromEntries(ids.map(id => [id, { id, errors: [] }])), sessions: {} };
      if (checkpoint.version !== 1 || checkpoint.fingerprint !== fingerprint || JSON.stringify(Object.keys(checkpoint.records).sort()) !== JSON.stringify([...ids].sort())) throw new Error("Checkpoint Vertex inválido.");
      const service = new LocalContextService(store, data, await loadOriginalLabels(data), config), themes = indexThemes(data.themes);
      verifySessions(checkpoint, service);
      for (const [id, r] of Object.entries(checkpoint.records)) {
        const question = data.questions.find(q => q.id === id)!;
        if (r.id !== id || !Array.isArray(r.errors) || Object.values(r.attempts ?? {}).some(n => !Number.isInteger(n) || n < 0 || n > 5)) throw new Error("Tentativas inválidas.");
        if (r.proposal && validateProposal(ProposalSchema.parse(r.proposal), question, themes).length) throw new Error("Proposta salva inválida.");
        if (r.knowledge) service.validate(r);
        if (r.verdict && (!r.proposal || validateVerdict(VerdictSchema.parse(r.verdict), r.proposal, themes).length || JSON.stringify(r.knowledge?.sourcesUsed) !== JSON.stringify(localCitations(r.verdict, r.knowledge!)))) throw new Error("Parecer salvo inválido.");
        if (r.decision && JSON.stringify(r.decision) !== JSON.stringify(decideRecord(r, question, themes, config))) throw new Error("Decisão salva alterada.");
      }
      const selected = { ...data, questions: data.questions.filter(q => ids.includes(q.id)) };
      const budget = new SuiteBudget(budgetFile, budgetUsd), stopReason: { message?: string } = {};
      const client = new VertexClient(config, new Logger(directory), budget, `${root}/cooldowns`, stopReason, settings);
      const engine = new BatchEngine(selected, config, size, prompts, service, client, checkpoint, directory);
      const startedAt = now(); let stopped: string | null = null;
      await engine.save();
      try { await engine.run(); }
      catch (error) { if (!(error instanceof StopRun)) throw error; stopped = error.message; await engine.save(); }
      const result = await report(directory, selected, checkpoint.records, stopped, client.calls, startedAt);
      const summary = { at: now(), channel: "vertex", completed: result.completed, pending: result.pending.length, stopped, budget: await budget.summary() };
      await atomicJson(`${directory}/last-run.json`, summary);
      if (stopped) process.exitCode = 2;
      return summary;
    } finally { await lock.close(); await unlink(lockFile); }
  } finally { store.close(); }
}
main().then(value => console.log(JSON.stringify(redact(value), null, 2))).catch(error => {
  const e = vertexError(error);
  console.error(JSON.stringify(redact({ error: e.status ? e.raw.error : { message: (error as Error).message }, channel: "vertex" })));
  process.exitCode = 1;
});
