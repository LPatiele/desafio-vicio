import { readFile, writeFile } from "node:fs/promises";
import { loadData } from "../src/data.js";
import { readJson, resolveRoot, atomicJson, hash, csvCell, now } from "../src/utils.js";
import type { Config, RecordState } from "../src/types.js";
import { verifyCheckpoint } from "../experiments/no-rag-v19/engine.js";

const directory = resolveRoot("output/comparisons/individual-v20-final");
const source = resolveRoot("output/individual-v20/pro-judge-v20-359-r2");
const report = await readJson<any>(`${source}/report.json`);
const manifest = await readJson<{ fingerprint: string; config: Config; budgetDirectory: string }>(`${source}/manifest.json`);
if ((await readJson<{ budgetUsd: number }>(`${manifest.budgetDirectory}/authorization.json`)).budgetUsd !== 45) throw new Error("Este script documentava a primeira parada de US$45; use scripts/resumed-report-individual-v20.ts após a retomada. Artefato histórico preservado em individual-v20-first-financial-stop.");
const checkpoint = await readJson<{ version: 1; fingerprint: string; records: Record<string, RecordState> }>(`${source}/checkpoint.json`);
verifyCheckpoint(checkpoint, manifest.fingerprint, await loadData(), manifest.config);
const requests = (await readFile(`${source}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const starts = requests.filter(r => r.phase === "start"), ids = new Set(starts.map(r => r.requestId));
const ledger = await readJson<any>(`${manifest.budgetDirectory}/spend.json`);
const own = Object.entries(ledger.entries).filter(([id]) => ids.has(id)).map(([, e]) => e as any);
const previous = Object.entries(ledger.entries).filter(([id]) => !ids.has(id)).map(([, e]) => e as any);
const records = Object.values(checkpoint.records);
const exhausted = records.filter(r => !r.decision && Object.values(r.attempts ?? {}).some(n => n >= 5));
const budgetBlocked = records.filter(r => r.proposal && !r.verdict && !exhausted.includes(r));
const unattempted = records.filter(r => !r.attempts);
const known = own.reduce((s, e) => s + (e.actualUsd ?? 0), 0);
const unknown = own.filter(e => e.actualUsd === null).reduce((s, e) => s + e.reservedUsd, 0);
const oldReserved = previous.reduce((s, e) => s + (e.actualUsd ?? e.reservedUsd), 0);
const comparison = await readJson<any>(resolveRoot("output/comparisons/individual-v20-180/analysis.json"));
const attempts = ["classifier", "judge"].map(role => ({ role, distribution: records.reduce((out, r) => { const n = r.attempts?.[role as "classifier" | "judge"]; if (n) out[n] = (out[n] ?? 0) + 1; return out; }, {} as Record<number, number>) }));
const finance = { authorizationUsd: 45, knownEstimatedUsd: known, currentHttpErrorReservesUsd: unknown, previousConnectionFailureReservesUsd: oldReserved,
  totalKnownAndReservedUsd: known + unknown + oldReserved, remainingUsd: 45 - known - unknown - oldReserved,
  nature: "Consumo conhecido estimado com preços brutos e reservas conservadoras; não demonstra cobrança, abatimento de crédito ou saldo da conta Google." };
const audit = { at: now(), source, fingerprint: manifest.fingerprint, reportHash: hash(await readFile(`${source}/report.json`, "utf8")),
  result: { completed: report.completed, pending: report.pending.length, published: report.overall.published, reviewed: report.overall.reviewed, outside: report.overall.outside,
    branchAgreement: report.overall.publishedAgreement, exactAgreement: report.overall.exactPublishedAgreement, publicationCoverageOf359: report.overall.coverageOf359,
    durationSeconds: report.durationSeconds, calls: starts.length },
  stoppingReason: report.stopped, finance,
  pending: { exhausted: exhausted.map(r => ({ id: r.id, attempts: r.attempts, lastError: r.errors.at(-1)?.message })),
    blockedByBudget: budgetBlocked.map(r => r.id), unattemptedCount: unattempted.length, unattemptedFirst: unattempted[0]?.id, unattemptedLast: unattempted.at(-1)?.id },
  attempts, nativeRequestsWithTools: starts.filter(r => r.body.tools || r.body.toolConfig).length,
  errors: { http: requests.filter(r => r.phase === "response" && r.status >= 400).map(r => ({ status: r.status, requestId: r.requestId, body: JSON.parse(r.body) })), network: requests.filter(r => r.phase === "network_error").length },
  csv: { generatedForV20: false, reason: "Exige 359 decisões válidas; registros pendentes não são transformados em publicação, revisão ou fora fictícios.", previousV19Preserved: true },
  paired180: comparison.paired,
};
if (audit.result.completed + audit.pending.exhausted.length + budgetBlocked.length + unattempted.length !== 359) throw new Error("Contagem de decisões e pendências não fecha.");
await atomicJson(`${directory}/analysis.json`, audit);
const pendingRows = records.filter(r => !r.decision).map(r => [r.id, exhausted.includes(r) ? "tentativas_esgotadas" : r.proposal ? "juiz_bloqueado_por_orcamento" : "nao_processada_por_orcamento", r.proposal?.tema_central_id ?? "", r.attempts?.classifier ?? 0, r.attempts?.judge ?? 0, r.errors.at(-1)?.message ?? ""]);
await writeFile(`${directory}/pendencias.csv`, [["id", "situacao", "tema_proposto", "tentativas_classificador", "tentativas_juiz", "ultimo_erro"], ...pendingRows].map(row => row.map(csvCell).join(",")).join("\n") + "\n");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const [baseline, current] = comparison.conditions;
const timeRatio = current.scopedPerformance.intervalSeconds / baseline.scopedPerformance.intervalSeconds;
const costRatio = current.scopedPerformance.knownUsd / baseline.scopedPerformance.knownUsd;
const lines = ["# Resultado final da v20: juiz Gemini 3.1 Pro, questão a questão", "",
  "Classificador Gemini 3.5 Flash-Lite/high e juiz Gemini 3.1 Pro Preview/medium, via Vertex AI. Ambos sem RAG ou ferramentas. Propostas novas, mesmos prompts e regras da v19; uma questão e uma inferência por vez.", "",
  `Execução de 19/10/2026, das 00:52:48 às 02:16:35 (America/Fortaleza). Duração: ${(report.durationSeconds / 60).toFixed(1)} minutos. ${starts.length} chamadas.`, "",
  `Foram ${report.completed}/359 decisões: **${report.overall.published} publicações, ${report.overall.reviewed} revisões e ${report.overall.outside} fora**. Concordância nas publicadas: **${pct(report.overall.publishedAgreement)} por ramo** (${report.overall.publishedAgreementHits}/${report.overall.published}) e **${pct(report.overall.exactPublishedAgreement)} exata** (118/145). Cobertura de publicação no universo: ${pct(report.overall.coverageOf359)}. A meta de 95% não foi atingida em relação à referência própria provisória.`, "",
  "## Por que a rodada parou", "", report.stopped, "",
  "| Parcela do controle financeiro | US$ |", "| --- | ---: |",
  `| Consumo conhecido estimado da execução r2 | ${known.toFixed(6)} |`,
  `| Reservas de nove respostas HTTP 429 sem consumo informado | ${unknown.toFixed(6)} |`,
  `| Reservas da tentativa inicial interrompida por bloqueio de rede | ${oldReserved.toFixed(6)} |`,
  `| Total conhecido + reservado | ${finance.totalKnownAndReservedUsd.toFixed(6)} |`,
  `| Restante do teto de US$ 45 | ${finance.remainingUsd.toFixed(6)} |`, "",
  "O controle alcançou o limite disponível para reservar a próxima chamada; isso não significa US$ 45 cobrados pelo Google. As reservas conservadoras ficaram mantidas porque não houve conferência de faturamento. A tentativa inicial teve 80 inícios registrados e nenhuma resposta HTTP, antes da execução com permissão de rede. Seu checkpoint e contadores foram preservados em outra suíte; nenhum contador foi zerado. As reservas das duas suítes compartilham o mesmo teto de US$ 45. O orçamento antigo de US$ 30 não foi alterado.", "",
  "## As 179 questões sem decisão", "",
  "- Q0017: cinco tentativas do juiz, sendo um 429 e quatro pareceres que sustentavam fora para uma proposta dentro da árvore, contrariando o contrato.",
  "- Q0083: cinco tentativas do juiz, sendo três 429 e duas respostas que sustentavam extras não propostos ou duplicados.",
  "- Q0154: cinco respostas do juiz sem sustentação de fora nem tema alternativo que permitisse uma decisão válida.",
  "- Q0184: proposta válida salva; a reserva da primeira chamada ao juiz foi bloqueada pelo orçamento.",
  "- Q0185–Q0359: 175 questões ainda não processadas nesta condição.", "",
  "Não foi gerado publicacao.csv integral da v20: o contrato exige uma decisão válida para cada um dos 359 IDs. O CSV completo da v19 permanece na raiz, sem alteração. O arquivo pendencias.csv é diagnóstico e não substitui o CSV de entrega.", "",
  "## Comparação nos mesmos 180 IDs", "",
  "| Condição | Decisões | Publicadas | Cobertura no recorte | Concordância por ramo | Exata | Custo conhecido no recorte | Tempo no recorte |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...comparison.conditions.map((r: any, i: number) => `| ${i ? "v20 b1 / juiz 3.1 Pro" : "v19 b10 / juiz 3.8 Flash"} | ${r.metrics.processed}/180 | ${r.metrics.published} | ${pct(r.metrics.coverageAmongSelected)} | ${pct(r.metrics.publishedAgreement)} | ${pct(r.metrics.exactPublishedAgreement)} | US$ ${r.scopedPerformance.knownUsd.toFixed(4)} | ${(r.scopedPerformance.intervalSeconds / 60).toFixed(1)} min |`), "",
  `A concordância por ramo mudou pouco, a exata aumentou e a cobertura caiu. O custo conhecido no recorte foi ${costRatio.toFixed(2)} vezes o anterior e o intervalo de processamento, incluindo esperas, ${timeRatio.toFixed(2)} vezes. Essas medidas não incluem as reservas desconhecidas como custo confirmado.`, "",
  "Nos 131 IDs publicados por ambas: concordância por ramo passou de 115/131 (87,8%) para 114/131 (87,0%); a exata, de 104/131 (79,4%) para 107/131 (81,7%). As publicações comuns são um recorte selecionado, não prova de superioridade geral.", "",
  "Juiz e lote mudam juntos, as propostas são novas, e há variação de amostragem e do serviço. O teste não isola o efeito do Pro. Concordância é com referência própria provisória, não com os rótulos oficiais guardados pela equipe do desafio. O resultado não demonstrou vantagem no critério principal de publicação com pelo menos 95% de concordância.", "",
  "## Auditoria", "",
  "Checkpoint, propostas, pareceres válidos e decisões foram revalidados sem alterações. Foram nove erros HTTP 429 RESOURCE_EXHAUSTED, todos no juiz, e zero falhas de rede na r2. As requisições não contêm ferramentas. O código passou 22 testes e a checagem TypeScript antes da execução. Dados, prompts, resultados e CSV da v19 permanecem preservados.", "",
  "Fontes locais: report.json, checkpoint.json, requests.jsonl e events.jsonl em output/individual-v20/pro-judge-v20-359-r2; spend.json e authorization.json no diretório da tentativa inicial; comparação detalhada em output/comparisons/individual-v20-180. O JSON ao lado registra hashes e números sem arredondamento.", ""];
await writeFile(`${directory}/analysis.md`, lines.join("\n"));
console.log(JSON.stringify({ directory, result: audit.result, finance, pending: audit.pending }, null, 2));
