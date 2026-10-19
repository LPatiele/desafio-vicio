import { readFile, mkdir, writeFile } from "node:fs/promises";
import { loadData, indexThemes, relationship } from "../src/data.js";
import { loadExperiment, loadReference, metrics, type ComparisonRow } from "../src/evaluation.js";
import { KnowledgeStore, LocalContextService, localCitations } from "../src/knowledge/store.js";
import { loadOriginalLabels } from "../src/retrieval/context.js";
import { validateProposal, validateVerdict } from "../src/validation.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { verifySessions, type Checkpoint } from "../experiments/paid-v17/engine.js";
import type { Config, RecordState } from "../src/types.js";
import { atomicJson, csvCell, now, readJson, resolveRoot } from "../src/utils.js";

const data = await loadData(), themes = indexThemes(data.themes);
const baseline = await loadExperiment("gemini35-v16-projeto2-359", data);
const root = resolveRoot("output/paid-v17/paid-v17-359"), batchDirectory = `${root}/b30`;
const manifest = await readJson<{ config: Config; knowledgeIdentity: { manifestHash: string } }>(`${batchDirectory}/manifest.json`);
const checkpoint = await readJson<Checkpoint>(`${batchDirectory}/checkpoint.json`), batch = checkpoint.records;
const store = await KnowledgeStore.open(resolveRoot(manifest.config.knowledge!.snapshot), data);
try {
  if (store.manifestHash !== manifest.knowledgeIdentity.manifestHash) throw new Error("Base alterada.");
  const service = new LocalContextService(store, data, await loadOriginalLabels(data), manifest.config);
  verifySessions(checkpoint, service);
  for (const q of data.questions) {
    const r = batch[q.id]!;
    if (r.proposal && validateProposal(r.proposal, q, themes).length) throw new Error(`Proposta inválida: ${q.id}`);
    if (r.knowledge) service.validate(r);
    if (r.verdict && (!r.proposal || validateVerdict(r.verdict, r.proposal, themes).length || JSON.stringify(localCitations(r.verdict, r.knowledge!)) !== JSON.stringify(r.knowledge!.sourcesUsed))) throw new Error(`Parecer inválido: ${q.id}`);
    if (r.decision && JSON.stringify(r.decision) !== JSON.stringify(decideRecord(r, q, themes, manifest.config))) throw new Error(`Decisão alterada: ${q.id}`);
  }
} finally { store.close(); }
const reference = await loadReference(data, "analise-propria-v2"), byId = new Map(reference.items.map(r => [r.id, r]));
function rows(records: Record<string, RecordState>): ComparisonRow[] {
  return data.questions.map(q => {
    const r = records[q.id], ref = byId.get(q.id)!, proposed = r?.proposal?.tema_central_id ?? null, final = r?.decision?.tema_central_id ?? null;
    return { id: q.id, decisao: r?.decision?.decisao ?? null, tema_proposto: proposed, tema_final: final, tema_referencia: ref.classificacao.tema_id,
      relacao_proposta: r?.proposal ? relationship(proposed, ref.classificacao.tema_id, themes) : null,
      relacao_final: r?.decision ? relationship(final, ref.classificacao.tema_id, themes) : null,
      referencia_limitada: ref.conferencia.possui_ressalva || !!ref.conferencia.fontes_pendentes.length || !!ref.classificacao.limite_especifico,
      raiz: ref.classificacao.nivel === 0 || !!final && themes.get(final)?.nivel === 0, exposicao_previa: ref.exposicao_previa_a_rotulos_ou_pilotos, aviso_entrada: !!q.avisos.length };
  });
}
const left = rows(baseline.records), right = rows(batch);
const baselineCompleted = new Set(left.filter(r => r.decisao).map(r => r.id));
const commonCompleted = new Set(right.filter(r => r.decisao && baselineCompleted.has(r.id)).map(r => r.id));
const commonPublished = new Set(right.filter(r => r.decisao === "publicar" && baseline.records[r.id]?.decision?.decisao === "publicar").map(r => r.id));
const on = (values: ComparisonRow[], ids: Set<string>) => metrics(values.filter(r => ids.has(r.id)), 359);
const jsonl = async (file: string): Promise<any[]> => (await readFile(file, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const baselineRequests = await jsonl(`${baseline.directory}/requests.jsonl`), baselineEvents = await jsonl(`${baseline.directory}/events.jsonl`);
const batchRequests = [...await jsonl(`${root}/archive/b30-initial-400/requests.jsonl`), ...await jsonl(`${batchDirectory}/requests.jsonl`)];
const diagnosticRequests = await jsonl(`${root}/diagnostics/schema/requests.jsonl`);
const baseLedger = (await readJson<any>(`${baseline.directory}/spend.json`)).entries, suiteLedger = (await readJson<any>(`${root}/spend.json`)).entries;
function cost(requests: any[], ledger: any) {
  const starts = requests.filter(r => r.phase === "start"), ids = new Set(starts.map(r => r.requestId));
  const entries = [...ids].map(id => { if (!ledger[id]) throw new Error(`Reserva não encontrada: ${id}`); return ledger[id]; });
  return { calls: ids.size, knownEstimatedUsd: entries.reduce((n, e) => n + (e.actualUsd ?? 0), 0), chargedOrReservedUsd: entries.reduce((n, e) => n + (e.actualUsd ?? e.reservedUsd), 0), unknownUsageCalls: entries.filter(e => e.actualUsd === null).length,
    httpErrors: requests.filter(r => r.phase === "response" && r.status >= 400).map(r => ({ requestId: r.requestId, status: r.status })),
    inputTokensKnown: entries.reduce((n, e) => n + (e.usage?.inputTokens ?? 0), 0), outputTokensKnown: entries.reduce((n, e) => n + (e.usage?.outputTokens ?? 0), 0) };
}
const finalReport = await readJson<any>(`${batchDirectory}/report-first-pass.json`);
const start = batchRequests.find(r => r.phase === "start").at, end = finalReport.at;
const during = (at: string) => at >= start && at <= end;
const baseInWindow = baselineRequests.filter(r => r.phase !== "start" || during(r.at));
const windowRequestIds = new Set(baseInWindow.filter(r => r.phase === "start").map(r => r.requestId));
const windowRequests = baselineRequests.filter(r => windowRequestIds.has(r.requestId));
const originalCompletedInWindow = [...new Set(baselineEvents.filter(e => during(e.at) && e.type === "validation" && e.data?.role === "judge").flatMap(e => e.data.ids.filter((id: string) => !e.data.errors[id] && baseline.records[id]?.verdict)))];
const fullSeconds = (Date.parse(end) - Date.parse(start)) / 1000;
const nativeCost = cost(batchRequests, suiteLedger), diagnosticCost = cost(diagnosticRequests, suiteLedger), totalBatchCost = cost([...batchRequests, ...diagnosticRequests], suiteLedger), originalWindowCost = cost(windowRequests, baseLedger);
const failed = Object.values(batch).filter(r => !r.decision);
const hasError = (r: RecordState, expression: RegExp) => r.errors.some(e => expression.test(e.message));
const failures = { attempted: Object.values(batch).filter(r => r.attempts?.classifier).length, pending: failed.length,
  classifierExhausted: failed.filter(r => !r.proposal && (r.attempts?.classifier ?? 0) >= 5).length,
  missingPerIdRetrieval: failed.filter(r => hasError(r, /sem consulta válida/)).length,
  missingOutputId: failed.filter(r => hasError(r, /ID ausente/)).length,
  evidenceFailure: failed.filter(r => hasError(r, /Evidência não localizada|Unrecognized key/)).length,
  note: "Categorias podem se sobrepor; a contagem é de IDs distintos, não eventos de retentativa." };
const baselineSubsetCost = cost(baselineRequests.filter(r => r.phase !== "start" || commonCompleted.has(r.ids?.[0])), baseLedger);
const all = { at: now(), baselineSnapshot: { completed: baselineCompleted.size, overall: metrics(left, 359) },
  b30: { overall: metrics(right, 359), failures, nativeCost, diagnosticCost, totalCostIncludingDiagnostics: totalBatchCost,
    time: { firstAttemptAt: start, correctedInvocationAt: finalReport.startedAt, finishedAt: end, endToEndSeconds: fullSeconds, correctedInvocationSeconds: finalReport.durationSeconds, validDecisionsPerMinute: 161 / (fullSeconds / 60), note: "Inclui a interrupção para diagnóstico e correção. Nenhuma pausa entre intervenções foi subtraída." } },
  paired: { baselineCompletedIds: { n: baselineCompleted.size, original: on(left, baselineCompleted), b30: on(right, baselineCompleted) },
    commonCompletedIds: { n: commonCompleted.size, original: on(left, commonCompleted), b30: on(right, commonCompleted) },
    commonPublishedIds: { n: commonPublished.size, original: on(left, commonPublished), b30: on(right, commonPublished) } },
  simultaneousWindow: { from: start, to: end, seconds: fullSeconds, originalCompleted: originalCompletedInWindow.length, b30Completed: 161, throughputRatio: 161 / originalCompletedInWindow.length,
    originalCost: originalWindowCost, b30CostIncludingDiagnostics: totalBatchCost,
    originalKnownCostPerDecision: originalWindowCost.knownEstimatedUsd / originalCompletedInWindow.length,
    b30KnownCostPerDecision: totalBatchCost.knownEstimatedUsd / 161,
    originalChargedOrReservedPerDecision: originalWindowCost.chargedOrReservedUsd / originalCompletedInWindow.length,
    b30ChargedOrReservedPerDecision: totalBatchCost.chargedOrReservedUsd / 161 },
  limits: ["O original ainda está em execução; a comparação de qualidade é um retrato nos IDs disponíveis.", "Mesma janela de tempo não implica mesmas questões; custo/velocidade são descritivos, não experimento isolado.", "Houve mudança de lote, pausas, contrato de ferramentas e teto de saída; não se pode atribuir o efeito só ao tamanho do lote.", "Precisão significa concordância com referência provisória. Não é conferência jurídica externa nem garantia de 95%.", "Custos são estimativas pelos preços configurados, não uma fatura da Google. Consumo desconhecido permanece reservado.", "198 falhas de execução no b30 impedem interpretar a passagem pelas 359 como 359 classificações concluídas."] };
const directory = resolveRoot("output/comparisons/v16-v17-b30"); await mkdir(directory, { recursive: true });
await atomicJson(`${directory}/analysis.json`, all);
const headers = ["id", "original_decisao", "original_tema", "original_relacao", "b30_decisao", "b30_tema", "b30_relacao", "classifier_tentativas_b30", "erros_b30"];
await writeFile(`${directory}/items.csv`, [headers.join(","), ...data.questions.map(q => {
  const l = left.find(r => r.id === q.id)!, r = right.find(r => r.id === q.id)!;
  return [q.id, l.decisao, l.tema_final, l.relacao_final, r.decisao, r.tema_final, r.relacao_final, batch[q.id]?.attempts?.classifier, batch[q.id]?.errors.map(e => e.message).join(" | ")].map(csvCell).join(",");
})].join("\n") + "\n");
console.log(JSON.stringify(all, null, 2));
