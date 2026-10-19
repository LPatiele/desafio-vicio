import { readFile } from "node:fs/promises";
import { z } from "zod";
import { loadData } from "../../src/data.js";
import type { Config, Prepared, RecordState } from "../../src/types.js";
import { ProposalSchema, VerdictSchema } from "../../src/types.js";
import { geminiBody } from "../../src/providers/direct.js";
import { hash, readJson, resolveRoot } from "../../src/utils.js";
import { VertexSettingsSchema, type VertexSettings } from "../vertex-v18/connection.js";
import { messagesFor, type Prompts } from "../no-rag-v19/engine.js";

export const SettingsSchema = z.object({
  baselineManifest: z.literal("output/no-rag-v19/model-only-v19-359/manifest.json"), suite: z.literal("pro-judge-v20-359-r2"), budgetSuite: z.literal("pro-judge-v20-359"),
  classifierModel: z.literal("gemini-3.5-flash-lite"), judgeModel: z.literal("gemini-3.1-pro-preview"),
  classifierReasoning: z.literal("high"), judgeReasoning: z.literal("medium"),
  batchSize: z.literal(1), concurrency: z.literal(1), maxAttemptsPerStage: z.literal(5),
  knowledgeEnabled: z.literal(false), retrievalEnabled: z.literal(false), toolsEnabled: z.literal(false),
  pricingCheckedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  judgePricing: z.object({ inputUsdPerMillion: z.number().nonnegative(), cachedInputUsdPerMillion: z.number().nonnegative(), outputUsdPerMillion: z.number().nonnegative(),
    longContext: z.object({ threshold: z.number().positive(), inputUsdPerMillion: z.number().nonnegative(), cachedInputUsdPerMillion: z.number().nonnegative(), outputUsdPerMillion: z.number().nonnegative() }).strict(), source: z.string().url() }).strict(),
}).strict();
type Baseline = { config: Config; vertex: VertexSettings; inputHashes: Prepared["inputHashes"]; classifierModel: string; fingerprint: string; promptHashes: Record<string, string> };
export function authorizedBudget(saved: { budgetUsd: number } | null, requested: number | null) {
  if (requested !== null && (!Number.isFinite(requested) || requested <= 0)) throw new Error("Teto financeiro inválido.");
  if (!saved && requested === null) throw new Error("O teste individual exige um teto financeiro próprio autorizado (--budget-usd). O teto antigo de US$ 30 era restrito a b30/b20/b10 e não foi reaproveitado.");
  if (saved && requested !== null && saved.budgetUsd !== requested) throw new Error("O teto difere da autorização salva. Uma alteração exige autorização explícita e registro, sem apagar gastos.");
  return saved?.budgetUsd ?? requested!;
}
export async function prepare(limit = 359) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 359) throw new Error("Limite de questões inválido.");
  const settings = SettingsSchema.parse(await readJson(resolveRoot("config/individual-v20-pro-judge.json")));
  const baseline = await readJson<Baseline>(resolveRoot(settings.baselineManifest));
  const universe = await loadData();
  if (JSON.stringify(universe.inputHashes) !== JSON.stringify(baseline.inputHashes) || baseline.classifierModel !== settings.classifierModel || baseline.config.direct?.classifier.reasoningEffort !== settings.classifierReasoning) throw new Error("Entradas ou classificador diferem da configuração a preservar.");
  const config = structuredClone(baseline.config);
  delete config.knowledge; delete config.retrieval; delete config.research;
  config.batchSize = 1; config.classifierModel = settings.classifierModel; config.judgeModel = settings.judgeModel;
  config.maxAttemptsPerStage = 5; config.maxRetries = 0;
  config.direct!.judge.reasoningEffort = settings.judgeReasoning;
  Object.assign(config.direct!.judge, settings.judgePricing);
  // Only pricing fields belong in the direct profile; source is retained in settings.
  delete (config.direct!.judge as unknown as Record<string, unknown>).source;
  config.direct!.pricingCheckedAt = settings.pricingCheckedAt;
  const vertex = VertexSettingsSchema.parse({ ...baseline.vertex, classifierModel: settings.classifierModel, judgeModel: settings.judgeModel,
    pricing: { ...baseline.vertex.pricing, judge: { inputUsdPerMillion: settings.judgePricing.inputUsdPerMillion, cachedInputUsdPerMillion: settings.judgePricing.cachedInputUsdPerMillion, outputUsdPerMillion: settings.judgePricing.outputUsdPerMillion,
      source: settings.judgePricing.source, verifiedAt: `${settings.pricingCheckedAt}T00:00:00.000Z`, note: "Standard PayGo global; preços acima de 200 mil tokens no perfil direct.longContext." } } });
  const prompts = await readJson<Prompts>(resolveRoot("output/no-rag-v19/model-only-v19-359/prompts.json"));
  for (const role of ["classifier", "judge"] as const) if (hash(prompts[role]) !== baseline.promptHashes[role]) throw new Error("Prompts da v19 alterados.");
  const data = { ...universe, questions: universe.questions.slice(0, limit) };
  const sourceFiles = ["config/individual-v20-pro-judge.json", "experiments/individual-v20/plan.ts", "experiments/individual-v20/cli.ts", "experiments/individual-v20/client.ts", "experiments/no-rag-v19/engine.ts", "experiments/vertex-v18/client.ts", "experiments/vertex-v18/connection.ts", "experiments/vertex-v18/package-lock.json", "experiments/paid-v17/client.ts", "experiments/paid-v17/report.ts", "src/providers/direct.ts", "src/providers/budget.ts", "src/providers/serial.ts", "src/logger.ts", "src/client.ts", "src/data.ts", "src/evaluation.ts", "src/validation.ts", "src/types.ts", "src/retrieval/decision.ts", "src/utils.ts", "package-lock.json"];
  const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(resolveRoot(file), "utf8"))])));
  // Budget authorization is a separate control and is not a change of model identity.
  const identityConfig = structuredClone(config); delete (identityConfig.direct as unknown as Record<string, unknown>).budgetUsd;
  const fingerprint = hash(JSON.stringify({ settings, config: identityConfig, vertex, ids: data.questions.map(q => q.id), inputHashes: data.inputHashes, prompts, sources }));
  return { settings, config, vertex, data, universe, prompts, sources, fingerprint, baselineFingerprint: baseline.fingerprint };
}

/** Offline scenario estimate; old proposals are used only for approximate judge input size. */
export async function estimate(prepared: Awaited<ReturnType<typeof prepare>>) {
  const { data, config, prompts } = prepared;
  const previous = await readJson<Record<string, RecordState>>(resolveRoot("output/no-rag-v19/model-only-v19-359/records.json"));
  const events = (await readFile(resolveRoot("output/no-rag-v19/model-only-v19-359/events.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line)).filter(e => e.type === "usage");
  const starts = (await readFile(resolveRoot("output/no-rag-v19/model-only-v19-359/requests.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line)).filter(e => e.phase === "start");
  const result: Record<string, { inputTokens: number; outputTokensScenario: number; uncachedUsd: number; ninetyPercentInputCachedUsd: number }> = {};
  for (const role of ["classifier", "judge"] as const) {
    const usage = events.filter(e => e.data.role === role), requests = starts.filter(r => r.role === role);
    const oldInput = usage.reduce((s, e) => s + e.data.usage.promptTokenCount, 0);
    const bytes = requests.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r.body), "utf8"), 0);
    const ratio = oldInput / bytes;
    let inputBytes = 0;
    for (const q of data.questions) {
      const records = { [q.id]: { id: q.id, errors: [], ...(role === "judge" ? { proposal: previous[q.id]!.proposal } : {}) } };
      const messages = messagesFor(role, [q.id], records, data, config, prompts);
      const schema = z.object({ resultados: z.array(role === "classifier" ? ProposalSchema : VerdictSchema).min(1).max(1) }).strict();
      inputBytes += Buffer.byteLength(JSON.stringify(geminiBody(role === "classifier" ? config.classifierModel : config.judgeModel, config.direct![role], messages, schema)), "utf8");
    }
    const inputTokens = Math.ceil(inputBytes * ratio);
    // A scenario, not a prediction: preserve classifier output+thinking rate from v19;
    // allow 2,000 output+thinking tokens per question for the previously untested Pro judge.
    const outputTokensScenario = role === "judge" ? 2000 * data.questions.length : Math.ceil(usage.reduce((s, e) => s + (e.data.usage.candidatesTokenCount ?? 0) + (e.data.usage.thoughtsTokenCount ?? 0), 0) / 359 * data.questions.length);
    const profile = config.direct![role];
    result[role] = { inputTokens, outputTokensScenario,
      uncachedUsd: (inputTokens * profile.inputUsdPerMillion + outputTokensScenario * profile.outputUsdPerMillion) / 1e6,
      ninetyPercentInputCachedUsd: (inputTokens * (0.1 * profile.inputUsdPerMillion + 0.9 * profile.cachedInputUsdPerMillion) + outputTokensScenario * profile.outputUsdPerMillion) / 1e6 };
  }
  return { roles: result, uncachedUsd: Object.values(result).reduce((s, r) => s + r.uncachedUsd, 0), ninetyPercentInputCachedUsd: Object.values(result).reduce((s, r) => s + r.ninetyPercentInputCachedUsd, 0),
    assumptions: "Sem retentativas; tamanho de entrada estimado pela razão tokens/bytes observada na v19. Juiz Pro: cenário de 2.000 tokens de resposta+raciocínio por questão. Cache de 90% é cenário hipotético, não garantia. Preços brutos; abatimento do Free Trial não verificado." };
}
