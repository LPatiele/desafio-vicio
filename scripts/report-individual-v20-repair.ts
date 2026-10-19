import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { loadData } from "../src/data.js";
import { atomicJson, hash, readJson, resolveRoot, exists, now } from "../src/utils.js";
import { checkInherited, REPAIR_IDS } from "../experiments/individual-v20/repair-plan.js";
import { verifyCheckpoint, type Checkpoint } from "../experiments/no-rag-v19/engine.js";
import { CONFIRMED_OUTSIDE_POLICY, verifyConfirmedOutside } from "../delivery/confirmed-outside.js";

const finalized = resolveRoot("output/individual-v20/pro-judge-v20-359-repair-1-final");
const source = await exists(`${finalized}/checkpoint.json`) ? finalized : resolveRoot("output/individual-v20/pro-judge-v20-359-repair-1");
if (await exists(`${source}/run.lock`)) throw new Error("Aguarde o encerramento da recuperação.");
const manifest = await readJson<any>(`${source}/manifest.json`), checkpoint = await readJson<Checkpoint>(`${source}/checkpoint.json`);
const parent = await readJson<Checkpoint>(`${manifest.parent}/checkpoint.json`);
(manifest.decisionPolicy === CONFIRMED_OUTSIDE_POLICY ? verifyConfirmedOutside : verifyCheckpoint)(checkpoint, manifest.fingerprint, await loadData(), manifest.config); checkInherited(parent, checkpoint.records);
const report = await readJson<any>(`${source}/report.json`), baseline = await readJson<any>(`${manifest.parent}/report.json`);
const requests = (await readFile(`${source}/requests.jsonl`, "utf8")).trim().split("\n").map(l => JSON.parse(l));
const starts = requests.filter(r => r.phase === "start"), requestIds = new Set(starts.map(r => r.requestId));
const ledger = await readJson<any>(`${manifest.budgetDirectory}/spend.json`), entries = Object.entries(ledger.entries);
const own = entries.filter(([id]) => requestIds.has(id)).map(([, entry]) => entry as any);
const recoveryCost = own.reduce((s, e) => s + (e.actualUsd ?? 0), 0);
const total = entries.reduce((s, [, e]) => s + ((e as any).actualUsd ?? (e as any).reservedUsd), 0);
const financial = { authorizationUsd: 75, recoveryKnownEstimatedUsd: recoveryCost,
  allV20KnownEstimatedUsd: entries.reduce((s, [, e]) => s + ((e as any).actualUsd ?? 0), 0), totalKnownAndReservedUsd: total, availableUsd: 75 - total,
  unreconciledCount: entries.filter(([, e]) => (e as any).actualUsd === null).length };
const delivered = resolveRoot("output/delivery", manifest.suite, "publicacao.csv");
let csv = null;
if (await exists(delivered)) {
  const text = await readFile(delivered, "utf8"), root = await readFile(resolveRoot("publicacao.csv"), "utf8");
  const rows = parse(text, { columns: true }) as Record<string, string>[];
  if (rows.length !== 359 || new Set(rows.map(r => r.id)).size !== 359 || root !== text) throw new Error("CSV atualizado não corresponde à entrega integral validada.");
  csv = { file: delivered, root: resolveRoot("publicacao.csv"), sha256: hash(text), rows: rows.length };
}
const changes = REPAIR_IDS.map(id => ({ id, priorAttempts: parent.records[id]!.attempts, recoveryAttempts: checkpoint.records[id]!.attempts,
  previousProposal: parent.records[id]!.proposal, proposal: checkpoint.records[id]!.proposal,
  verdict: checkpoint.records[id]!.verdict, decision: checkpoint.records[id]!.decision, errors: checkpoint.records[id]!.errors }));
const audit = { at: now(), source, fingerprint: manifest.fingerprint, parent: manifest.parent, parentHashes: manifest.parentHashes,
  recoveryIds: REPAIR_IDS, unchangedPreviouslyCompleted: 354, calls: starts.length, errorsHttp: requests.filter(r => r.phase === "response" && r.status >= 400).map(r => r.status),
  previousMetrics: baseline.overall, metrics: report.overall, pending: report.pending, stopped: report.stopped, financial, csv, changes,
  decisionPolicy: manifest.decisionPolicy ?? "original", policyChanges: manifest.decisionPolicy ? await readJson<any>(`${source}/decision-policy.json`) : null,
  caution: "Recuperação dirigida com críticas anteriores dos modelos e uma política versionada para confirmação de fora; não é uma repetição cega da v20. A referência só participa da avaliação posterior." };
const directory = resolveRoot("output/comparisons/individual-v20-recovery"); await atomicJson(`${directory}/analysis.json`, audit);
const pct = (n: number | null) => n === null ? "n/a" : `${(100 * n).toFixed(1)}%`;
const m = report.overall;
const lines = ["# Recuperação de cinco pendências da v20", "",
  `Resultado: **${report.completed}/359 decisões**, ${m.published} publicações, ${m.reviewed} revisões e ${m.outside} fora. Pendências: ${report.pending.join(", ") || "nenhuma"}.`, "",
  "As 354 decisões anteriores foram preservadas integralmente. Houve nova classificação para Q0017, Q0083, Q0154 e Q0298, com o parecer anterior como feedback sujeito a erro. A Q0319 reutilizou sua proposta válida e repetiu somente o juiz. Modelos, prompts-base, regras de publicação, ausência de RAG e referência fora das entradas foram mantidos. O experimento original permanece intacto.", "",
  "| Questão | Tentativas anteriores C/J | Novas C/J | Resultado | Tema final |", "| --- | ---: | ---: | --- | --- |",
  ...changes.map(c => `| ${c.id} | ${c.priorAttempts?.classifier ?? 0}/${c.priorAttempts?.judge ?? 0} | ${c.recoveryAttempts?.classifier ?? 0}/${c.recoveryAttempts?.judge ?? 0} | ${c.decision?.decisao ?? "pendente"} | ${c.decision?.tema_central_id ?? "—"} |`), "",
  `${starts.length} novas chamadas no ciclo (somadas as retomadas), custo adicional conhecido estimado **US$${recoveryCost.toFixed(4)}**. Consumo conhecido acumulado da v20: US$${financial.allV20KnownEstimatedUsd.toFixed(4)}; incluindo reservas desconhecidas, US$${total.toFixed(4)} de US$75. Disponível: US$${financial.availableUsd.toFixed(4)}. São estimativas, sem conferência de fatura ou crédito promocional.`, "",
  "O controle financeiro anterior preservava reservas para HTTP 429 já rejeitados. A [política oficial do Google](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) informa cobrança de entrada/saída somente para respostas 200. Foram reconciliados apenas os 429 confirmados em logs, com backup do ledger e auditoria em output/individual-v20/pro-judge-v20-359/reconciliations/. Falhas de rede sem resposta permanecem reservadas. Nenhuma tentativa foi apagada ou deixou de contar para o limite.", "",
  "## Variante de decisão judge-confirms-outside-v1", "",
  "A regra original permanece disponível. A derivação permite fora quando: a proposta já é fora com tema nulo e possui incerteza; proposta/evidências/IDs passam nas validações; as três rubricas do juiz são sustentadas; fora_sustentado=true; não há tema alternativo, extras, alerta do juiz ou aviso de entrada. A incerteza original fica preservada e o motivo registra a distinção de escopo feita pelo juiz. A regra não flexibiliza publicar e não cria revisão sem tema, vedada pelo anexo.", "",
  "Aplicação offline a Q0154 e Q0298: reaplica a regra às respostas reais em ordem de recebimento e aceita o primeiro parecer elegível. Q0154: primeira tentativa; Q0298: terceira tentativa. Não são novas chamadas nem respostas fabricadas. As respostas posteriores, inclusive as com alertas, permanecem no log; sob a nova regra o fluxo teria encerrado a etapa no primeiro parecer aceito. O artefato decision-policy.json registra IDs de requisição, hashes e política aplicada. O efeito foi de duas exclusões, sem novas publicações por essa variante.", "",
  "As duas exclusões da variante divergem da referência provisória v2. No conjunto, somente duas das nove decisões fora concordam com ela (22,2%). Isso exige atenção às exclusões: a confirmação do juiz resolve o bloqueio de contrato, mas não é comprovação jurídica da ausência de tema. Os resultados da referência também podem conter erro.", "",
  `Concordância nas publicadas com a referência própria provisória: **${pct(m.publishedAgreement)} por ramo** (${m.publishedAgreementHits}/${m.published}) e **${pct(m.exactPublishedAgreement)} exata** (${m.publishedRelationships.exato ?? 0}/${m.published}). Cobertura de publicação: **${pct(m.coverageOf359)}**. A meta de 95% ${m.publishedAgreement >= .95 ? "foi alcançada no ponto estimado" : "não foi alcançada"}.`, "",
  csv ? `CSV integral validado e atualizado na raiz: publicacao.csv. Snapshot: output/delivery/${manifest.suite}/publicacao.csv. As seis colunas e os 359 IDs foram conferidos por releitura do arquivo. O CSV anterior foi preservado em output/delivery/root-history/; o apontamento atual fica em output/delivery/current.json.` : "CSV integral ainda bloqueado por pendências; o CSV anterior permanece na raiz.", "",
  `Limite de interpretação: ${audit.caution} Os cinco casos foram selecionados justamente porque falharam; não atribua eventual diferença de concordância a uma melhora geral do modelo.`, "",
  `Interrupção final: ${report.stopped ?? "nenhuma"}. Os pareceres e as decisões foram revalidados, sem modificação manual dos destinos. O JSON ao lado contém os resultados individuais, métricas e valores sem arredondamento.`, ""];
await writeFile(`${directory}/analysis.md`, lines.join("\n"));
console.log(JSON.stringify({ directory, completed: report.completed, pending: report.pending, financial, csv, metrics: m }, null, 2));
