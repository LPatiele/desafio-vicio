import { readFile, writeFile } from "node:fs/promises";
import { loadData, indexThemes } from "../src/data.js";
import { VerdictSchema, type Config, type RecordState } from "../src/types.js";
import { validateVerdict } from "../src/validation.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { atomicJson, hash, now, parseBatch, readJson, resolveRoot } from "../src/utils.js";

// Read-only replay of already received responses. No model call or checkpoint write.
const source = resolveRoot("output/individual-v20/pro-judge-v20-359-r2");
const directory = resolveRoot("output/comparisons/individual-v20-pending-diagnosis");
const checkpoint = await readJson<{ records: Record<string, RecordState> }>(`${source}/checkpoint.json`);
const manifest = await readJson<{ config: Config; fingerprint: string }>(`${source}/manifest.json`);
const data = await loadData(), themes = indexThemes(data.themes);
const rows = (await readFile(`${source}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const pending = Object.values(checkpoint.records).filter(r => !r.decision && r.proposal && (r.attempts?.judge ?? 0) >= 5);
const diagnostics = pending.map(record => {
  const question = data.questions.find(q => q.id === record.id)!;
  const starts = rows.filter(r => r.phase === "start" && r.role === "judge" && r.ids.includes(record.id));
  const responses = starts.map(start => {
    const response = rows.find(r => r.phase === "response" && r.requestId === start.requestId);
    if (!response) return { requestId: start.requestId, status: null, verdict: null, errors: ["Sem resposta HTTP salva."] };
    const body = JSON.parse(response.body);
    if (response.status !== 200) return { requestId: start.requestId, status: response.status, verdict: null, errors: [body.error?.message ?? "Erro HTTP"] };
    const content = (body.candidates?.[0]?.content?.parts ?? []).filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("");
    const parsed = parseBatch(content, VerdictSchema, [record.id]);
    const verdict = parsed.valid[0];
    if (!verdict) return { requestId: start.requestId, status: response.status, verdict: null, errors: Object.values(parsed.errors), responseHash: hash(response.body) };
    const errors = validateVerdict(verdict, record.proposal!, themes);
    const decision = errors.length ? null : decideRecord({ ...record, verdict }, question, themes, manifest.config);
    return { requestId: start.requestId, status: response.status, responseHash: hash(response.body), verdict,
      errors, decision, structurallyValidButUndecidable: !errors.length && !decision,
      blockersForOutside: record.proposal?.fora ? { questionWarnings: question.avisos, classifierUncertainties: record.proposal.incertezas,
        judgeAlerts: verdict.alertas, unsupportedRubrics: ["tema_central", "evidencia_textual", "distincao_de_concorrentes"].filter(k => verdict[k as "tema_central"].avaliacao !== "sustentado") } : null };
  });
  return { id: record.id, attempts: record.attempts, proposal: record.proposal, persistedErrors: record.errors, responses };
});
await atomicJson(`${directory}/diagnosis.json`, { at: now(), source, fingerprint: manifest.fingerprint, diagnostics,
  methodology: "Reaplica schema, validateVerdict e decideRecord às respostas HTTP salvas. Não altera registros, regras ou contadores; não faz inferência ou conferência jurídica." });
const notes: Record<string, string> = {
  Q0017: "Um HTTP 429 e quatro respostas que rejeitam o tema proposto e afirmam fora_sustentado=true. O validador atual só permite sustentar fora se o classificador já propôs fora. Trata-se de incompatibilidade entre a conclusão do juiz e o contrato, não de ausência de resposta. A correção futura deve explicitar como representar uma discordância do juiz que aponte ausência de tema, sem publicar um tema inadequado.",
  Q0083: "Três HTTP 429 e duas respostas com extras_sustentados_ids=[5150], embora o classificador não tenha proposto esse extra. O juiz pode apenas confirmar um subconjunto dos extras propostos. Houve resposta HTTP, mas o conteúdo foi rejeitado pela integridade dos IDs; o campo alternativo seria o canal previsto para outro destino central.",
  Q0154: "As cinco respostas HTTP 200 confirmam fora_sustentado=true e as três rubricas sustentadas. A proposta, porém, contém uma incerteza. decide() adiciona essa incerteza aos motivos de revisão, impedindo aceitar fora; como proposta e parecer não têm tema, a revisão também não pode ser produzida. Este bloqueio persiste independentemente de um novo parecer idêntico. O feedback genérico sobre sustentação de fora não identifica a causa real, que é a combinação incerteza + ausência de tema.",
  Q0298: "O juiz alternou três respostas HTTP 429 com dois pareceres que afirmam fora_sustentado=true para uma proposta dentro da árvore. Assim como na Q0017, essa discordância é rejeitada pelo contrato atual. O histórico por tentativa abaixo distingue erros de serviço de erros de validação; não basta aumentar o orçamento para resolver a incompatibilidade.",
  Q0319: "As cinco tentativas do juiz receberam HTTP 429 RESOURCE_EXHAUSTED, sem parecer. A proposta do classificador está válida e salva. O corpo do servidor informa apenas Resource exhausted. Please try again later, sem identificar teto diário, RPM ou outra cota específica. O serviço voltou a responder nas questões seguintes; isso não permite concluir sozinho a causa exata do 429. Esta pendência é de serviço, distinta das incompatibilidades de contrato dos outros itens."
};
const lines = ["# Diagnóstico das pendências v20", "", "Análise técnica das respostas já recebidas, sem novas chamadas, alteração de regras ou zeragem de contadores. Não é conferência jurídica das justificativas do modelo.", "",
  ...diagnostics.flatMap(d => [`## ${d.id}`, "", notes[d.id] ?? "Consulte a repetição das validações no JSON.", "",
    `Tentativas do juiz: ${d.attempts?.judge}. Respostas HTTP: ${d.responses.map(r => r.status ?? "ausente").join(", ")}. Respostas com schema e validação válidos, mas sem decisão possível: ${d.responses.filter(r => "structurallyValidButUndecidable" in r && r.structurallyValidButUndecidable).length}.`, ""]),
  "## Consequência para a entrega", "", "O aumento do teto para US$75 não altera o limite de cinco tentativas por etapa. As respostas rejeitadas permanecem no log para diagnóstico, sem serem promovidas silenciosamente a parecer aceito ou decisão. Uma eventual correção do contrato deve ter versão própria e indicar quais resultados foram reprocessados; o experimento atual permanece comparável sob as regras originais.", "",
  "Fontes: src/validation.ts (validação e decisão), experiments/no-rag-v19/engine.ts (aceitação de parecer e retentativas), checkpoint.json e requests.jsonl da r2. O JSON contém os pareceres recebidos, hashes, validações e bloqueios por tentativa.", ""];
await writeFile(`${directory}/diagnosis.md`, lines.join("\n"));
console.log(JSON.stringify({ directory, ids: diagnostics.map(d => d.id) }));
