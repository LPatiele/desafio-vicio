// Offline audit. Run only after the model process has released its lock.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { loadData } from "../src/data.js";
import { readJson, resolveRoot, atomicJson, hash, csvCell, now, exists } from "../src/utils.js";
import type { Config, RecordState } from "../src/types.js";
import { verifyCheckpoint } from "../experiments/no-rag-v19/engine.js";

const directory = resolveRoot("output/comparisons/individual-v20-resumed-final");
const source = resolveRoot("output/individual-v20/pro-judge-v20-359-r2");
if (await exists(`${source}/run.lock`)) throw new Error("Execução ainda ativa; aguarde o fechamento do checkpoint e do relatório.");
const report = await readJson<any>(`${source}/report.json`);
const manifest = await readJson<{ fingerprint: string; config: Config; budgetDirectory: string }>(`${source}/manifest.json`);
const checkpoint = await readJson<{ version: 1; fingerprint: string; records: Record<string, RecordState> }>(`${source}/checkpoint.json`);
verifyCheckpoint(checkpoint, manifest.fingerprint, await loadData(), manifest.config);
const records = Object.values(checkpoint.records);
if (hash(JSON.stringify(records)) !== hash(JSON.stringify(Object.values(await readJson<Record<string, RecordState>>(`${source}/records.json`))))) throw new Error("Espelho de registros diverge do checkpoint.");
const completed = records.filter(r => r.decision);
if (completed.length !== report.completed) throw new Error("Relatório não corresponde ao checkpoint encerrado.");
const jsonl = async (name: string) => (await readFile(`${source}/${name}.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const requests = await jsonl("requests"), events = await jsonl("events");
const starts = requests.filter(r => r.phase === "start"), ids = new Set(starts.map(r => r.requestId));
const authorization = await readJson<{ budgetUsd: number }>(`${manifest.budgetDirectory}/authorization.json`);
const ledger = await readJson<any>(`${manifest.budgetDirectory}/spend.json`);
const own = Object.entries(ledger.entries).filter(([id]) => ids.has(id)).map(([, e]) => e as any);
const previous = Object.entries(ledger.entries).filter(([id]) => !ids.has(id)).map(([, e]) => e as any);
if (own.length !== ids.size) throw new Error("Chamada sem lançamento financeiro correspondente.");
const known = own.reduce((s, e) => s + (e.actualUsd ?? 0), 0);
const unknownEntries = own.filter(e => e.actualUsd === null);
const unknown = unknownEntries.reduce((s, e) => s + e.reservedUsd, 0);
const previousKnown = previous.reduce((s, e) => s + (e.actualUsd ?? 0), 0);
const previousUnknown = previous.filter(e => e.actualUsd === null).reduce((s, e) => s + e.reservedUsd, 0);
const exhausted = records.filter(r => !r.decision && Object.values(r.attempts ?? {}).some(n => n >= 5));
const pendingJudge = records.filter(r => !r.decision && r.proposal && !exhausted.includes(r));
const pendingClassifier = records.filter(r => !r.decision && !r.proposal && !exhausted.includes(r));
if (completed.length + exhausted.length + pendingJudge.length + pendingClassifier.length !== 359) throw new Error("Contagem incompleta.");

// Runtime reports describe a single invocation; preserve and sum every segment.
const segments: any[] = [];
if (await exists(`${source}/run-segments`)) for (const name of await readdir(`${source}/run-segments`)) {
  const file = `${source}/run-segments/${name}/report.json`;
  if (await exists(file)) segments.push(await readJson<any>(file));
}
segments.push(report);
const unique = [...new Map(segments.map(s => [s.startedAt, s])).values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
const invocationStarts = events.filter(e => e.type === "invocation").map(e => e.data.startedAt);
if (unique.length !== invocationStarts.length || invocationStarts.some(s => !unique.some(r => r.startedAt === s))) throw new Error("Falta relatório de uma invocação; arquive o segmento antes de outra retomada.");
if (unique.reduce((n, s) => n + s.callsThisInvocation, 0) !== starts.length) throw new Error("Total de chamadas das invocações não confere.");
const durationSeconds = unique.reduce((n, s) => n + s.durationSeconds, 0);
const wallSeconds = (Date.parse(report.at) - Date.parse(unique[0].startedAt)) / 1000;
const comparison = await readJson<any>(resolveRoot("output/comparisons/individual-v20-359/analysis.json"));
if (comparison.conditions[1].metrics.processed !== completed.length) throw new Error("Atualize a comparação de 359 IDs antes do relatório.");
const comparisonRecordsHash = hash(JSON.stringify(await readJson(`${source}/records.json`)));
if (comparison.conditions[1].recordsHash !== comparisonRecordsHash) throw new Error("Comparação usa registros diferentes.");
const http = requests.filter(r => r.phase === "response" && r.status >= 400).map(r => ({ status: r.status, requestId: r.requestId, body: (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() }));
const finance = { authorizationUsd: authorization.budgetUsd, knownEstimatedUsd: known, currentUnknownReservesUsd: unknown, currentUnresolvedCount: unknownEntries.length,
  previousKnownEstimatedUsd: previousKnown, previousUnknownReservesUsd: previousUnknown, previousUnresolvedCount: previous.filter(e => e.actualUsd === null).length,
  totalKnownAndReservedUsd: known + unknown + previousKnown + previousUnknown,
  remainingUsd: authorization.budgetUsd - known - unknown - previousKnown - previousUnknown,
  nature: "Preços brutos estimados e reservas conservadoras; não confirma cobrança, abatimento de crédito ou saldo Google." };
const delivery = resolveRoot("output/delivery/pro-judge-v20-359-r2/publicacao.csv");
const audit = { at: now(), source, fingerprint: manifest.fingerprint, reportHash: hash(await readFile(`${source}/report.json`, "utf8")),
  result: { ...report.overall, completed: completed.length, pending: 359 - completed.length, calls: starts.length, activeProcessingSeconds: durationSeconds, wallSeconds },
  segments: unique.map(s => ({ startedAt: s.startedAt, endedAt: s.at, durationSeconds: s.durationSeconds, calls: s.callsThisInvocation, stopped: s.stopped })),
  stoppingReason: report.stopped, finance,
  pending: { exhausted: exhausted.map(r => ({ id: r.id, proposal: r.proposal, attempts: r.attempts, errors: r.errors })), judge: pendingJudge.map(r => r.id), classifier: pendingClassifier.map(r => r.id) },
  errors: { http, network: requests.filter(r => r.phase === "network_error").length },
  attempts: ["classifier", "judge"].map(role => ({ role, distribution: records.reduce((out, r) => { const n = r.attempts?.[role as "classifier" | "judge"]; if (n) out[n] = (out[n] ?? 0) + 1; return out; }, {} as Record<number, number>) })),
  nativeRequestsWithTools: starts.filter(r => r.body.tools || r.body.toolConfig).length,
  csv: { generatedForV20: await exists(delivery), path: await exists(delivery) ? delivery : null, reason: completed.length === 359 ? null : "Exige 359 decisões válidas; pendências não recebem decisões fictícias." },
  comparison: comparison.paired };
await atomicJson(`${directory}/analysis.json`, audit);
const pendingRows = records.filter(r => !r.decision).map(r => [r.id, exhausted.includes(r) ? "tentativas_esgotadas" : r.proposal ? "aguarda_juiz" : "aguarda_classificador", r.proposal?.tema_central_id ?? "", r.attempts?.classifier ?? 0, r.attempts?.judge ?? 0, r.errors.at(-1)?.message ?? ""]);
await writeFile(`${directory}/pendencias.csv`, [["id", "situacao", "tema_proposto", "tentativas_classificador", "tentativas_juiz", "ultimo_erro"], ...pendingRows].map(row => row.map(csvCell).join(",")).join("\n") + "\n");
const pct = (n: number | null) => n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
const m = report.overall, [baseline, current] = comparison.conditions;
const timeRatio = current.scopedPerformance.intervalSeconds / baseline.scopedPerformance.intervalSeconds;
const costRatio = current.scopedPerformance.knownUsd / baseline.scopedPerformance.knownUsd;
const local = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", hour12: false });
const lines = ["# v20 após retomada: Gemini 3.1 Pro como juiz", "",
  "Classificador Gemini 3.5 Flash-Lite/high e juiz Gemini 3.1 Pro Preview/medium, via Vertex AI. Ambos sem RAG e ferramentas; uma questão e uma inferência por vez. Prompts e regras conservados da v19; propostas novas.", "",
  `**${completed.length}/359 decisões**: ${m.published} publicações, ${m.reviewed} revisões, ${m.outside} fora. Pendências: ${359 - completed.length}.`, "",
  `Concordância nas publicadas: **${pct(m.publishedAgreement)} por ramo** (${m.publishedAgreementHits}/${m.published}) e **${pct(m.exactPublishedAgreement)} exata** (${m.publishedRelationships.exato ?? 0}/${m.published}). Cobertura de publicação: ${pct(m.coverageOf359)} do universo. ${m.publishedAgreement >= .95 ? "O ponto estimado alcançou 95% na referência provisória." : "A meta de 95% não foi alcançada na referência provisória."}`, "",
  `Execução de ${local(unique[0].startedAt)} a ${local(report.at)}, fuso America/Fortaleza. ${starts.length} chamadas em ${unique.length} invocações: ${(durationSeconds / 60).toFixed(1)} minutos de processamento ativo; ${(wallSeconds / 60).toFixed(1)} minutos no relógio, incluindo a pausa entre retomadas. O report.json nativo registra somente a duração da última invocação.`, "",
  "## Orçamento e término", "", report.stopped ?? (exhausted.length ? "A passagem pelos itens terminou; há questões com tentativas esgotadas." : "Passagem concluída."), "",
  "| Parcela | US$ |", "| --- | ---: |",
  `| Teto total autorizado (45 + 30) | ${authorization.budgetUsd.toFixed(2)} |`,
  `| Consumo conhecido estimado desta execução r2 | ${known.toFixed(6)} |`,
  `| Reservas sem consumo confirmado na r2 (${unknownEntries.length} chamadas) | ${unknown.toFixed(6)} |`,
  `| Consumo conhecido da tentativa inicial | ${previousKnown.toFixed(6)} |`,
  `| Reservas sem consumo confirmado da tentativa inicial (${finance.previousUnresolvedCount} chamadas) | ${previousUnknown.toFixed(6)} |`,
  `| Total conhecido + reservado | ${finance.totalKnownAndReservedUsd.toFixed(6)} |`,
  `| Restante para reservas | ${finance.remainingUsd.toFixed(6)} |`, "",
  "O teto passou de US$45 para US$75 por autorização da usuária; lançamentos e contadores foram preservados. As reservas não são cobranças confirmadas. A tentativa inicial foi interrompida por bloqueio de rede, com 80 inícios e nenhuma resposta HTTP. Ela permanece separada da r2, mas compartilha o teto financeiro. Não houve conferência de faturamento nem confirmação do abatimento do crédito promocional.", "",
  "## Pendências e limite de tentativas", "",
  ...exhausted.map(r => `- ${r.id}: classificador ${r.attempts?.classifier ?? 0}, juiz ${r.attempts?.judge ?? 0}. Último erro: ${r.errors.at(-1)?.message}`),
  ...(pendingJudge.length ? [`- Aguardam juiz, sem esgotar tentativas: ${pendingJudge.map(r => r.id).join(", ")}.`] : []),
  ...(pendingClassifier.length ? [`- Aguardam classificação, sem esgotar tentativas: ${pendingClassifier.length} IDs (lista no CSV).`] : []), "",
  "São cinco tentativas totais por questão e etapa, incluindo a primeira e erros HTTP. O acréscimo financeiro não autoriza uma sexta tentativa. Nenhum contador foi zerado e nenhuma pendência recebeu uma decisão inventada. O JSON contém o histórico de erros por item; pendencias.csv é diagnóstico.", "",
  "Diagnóstico adicional em ../individual-v20-pending-diagnosis/diagnosis.md. Em particular, a Q0154 recebeu cinco pareceres confirmando fora: o bloqueio vem da incerteza persistida pelo classificador, que exige revisão sem haver tema para essa revisão. O erro genérico do executor não descreve corretamente essa causa. Na Q0017, o juiz discorda da proposta dentro da árvore sugerindo fora, combinação rejeitada pelo contrato atual. Na Q0083, os extras confirmados não pertencem aos propostos.", "",
  audit.csv.generatedForV20 ? `CSV integral gerado em ${delivery}.` : "Sem CSV integral da v20: a entrega exige 359 decisões válidas. O CSV completo da v19 permanece preservado.", "",
  "## Comparação no universo de 359 IDs", "",
  "| Condição | Decisões | Publicadas | Cobertura | Concordância por ramo | Exata | Custo conhecido | Tempo de relógio |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...comparison.conditions.map((r: any, i: number) => `| ${i ? "v20 b1 / juiz 3.1 Pro" : "v19 b10 / juiz 3.8 Flash"} | ${r.metrics.processed}/359 | ${r.metrics.published} | ${pct(r.metrics.coverageOf359)} | ${pct(r.metrics.publishedAgreement)} | ${pct(r.metrics.exactPublishedAgreement)} | US$ ${r.scopedPerformance.knownUsd.toFixed(4)} | ${(r.scopedPerformance.intervalSeconds / 60).toFixed(1)} min |`), "",
  `Custo conhecido ${costRatio.toFixed(2)} vezes o da v19; intervalo de relógio ${timeRatio.toFixed(2)} vezes. Reservas desconhecidas não entram como custo confirmado. Tempo ativo e intervalo de relógio estão discriminados acima.`, "",
  `Diferenças dos pontos estimados (v20 menos v19): concordância por ramo ${((current.metrics.publishedAgreement - baseline.metrics.publishedAgreement) * 100).toFixed(2)} pontos percentuais; exata ${((current.metrics.exactPublishedAgreement - baseline.metrics.exactPublishedAgreement) * 100).toFixed(2)} pontos; cobertura ${((current.metrics.coverageOf359 - baseline.metrics.coverageOf359) * 100).toFixed(2)} pontos. O ganho observado de concordância veio com menor cobertura e custo/tempo maiores, sem atingir a meta. Isso não demonstra ganho estatístico ou efeito isolado do juiz.`, "",
  `Nas ${comparison.paired.publishedIds.length} questões publicadas por ambas: concordância por ramo ${comparison.paired.published.map((r: any) => pct(r.publishedAgreement)).join(" → ")}; exata ${comparison.paired.published.map((r: any) => pct(r.exactPublishedAgreement)).join(" → ")}. Esse recorte é selecionado.`, "",
  "A concordância compara a referência própria provisória, não os rótulos oficiais do desafio nem uma verdade jurídica independente. Juiz e lote mudam juntos e as propostas são novas; o teste não isola o efeito do Pro. Cobertura conta publicações sobre 359; concordância usa somente as publicadas. As pendências não desaparecem do denominador da cobertura.", "",
  "## Auditoria", "",
  `Checkpoint, propostas, pareceres aceitos e decisões revalidados. ${http.length} respostas HTTP de erro na r2; ${audit.errors.network} falhas de rede; ${audit.nativeRequestsWithTools} chamadas com ferramentas. A validação original foi mantida. O código da execução passou 22 testes e a checagem TypeScript antes da inferência.`, "",
  "Fontes locais: checkpoint.json, records.json, requests.jsonl, events.jsonl, report.json e run-segments; spend.json e authorization.json compartilhados. O JSON ao lado registra hashes, segmentos, erros e valores sem arredondamento. Comparação detalhada: ../individual-v20-359/analysis.md.", ""];
await writeFile(`${directory}/analysis.md`, lines.join("\n"));
console.log(JSON.stringify({ directory, result: audit.result, finance, pending: { exhausted: exhausted.map(r => r.id), judge: pendingJudge.map(r => r.id), classifier: pendingClassifier.length } }, null, 2));
