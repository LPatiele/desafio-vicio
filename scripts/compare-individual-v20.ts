import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadData, indexThemes, relationship } from "../src/data.js";
import { loadReference, metrics, type ComparisonRow } from "../src/evaluation.js";
import type { RecordState } from "../src/types.js";
import { atomicJson, exists, hash, now, resolveRoot } from "../src/utils.js";

const { values } = parseArgs({ options: { limit: { type: "string", default: "359" } } });
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 359) throw new Error("Limite inválido.");
const data = await loadData(), reference = await loadReference(data, "analise-propria-v2"), themes = indexThemes(data.themes);
const expected = new Map(reference.items.map(r => [r.id, r]));
const conditions = ["output/no-rag-v19/model-only-v19-359", "output/individual-v20/pro-judge-v20-359-r2"];
const results = [];
for (const source of conditions) {
  const records = JSON.parse(await readFile(resolveRoot(source, "records.json"), "utf8")) as Record<string, RecordState>;
  const rows: ComparisonRow[] = data.questions.slice(0, limit).map(q => {
    const record = records[q.id], ref = expected.get(q.id)!;
    const proposed = record?.proposal?.tema_central_id ?? null, final = record?.decision?.tema_central_id ?? null;
    return { id: q.id, decisao: record?.decision?.decisao ?? null, tema_proposto: proposed, tema_final: final, tema_referencia: ref.classificacao.tema_id,
      relacao_proposta: record?.proposal ? relationship(proposed, ref.classificacao.tema_id, themes) : null,
      relacao_final: record?.decision ? relationship(final, ref.classificacao.tema_id, themes) : null,
      referencia_limitada: ref.conferencia.possui_ressalva || !!ref.conferencia.fontes_pendentes.length || !!ref.classificacao.limite_especifico,
      raiz: ref.classificacao.nivel === 0 || !!final && themes.get(final)?.nivel === 0,
      exposicao_previa: ref.exposicao_previa_a_rotulos_ou_pilotos, aviso_entrada: !!q.avisos.length };
  });
  const requests = (await readFile(resolveRoot(source, "requests.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const manifest = JSON.parse(await readFile(resolveRoot(source, "manifest.json"), "utf8"));
  const requestIds = new Set(requests.filter(r => r.phase === "start").map(r => r.requestId));
  const budgetFile = source.includes("individual-v20") ? path.join(manifest.budgetDirectory, "spend.json") : resolveRoot("output/paid-v17/paid-v17-359/spend.json");
  const ledger = JSON.parse(await readFile(budgetFile, "utf8"));
  const own = Object.entries(ledger.entries).filter(([id]) => requestIds.has(id)).map(([, entry]) => entry as { actualUsd: number | null; reservedUsd: number });
  const selectedIds = new Set(rows.map(r => r.id));
  const scopedStarts = requests.filter(r => r.phase === "start" && r.ids.every((id: string) => selectedIds.has(id)));
  const scopedRequestIds = new Set(scopedStarts.map(r => r.requestId));
  const scopedEntries = Object.entries(ledger.entries).filter(([id]) => scopedRequestIds.has(id)).map(([, entry]) => entry as { actualUsd: number | null; reservedUsd: number });
  const scopedResponses = requests.filter(r => r.phase === "response" && scopedRequestIds.has(r.requestId));
  const intervalSeconds = scopedStarts.length && scopedResponses.length ? (Date.parse(scopedResponses.at(-1).at) - Date.parse(scopedStarts[0].at)) / 1000 : null;
  const crossingCalls = requests.filter(r => r.phase === "start" && r.ids.some((id: string) => selectedIds.has(id)) && !r.ids.every((id: string) => selectedIds.has(id))).length;
  const finalFile = resolveRoot(source, "last-run.json");
  results.push({ source, fingerprint: manifest.fingerprint, state: await exists(resolveRoot(source, "run.lock")) ? "running" : await exists(finalFile) ? JSON.parse(await readFile(finalFile, "utf8")) : "unknown",
    recordsHash: hash(JSON.stringify(records)), metrics: metrics(rows, 359), rows,
    pendingInScope: rows.filter(r => !r.decisao).map(r => r.id),
    scopedPerformance: { calls: scopedStarts.length, knownUsd: scopedEntries.reduce((s, e) => s + (e.actualUsd ?? 0), 0), reservedUnknownUsd: scopedEntries.filter(e => e.actualUsd === null).reduce((s, e) => s + e.reservedUsd, 0), intervalSeconds, crossingBoundaryCalls: crossingCalls,
      note: "Custos de chamadas cujos IDs pertencem integralmente ao recorte. Para comparar custo e tempo sem cruzar lotes, escolha um limite múltiplo de dez ou o universo completo. Intervalo de relógio inclui esperas, retentativas e pausas entre retomadas." },
    costEntireInvocation: { calls: requestIds.size, knownUsd: own.reduce((s, e) => s + (e.actualUsd ?? 0), 0), chargedOrReservedUsd: own.reduce((s, e) => s + (e.actualUsd ?? e.reservedUsd), 0), unresolved: own.filter(e => e.actualUsd === null).length } });
}
const common = new Set(results[0]!.rows.filter(row => row.decisao && results[1]!.rows.find(other => other.id === row.id)?.decisao).map(r => r.id));
const commonPublished = new Set(results[0]!.rows.filter(row => row.decisao === "publicar" && results[1]!.rows.find(other => other.id === row.id)?.decisao === "publicar").map(r => r.id));
const report = { at: now(), limit, referenceVersion: "analise-propria-v2", referenceHash: reference.hash,
  conditions: results, paired: { completedIds: [...common], publishedIds: [...commonPublished],
    completed: results.map(r => metrics(r.rows.filter(row => common.has(row.id)), 359)),
    published: results.map(r => metrics(r.rows.filter(row => commonPublished.has(row.id)), 359)) },
  limits: ["Referência própria provisória; concordância não demonstra precisão jurídica real.", "Juiz e lote mudam juntos; as propostas são novas mesmo com o mesmo classificador. Não identifica o efeito isolado do juiz.", "A tabela de custo/tempo usa chamadas integralmente dentro do recorte; costEntireInvocation no JSON também informa a invocação inteira. Valores estimados, não conferência de fatura.", "Um recorte parcial não deve ser comparado ao total de outra condição sem os mesmos IDs. Publicações comuns são um recorte selecionado.", "Reservas desconhecidas da tentativa interrompida permanecem no teto compartilhado v20 e não são cobrança confirmada."] };
const directory = resolveRoot("output/comparisons", `individual-v20-${limit}`);
await atomicJson(`${directory}/analysis.json`, report);
const percent = (n: number | null) => n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
const lines = ["# Comparação: lote de dez versus questão a questão com juiz Pro", "", `Recorte: primeiras ${limit} questões. Atualizado em ${report.at}.`, "",
  "| Condição | Decisões | Publicadas | Revisão | Fora | Cobertura no recorte | Concordância por ramo | Exata |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...results.map((r, i) => { const m = r.metrics; return `| ${i ? "v20 b1 / juiz 3.1 Pro" : "v19 b10 / juiz 3.8 Flash"} | ${m.processed}/${limit} | ${m.published} | ${m.reviewed} | ${m.outside} | ${percent(m.coverageAmongSelected)} | ${percent(m.publishedAgreement)} | ${percent(m.exactPublishedAgreement)} |`; }), "",
  "| Condição | Chamadas integralmente no recorte | Custo conhecido no recorte | Reservas desconhecidas no recorte | Intervalo de processamento |", "| --- | ---: | ---: | ---: | ---: |",
  ...results.map((r, i) => `| ${i ? "v20" : "v19"} | ${r.scopedPerformance.calls} | US$ ${r.scopedPerformance.knownUsd.toFixed(4)} | US$ ${r.scopedPerformance.reservedUnknownUsd.toFixed(4)} | ${r.scopedPerformance.intervalSeconds === null ? "n/a" : (r.scopedPerformance.intervalSeconds / 60).toFixed(1) + " min"} |`), "",
  `IDs publicados por ambas: ${commonPublished.size}. Concordância por ramo nesse recorte: ${report.paired.published.map(m => percent(m.publishedAgreement)).join(" → ")}. Exata: ${report.paired.published.map(m => percent(m.exactPublishedAgreement)).join(" → ")}.`, "",
  `Pendências no recorte atual: ${results[1]!.pendingInScope.join(", ") || "nenhuma"}.`, "", ...report.limits.map(s => `- ${s}`), ""];
await writeFile(`${directory}/analysis.md`, lines.join("\n"));
console.log(JSON.stringify({ directory, metrics: results.map(r => r.metrics), pairedPublished: report.paired.published }, null, 2));
