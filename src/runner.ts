import { readFile, readdir, open, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { ProposalSchema, VerdictSchema, type Config, type Prepared, type RecordState } from "./types.js";
import { atomicJson, exists, hash, now, readJson, resolveRoot } from "./utils.js";
import { loadPrompts } from "./config.js";
import { createGraph } from "./graph.js";
import { Logger } from "./logger.js";
import { OpenRouterClient, preflight, StopRun } from "./client.js";
import { DirectClient } from "./providers/direct.js";
import { SpendBudget } from "./providers/budget.js";
import { sharedContext } from "./nodes/especialista.js";
import { indexThemes } from "./data.js";
import { validateProposal, validateVerdict } from "./validation.js";
import { decideRecord } from "./retrieval/decision.js";
import { ContextService, loadOriginalLabels, validateContextCheckpoint } from "./retrieval/context.js";
import { LexmlApi } from "./retrieval/lexml-api.js";
import { KnowledgeStore, LocalContextService, validateLocalCheckpoint } from "./knowledge/store.js";
import { LexmlClient } from "./mcp/lexml-client.js";
import { ResearchSession } from "./research/session.js";
import { validateResearchCheckpoint } from "./research/checkpoint.js";

export type Manifest = {
  version: 1; createdAt: string; fingerprint: string; config: Config;
  inputHashes: Record<string, string>; promptHashes: Record<string, string>;
  codeHash: string; splitHash: string | null;
  importedProposals?: ProposalImport;
  researchIdentity?: unknown;
  knowledgeIdentity?: { manifestHash: string; databaseHash: string };
};
export type ProposalImport = { experiment: string; manifestHash: string; recordsHash: string; ids: string[]; proposalHashes: Record<string, string> };
export async function importProposals(name: string, data: Prepared, ids: string[]) {
  const source = experimentDir(name);
  const manifestText = await readFile(path.join(source, "manifest.json"), "utf8");
  const recordsText = await readFile(path.join(source, "records.json"), "utf8");
  const manifest = JSON.parse(manifestText) as Manifest;
  if (JSON.stringify(manifest.inputHashes) !== JSON.stringify(data.inputHashes)) throw new Error("Importação usa entradas diferentes.");
  const records = JSON.parse(recordsText) as Record<string, RecordState>;
  const imported: Record<string, RecordState> = {};
  const themes = indexThemes(data.themes);
  for (const id of ids) {
    const proposal = ProposalSchema.parse(records[id]?.proposal);
    const q = data.questions.find(q => q.id === id);
    if (proposal.id !== id || !q || validateProposal(proposal, q, themes).length) throw new Error(`Proposta importada inválida: ${id}`);
    imported[id] = { id, proposal, errors: [] };
  }
  const provenance: ProposalImport = { experiment: name, manifestHash: hash(manifestText), recordsHash: hash(recordsText), ids, proposalHashes: Object.fromEntries(ids.map(id => [id, hash(JSON.stringify(imported[id]!.proposal))])) };
  return { records: imported, provenance };
}
export function experimentDir(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) throw new Error("Nome de experimento inválido.");
  return resolveRoot("output/experiments", name);
}
async function sourceHash(): Promise<string> {
  const visit = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const groups = await Promise.all(entries.map(e => e.isDirectory() ? visit(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    return groups.flat();
  };
  const files = [...await visit(resolveRoot("src")), resolveRoot("package-lock.json")].sort();
  return hash((await Promise.all(files.map(async file => `${path.relative(resolveRoot(), file)}:${hash(await readFile(file, "utf8"))}`))).join("\n"));
}
export function batchIds(ids: string[], data: Prepared, config: Config, records: Record<string, RecordState>): string[][] {
  const overhead = sharedContext(data, config).length + 22000 + (config.retrieval?.enabled ? 2 * config.retrieval.maxContextCharacters : config.knowledge?.enabled ? 2 * config.knowledge.maxContextCharacters : 0); // prompt, schema, envelope and escape headroom
  const batches: string[][] = [];
  let current: string[] = [], size = overhead;
  for (const id of ids) {
    const question = data.questions.find(q => q.id === id)!;
    const itemSize = JSON.stringify(question).length + JSON.stringify(records[id]?.proposal ?? {}).length + 6000;
    if (overhead + itemSize > config.maxRequestCharacters) throw new Error(`Questão ${id} excede o orçamento de tamanho sozinha.`);
    if (current.length && (current.length >= config.batchSize || size + itemSize > config.maxRequestCharacters)) {
      batches.push(current); current = []; size = overhead;
    }
    current.push(id); size += itemSize;
  }
  if (current.length) batches.push(current);
  return batches;
}
export async function runExperiment(name: string, data: Prepared, config: Config, ids: string[], subset: string, dry = false, proposalsFrom?: string) {
  const dir = experimentDir(name);
  if (proposalsFrom && config.knowledge?.enabled && config.knowledge.classifierMode === "tools") throw new Error("Experimento do classificador com consultas exige propostas novas; não importe propostas antigas.");
  if (proposalsFrom === name) throw new Error("Origem das propostas deve ser outro experimento.");
  const seed = proposalsFrom ? await importProposals(proposalsFrom, data, ids) : undefined;
  if (dry) {
    if (config.knowledge?.enabled) { const store = await KnowledgeStore.open(resolveRoot(config.knowledge.snapshot), data); try { for (const id of ids) store.gapsFor(id); } finally { store.close(); } }
    const batches = batchIds(ids, data, config, seed?.records ?? {});
    const stages = seed ? 1 : 2;
    return { dryRun: true, models: [config.classifierModel, config.judgeModel], questions: ids.length, batchSizes: batches.map(b => b.length), minimumCalls: batches.length * (stages + (config.research?.enabled || config.knowledge?.enabled && config.knowledge.mode === "judge_tools" ? 1 : 0) + (!seed && config.knowledge?.enabled && config.knowledge.classifierMode === "tools" ? 1 : 0)), importedProposals: seed?.provenance,
      maxAttemptsPerStage: config.maxAttemptsPerStage, maximumCallsWithRetries: batches.length * stages * Math.max(config.maxAttemptsPerStage, config.maxRetries + 1), maxCalls: config.maxCalls,
      ...(config.retrieval?.enabled ? { externalApi: { provider: "LexML SRU", maximumHttpRequests: ids.length * config.retrieval.maxRequestsPerQuestion, note: "Consultas HTTP não consomem chamadas OpenRouter; cache e deduplicação podem reduzir esse total." } } : {}),
      ...(config.knowledge?.enabled ? { localKnowledge: { snapshot: config.knowledge.snapshot, networkCallsForRetrieval: 0 } } : {}),
      ...(config.direct ? { directApis: { classifier: config.direct.classifier.provider, judge: config.direct.judge.provider, budgetUsd: config.direct.budgetUsd, pricingCheckedAt: config.direct.pricingCheckedAt } } : {}) };
  }
  await mkdir(dir, { recursive: true });
  const lockFile = path.join(dir, "run.lock");
  let lock;
  try { lock = await open(lockFile, "wx"); }
  catch { throw new Error("Experimento já está em execução ou possui trava de execução interrompida. Confira o processo antes de remover run.lock."); }
  let mcp: LexmlClient | undefined;
  let localStore: KnowledgeStore | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
    const prompts = await loadPrompts(config);
    const splitFile = resolveRoot("output/split.json");
    const splitHash = await exists(splitFile) ? hash(await readFile(splitFile, "utf8")) : null;
    const codeHash = await sourceHash();
    if (config.research?.enabled) mcp = await LexmlClient.connect(config.research);
    const researchIdentity = mcp?.identity;
    if (config.knowledge?.enabled) localStore = await KnowledgeStore.open(resolveRoot(config.knowledge.snapshot), data);
    if (localStore) for (const id of ids) localStore.gapsFor(id);
    const knowledgeIdentity = localStore ? { manifestHash: localStore.manifestHash, databaseHash: localStore.manifest.databaseHash } : undefined;
    // Execution budget/timing may change on resume; scientific configuration may not.
    const { maxCalls: _a, minIntervalMs: _b, timeoutMs: _c, maxRetries: _d, retryBaseDelayMs: _e, requestsPerMinute: _f, ...scientificConfig } = config;
    if (scientificConfig.direct) {
      const { budgetUsd: _budget, quotaScope: _scope, ...direct } = scientificConfig.direct;
      const profile = (p: typeof direct.classifier) => { const { requestsPerMinute: _rpm, minIntervalMs: _interval, tokensPerMinute: _tpm, requestsPerDay: _rpd, dailyResetTimeZone: _zone, ...scientific } = p; return scientific; };
      // Spending/rate controls may change on resume; models, prices, token caps
      // and reasoning remain part of the scientific identity.
      Object.assign(scientificConfig, { direct: { ...direct, classifier: profile(direct.classifier), judge: profile(direct.judge) } });
    }
    const fingerprint = hash(JSON.stringify({ scientificConfig, inputs: data.inputHashes, prompts: prompts.hashes, codeHash, splitHash, ...(seed ? { importedProposals: seed.provenance } : {}), ...(mcp ? { researchIdentity } : {}), ...(knowledgeIdentity ? { knowledgeIdentity } : {}) }));
    const manifestPath = path.join(dir, "manifest.json");
    if (await exists(manifestPath)) {
      const previous = await readJson<Manifest>(manifestPath);
      if (previous.fingerprint !== fingerprint) throw new Error("Configuração, código, prompts, divisão ou entradas mudaram. Use outro nome de experimento para preservar a comparação.");
    } else {
      await atomicJson(manifestPath, { version: 1, createdAt: now(), fingerprint, config, inputHashes: data.inputHashes, promptHashes: prompts.hashes, codeHash, splitHash, ...(seed ? { importedProposals: seed.provenance } : {}), ...(mcp ? { researchIdentity } : {}), ...(knowledgeIdentity ? { knowledgeIdentity } : {}) } satisfies Manifest);
      await atomicJson(path.join(dir, "prompts.json"), { classifier: prompts.classifier, judge: prompts.judge });
    }
    const logger = new Logger(dir);
    const statesPath = path.join(dir, "records.json");
    let records = await exists(statesPath) ? await readJson<Record<string, RecordState>>(statesPath) : seed?.records ?? {};
    const themes = indexThemes(data.themes);
    const originalLabels = config.retrieval?.enabled || config.knowledge?.enabled ? await loadOriginalLabels(data) : new Map();
    const localContext = localStore ? new LocalContextService(localStore, data, originalLabels, config) : undefined;
    for (const [id, record] of Object.entries(records)) {
      const q = data.questions.find(q => q.id === id);
      if (!q || record.id !== id || !Array.isArray(record.errors)) throw new Error(`Checkpoint inválido: ${id}`);
      if (record.attempts && (Object.keys(record.attempts).some(key => !["classifier", "judge"].includes(key)) || Object.values(record.attempts).some(n => !Number.isInteger(n) || n < 0 || n > config.maxAttemptsPerStage))) throw new Error(`Contador de tentativas inválido: ${id}`);
      validateResearchCheckpoint(record, config);
      validateContextCheckpoint(record, config, originalLabels.get(id), themes);
      validateLocalCheckpoint(record, config, localContext);
      if (record.proposal) {
        ProposalSchema.parse(record.proposal);
        if (validateProposal(record.proposal, q, themes).length) throw new Error(`Proposta salva inválida: ${id}`);
      }
      if (record.verdict) {
        if (config.research?.enabled && record.research?.status !== "complete") throw new Error(`Parecer sem pesquisa concluída: ${id}`);
        VerdictSchema.parse(record.verdict);
        if (!record.proposal || validateVerdict(record.verdict, record.proposal, themes).length) throw new Error(`Parecer salvo inválido: ${id}`);
      }
      if (record.decision && JSON.stringify(decideRecord(record, q, themes, config)) !== JSON.stringify(record.decision)) throw new Error(`Decisão salva difere das regras: ${id}`);
    }
    for (const id of ids) records[id] ??= { id, errors: [] };
    await atomicJson(statesPath, records);
    await logger.event("invocation", { ids, subset, config, fingerprint });
    if (seed) await logger.event("imported_proposals", seed.provenance);
    const pending = ids.filter(id => !records[id]?.decision);
    if (!pending.length) return { complete: true, questions: ids.length, calls: 0 };
    const check = await preflight(config);
    await logger.event("preflight", check);
    const spend = config.direct ? await SpendBudget.open(path.join(dir, "spend.json"), config.direct.budgetUsd, config.maxCalls) : undefined;
    const caller = spend ? new DirectClient(config, logger, spend) : new OpenRouterClient(config, logger, check.quota?.remaining ?? null, undefined, check.quota?.limit ?? null);
    const save = async (updated: Record<string, RecordState>) => { records = updated; await atomicJson(statesPath, records); };
    const research = mcp && config.research ? new ResearchSession(mcp, config.research, logger, path.join(dir, "research")) : undefined;
    const api = config.retrieval?.enabled ? new LexmlApi(config.retrieval) : undefined;
    const context = api ? new ContextService(config, data, originalLabels, api) : localContext;
    const graph = createGraph({ config, data, caller, prompts, logger, save, research, context, localKnowledge: localContext });
    let stopped: string | null = null;
    try {
      // Valid outputs are immutable; single-question attempts persist across invocations.
      const ordered = [...pending.filter(id => records[id]?.proposal), ...pending.filter(id => !records[id]?.proposal)];
      for (const batch of batchIds(ordered, data, config, records)) {
        const result = await graph.invoke({ ids: batch, records });
        records = result.records;
      }
    } catch (error) {
      if (!(error instanceof StopRun)) throw error;
      stopped = error.message;
      await logger.event("stopped", { message: stopped });
    }
    const complete = ids.filter(id => records[id]?.decision).length;
    const summary = { selected: ids.length, completed: complete, pending: ids.filter(id => !records[id]?.decision), calls: caller.calls, ...(spend ? { spending: spend.summary() } : {}), ...(api ? { apiCalls: api.calls } : {}), stopped };
    await atomicJson(path.join(dir, "last-run.json"), summary);
    return summary;
  } finally {
    try { await mcp?.close(); }
    finally { try { localStore?.close(); } finally { await lock.close(); await unlink(lockFile); } }
  }
}
