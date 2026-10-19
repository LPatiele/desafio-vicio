import { readFile, mkdir, writeFile } from "node:fs/promises";
import { metrics, type ComparisonRow } from "../src/evaluation.js";
import { csvCell } from "../src/utils.js";

const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const target = "output/no-rag-v19/model-only-v19-359";
const ledger = await read("output/paid-v17/paid-v17-359/spend.json");
async function experiment(directory: string) {
  const report = await read(`${directory}/report.json`);
  const requests = (await readFile(`${directory}/requests.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const starts = requests.filter(r => r.phase === "start");
  const requestIds = new Set(starts.map(r => r.requestId));
  const entries = Object.entries(ledger.entries).filter(([id]) => requestIds.has(id)).map(([, entry]) => entry as any);
  return { directory, at: report.at, durationSeconds: report.durationSeconds, completed: report.completed, overall: report.overall,
    referenceHash: report.referenceHash, rows: report.rows as ComparisonRow[], stopped: report.stopped,
    cost: { calls: starts.length, knownUsd: entries.reduce((sum, e) => sum + (e.actualUsd ?? 0), 0), chargedOrReservedUsd: entries.reduce((sum, e) => sum + (e.actualUsd ?? e.reservedUsd), 0), unknown: entries.filter(e => e.actualUsd === null).length },
    requestsWithTools: starts.filter(r => r.body.tools || r.body.toolConfig).length,
    httpErrors: requests.filter(r => r.phase === "response" && r.status >= 400).length,
  };
}
const current = await experiment(target);
const previous = await Promise.all(["b20", "b10"].map(c => experiment(`output/vertex-v18/vertex-v18-359/${c}`)));
if (previous.some(p => p.referenceHash !== current.referenceHash)) throw new Error("Referências distintas impedem essa comparação.");
const paired = previous.map(old => {
  const completedIds = new Set(old.rows.filter(r => r.decisao).map(r => r.id));
  const publishedIds = new Set(old.rows.filter(r => r.decisao === "publicar").map(r => r.id));
  const commonPublications = current.rows.filter(r => r.decisao === "publicar" && publishedIds.has(r.id)).map(r => r.id);
  const selected = new Set(commonPublications);
  return { previous: old.directory, completedPreviously: completedIds.size,
    samePreviouslyCompletedIds: { previous: metrics(old.rows.filter(r => completedIds.has(r.id)), 359), current: metrics(current.rows.filter(r => completedIds.has(r.id)), 359) },
    commonPublications: { n: selected.size, ids: commonPublications, previous: metrics(old.rows.filter(r => selected.has(r.id)), 359), current: metrics(current.rows.filter(r => selected.has(r.id)), 359) },
  };
});
const output = { at: new Date().toISOString(), current, previous, paired,
  caveats: ["Concordância com referência própria provisória, não precisão jurídica externa.", "b10 com RAG foi interrompido pela usuária: sua duração e cobertura são parciais.", "Além do RAG, a v19 retira instruções de recuperação dos prompts e usa retentativas diretas com contexto novo; não isola um efeito causal único.", "Custos brutos estimados pelos perfis configurados; reservas de consumo desconhecido permanecem contabilizadas. Não é conferência de fatura ou saldo do crédito.", "Itens concluídos e publicações comuns são recortes selecionados e não demonstram, sozinhos, superioridade populacional."] };
const folder = "output/comparisons/no-rag-v19";
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/analysis.json`, JSON.stringify(output, null, 2) + "\n");
const columns = ["id", "decisao", "tema_proposto", "tema_final", "tema_referencia", "relacao_final"] as const;
await writeFile(`${folder}/items.csv`, [columns.join(","), ...current.rows.map(row => columns.map(key => csvCell(row[key])).join(","))].join("\n") + "\n");
const percent = (n: number | null) => n === null ? "—" : `${(100 * n).toFixed(1).replace(".", ",")}%`;
const money = (n: number) => `US$ ${n.toFixed(4).replace(".", ",")}`;
const format = (e: typeof current, name: string) => `| ${name} | ${e.completed}/359 | ${e.overall.published} | ${e.overall.reviewed} | ${percent(e.overall.coverageAmongSelected)} | ${percent(e.overall.publishedAgreement)} | ${percent(e.overall.exactPublishedAgreement)} | ${(e.durationSeconds / 60).toFixed(1).replace(".", ",")} min | ${money(e.cost.knownUsd)} |`;
const lines = ["# Comparação da execução sem RAG — v19", "", `Gerado em ${output.at}.`, "", "| Condição | Decisões | Publicadas | Revisão | Cobertura de publicação | Concordância por ramo | Concordância exata | Duração | Custo conhecido |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", format(current, "v19 sem RAG — b10"), format(previous[0]!, "v18 com RAG — b20"), format(previous[1]!, "v18 com RAG — b10 interrompido"), "", `A v19 teve ${current.cost.calls} chamadas, ${current.requestsWithTools} requisições com ferramentas e ${current.httpErrors} erros HTTP. Custo por decisão concluída: ${money(current.cost.knownUsd / Math.max(1, current.completed))}.`, ""];
for (const pair of paired) lines.push(`## Publicações comuns com ${pair.previous.endsWith("b20") ? "b20" : "b10"}`, "", `${pair.commonPublications.n} IDs publicados por ambas as condições. Concordância por ramo: ${percent(pair.commonPublications.previous.publishedAgreement)} antes e ${percent(pair.commonPublications.current.publishedAgreement)} na v19. Concordância exata: ${percent(pair.commonPublications.previous.exactPublishedAgreement)} antes e ${percent(pair.commonPublications.current.exactPublishedAgreement)} na v19.`, "");
lines.push("## Limites", "", ...output.caveats.map(c => `- ${c}`), "", "O detalhamento dos recortes, custos e IDs está em analysis.json e items.csv. A meta de 95% deve ser avaliada separadamente da completude técnica do processamento.", "");
await writeFile(`${folder}/analysis.md`, lines.join("\n"));
console.log(JSON.stringify({ completed: current.completed, overall: current.overall, cost: current.cost, requestsWithTools: current.requestsWithTools, httpErrors: current.httpErrors, paired: paired.map(p => ({ previous: p.previous, n: p.commonPublications.n, agreementBefore: p.commonPublications.previous.publishedAgreement, agreementAfter: p.commonPublications.current.publishedAgreement })) }, null, 2));
