import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { getConfig } from "../src/config.js";
import { loadData, indexThemes, relationship } from "../src/data.js";
import { loadExperiment, loadReference, metrics, type ComparisonRow } from "../src/evaluation.js";
import { experimentDir } from "../src/runner.js";
import { atomicJson, exists, now, resolveRoot } from "../src/utils.js";
import { ConfigSchema, type RecordState } from "../src/types.js";
import { usageCost, type TokenUsage } from "../src/providers/budget.js";
import { permanentQuotaFailure } from "../src/providers/direct.js";

const { values } = parseArgs({ options: { experiment: { type: "string", default: "pagos-v10-gemini-openai" }, limit: { type: "string", default: "10" }, config: { type: "string" }, "report-dir": { type: "string", default: "modelos-pagos-v10" } } });
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("limit deve estar entre 1 e 50.");
const manifestFile = `${experimentDir(values.experiment!)}/manifest.json`;
const manifestConfig = await exists(manifestFile) ? ConfigSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")).config) : null;
const config = values.config ? await getConfig(values.config) : manifestConfig ?? await getConfig(resolveRoot("config/individual-v10-gemini-openai.json"));
if (!config.direct) throw new Error("Relatório exige uma configuração de APIs diretas.");
if (manifestConfig && (manifestConfig.classifierModel !== config.classifierModel || manifestConfig.judgeModel !== config.judgeModel || JSON.stringify(manifestConfig.direct) !== JSON.stringify(config.direct))) throw new Error("Perfis do relatório diferem do manifesto do experimento.");
if (!/^[a-z0-9-]+$/.test(values["report-dir"]!)) throw new Error("Nome de diretório do relatório inválido.");
const data = await loadData(), reference = await loadReference(data, "analise-propria-v2"), themes = indexThemes(data.themes);
const ids = data.questions.slice(0, limit).map(q => q.id), refs = new Map(reference.items.map(r => [r.id, r]));
function rowsFor(records: Record<string, RecordState>): ComparisonRow[] {
  return ids.map(id => {
    const record = records[id], ref = refs.get(id)!, proposed = record?.proposal?.tema_central_id ?? null, final = record?.decision?.tema_central_id ?? null;
    return { id, decisao: record?.decision?.decisao ?? null, tema_proposto: proposed, tema_final: final, tema_referencia: ref.classificacao.tema_id, relacao_proposta: record?.proposal ? relationship(proposed, ref.classificacao.tema_id, themes) : null, relacao_final: record?.decision ? relationship(final, ref.classificacao.tema_id, themes) : null, referencia_limitada: ref.conferencia.possui_ressalva || !!ref.conferencia.fontes_pendentes.length || !!ref.classificacao.limite_especifico, raiz: !!final && themes.get(final)?.nivel === 0, exposicao_previa: ref.exposicao_previa_a_rotulos_ou_pilotos, aviso_entrada: !!data.questions.find(q => q.id === id)?.avisos.length };
  });
}
const baseline = await loadExperiment("local-penal50-v9-classifier-tools", data);
const oldEvents = (await readFile(`${baseline.directory}/events.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
function projection(selected: Set<string>) {
  return Object.fromEntries((["classifier", "judge"] as const).map(role => {
    const events = oldEvents.filter(e => e.type === "usage" && e.data.role === role && e.data.ids.some((id: string) => selected.has(id)));
    const usage = events.reduce((total: TokenUsage, e) => ({ inputTokens: total.inputTokens + (e.data.usage?.prompt_tokens ?? 0), cachedInputTokens: 0, outputTokens: total.outputTokens + (e.data.usage?.completion_tokens ?? 0), reasoningTokens: total.reasoningTokens + (e.data.usage?.completion_tokens_details?.reasoning_tokens ?? 0) }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 });
    const estimatedUsd = events.reduce((sum, e) => sum + usageCost(config.direct![role], { inputTokens: e.data.usage?.prompt_tokens ?? 0, cachedInputTokens: 0, outputTokens: e.data.usage?.completion_tokens ?? 0, reasoningTokens: 0 }), 0);
    return [role, { calls: events.length, usage, hypotheticalUsdAtPaidListPrices: estimatedUsd }];
  }));
}
const dir = experimentDir(values.experiment!), present = await exists(`${dir}/manifest.json`) && await exists(`${dir}/records.json`);
const paid = present ? await loadExperiment(values.experiment!, data) : null;
const lastInvocation = await exists(`${dir}/last-run.json`) ? JSON.parse(await readFile(`${dir}/last-run.json`, "utf8")) : null;
const paidRequests = await exists(`${dir}/requests.jsonl`) ? (await readFile(`${dir}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line)) : [];
const apiFailures = paidRequests.filter(row => row.phase === "response" && row.status >= 400).map(row => {
  const error = JSON.parse(row.body).error;
  const start = paidRequests.find(start => start.phase === "start" && start.requestId === row.requestId);
  return { httpStatus: row.status, provider: start?.provider, code: error?.code, type: error?.type, diagnosis: permanentQuotaFailure(start?.provider, error) ?? `HTTP ${row.status}` };
});
const oldRows = rowsFor(baseline.records), newRows = rowsFor(paid?.records ?? {});
const common = new Set(ids.filter(id => baseline.records[id]?.decision && paid?.records[id]?.decision));
const spend = await exists(`${dir}/spend.json`) ? JSON.parse(await readFile(`${dir}/spend.json`, "utf8")) : null;
const entries = Object.values(spend?.entries ?? {}) as { actualUsd: number | null; reservedUsd: number; state: string }[];
const knownCostUsd = entries.reduce((sum, e) => sum + (e.actualUsd ?? 0), 0);
const paidMetrics = metrics(newRows, data.questions.length);
const citationInventory = ids.flatMap(id => {
  const record = paid?.records[id]; if (!record?.verdict) return [];
  return [{ id, proposedTheme: record.proposal?.tema_central_id, referenceTheme: refs.get(id)!.classificacao.tema_id, proposal: record.proposal, verdict: record.verdict, citedDocuments: (record.knowledge?.sourcesUsed ?? []).map(sourceId => record.knowledge!.chunks.find(chunk => chunk.id === sourceId)), note: "IDs e proveniência validados pelo pipeline; pertinência e correção jurídica exigem conferência semântica." }];
});
const report = {
  at: now(), experiment: values.experiment, ids, referenceVersion: "analise-propria-v2", referenceHash: reference.hash,
  status: paid ? paidMetrics.processed === ids.length ? "completed" : lastInvocation?.stopped ? "stopped" : "partial" : "awaiting_credentials_and_budget",
  lastInvocation, apiFailures,
  models: { classifier: config.classifierModel, judge: config.judgeModel },
  baseline: { name: "local-penal50-v9-classifier-tools", metrics: metrics(oldRows, data.questions.length) },
  paid: { metrics: paidMetrics, pending: ids.filter(id => !paid?.records[id]?.decision), errors: ids.flatMap(id => (paid?.records[id]?.errors ?? []).map(error => ({ id, ...error }))) },
  paired: { completedInBoth: common.size, baseline: metrics(oldRows.filter(r => common.has(r.id)), data.questions.length), paid: metrics(newRows.filter(r => common.has(r.id)), data.questions.length) },
  cost: { knownUsageListPriceEstimateUsd: knownCostUsd, unresolvedCalls: entries.filter(e => e.actualUsd === null).length, chargedOrReservedUsd: entries.reduce((sum, e) => sum + (e.actualUsd ?? e.reservedUsd), 0), perCompletedQuestionUsd: paidMetrics.processed ? knownCostUsd / paidMetrics.processed : null },
  projections: { selected: projection(new Set(ids)), fifty: projection(new Set(data.questions.slice(0, 50).map(q => q.id))), caveat: "Simulação usando tokens dos modelos gratuitos anteriores, sem transferência de cache. Não é previsão de consumo dos novos modelos nem autorização de gasto." },
  controls: paid ? { sameInputs: JSON.stringify(paid.manifest.inputHashes) === JSON.stringify(baseline.manifest.inputHashes), samePrompts: JSON.stringify(paid.manifest.promptHashes) === JSON.stringify(baseline.manifest.promptHashes), sameDatabase: paid.manifest.knowledgeIdentity?.databaseHash === baseline.manifest.knowledgeIdentity?.databaseHash, sameReference: true, sameDecisionModule: "preservado; conferir hashes de src/validation.ts e src/retrieval/decision.ts na migração" } : null,
  caveats: ["Comparação de condições completas: APIs, modelos, raciocínio e tetos de saída diferem; não permite atribuição causal somente ao modelo.", "Concordância com referência provisória não é precisão jurídica real; desempenho em OAB Bench não garante desempenho neste pipeline.", "Reportar concordância exata e por ramo separadamente. Pendências não contam como pareceres nem publicações.", "Valores de custo usam preços versionados e o consumo informado; a fatura do serviço prevalece."],
  rows: { baseline: oldRows, paid: newRows }, citationInventory,
};
const output = resolveRoot("output/comparisons", values["report-dir"]!); await mkdir(output, { recursive: true });
const file = `${values.experiment}-limite-${limit}`;
await atomicJson(`${output}/${file}.json`, report);
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;
const hypothetical = (p: ReturnType<typeof projection>) => Object.values(p).reduce((sum, entry) => sum + entry.hypotheticalUsdAtPaidListPrices, 0).toFixed(2);
await writeFile(`${output}/${file}.md`, `# Comparação de modelos por API direta\n\nEstado: ${report.status}. Modelo classificador: ${config.classifierModel}; juiz: ${config.judgeModel}.\n\n| Condição | Concluídas | Publicadas | Concordância exata entre publicadas | Por ramo | Cobertura |\n| --- | --- | --- | --- | --- | --- |\n| v9 gratuita, mesmos IDs | ${report.baseline.metrics.processed} | ${report.baseline.metrics.published} | ${pct(report.baseline.metrics.exactPublishedAgreement)} | ${pct(report.baseline.metrics.publishedAgreement)} | ${pct(report.baseline.metrics.coverageAmongSelected)} |\n| APIs diretas pagas | ${paidMetrics.processed} | ${paidMetrics.published} | ${pct(paidMetrics.exactPublishedAgreement)} | ${pct(paidMetrics.publishedAgreement)} | ${pct(paidMetrics.coverageAmongSelected)} |\n\nEstimativa pelos tokens efetivamente informados: US$ ${knownCostUsd.toFixed(4)}; chamadas com consumo desconhecido: ${report.cost.unresolvedCalls}. Comparação pareada disponível em ${common.size} IDs concluídos nas duas condições.\n\nSimulação prévia com tokens dos modelos gratuitos: US$ ${hypothetical(report.projections.selected)} para os ${limit} IDs e US$ ${hypothetical(report.projections.fifty)} para cinquenta. Esses valores não são gastos realizados nem previsão garantida.\n\n${report.caveats.map(c => `- ${c}`).join("\n")}\n\nO JSON acompanha resultados por ID e inventário de citações para conferência jurídica. Nenhuma correção jurídica é inferida automaticamente de um ID de fonte válido.\n`);
if (apiFailures.length) await appendFile(`${output}/${file}.md`, `\n## Bloqueios das APIs\n\n${apiFailures.map(failure => `- ${failure.provider}: HTTP ${failure.httpStatus}; ${failure.diagnosis}`).join("\n")}\n\nNenhuma melhoria de qualidade pode ser estimada sem propostas e pareceres concluídos.\n`);
console.log(JSON.stringify({ report: `${output}/${file}.md`, status: report.status, knownCostUsd, projectedSelectedUsd: hypothetical(report.projections.selected), projectedFiftyUsd: hypothetical(report.projections.fifty) }, null, 2));
