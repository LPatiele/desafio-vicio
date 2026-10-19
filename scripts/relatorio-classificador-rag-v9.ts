import { readFile, writeFile } from "node:fs/promises";
import { loadData } from "../src/data.js";
import { evaluate, loadExperiment, matchesBranch } from "../src/evaluation.js";
import { atomicJson, resolveRoot, hash, exists } from "../src/utils.js";

const names = ["local-penal50-v9-control", "local-penal50-v9-classifier-tools"];
const data = await loadData(), ids = data.questions.slice(0, 50).map(q => q.id);
const provisional = (await readFile(resolveRoot("referencias/analise-propria-v2/referencia.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
const reports = [], citationInventory: unknown[] = [], classifierInventory: unknown[] = [];
const experiments = [];
for (const name of names) {
  const evaluation = await evaluate(name, data, ids, "exploratorio", "analise-propria-v2");
  const exp = await loadExperiment(name, data); experiments.push(exp);
  const records = ids.map(id => exp.records[id]!);
  const raw = await readFile(`${exp.directory}/records.json`, "utf8");
  const requests = (await readFile(`${exp.directory}/requests.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  const starts = requests.filter(r => r.phase === "start"), responses = requests.filter(r => r.phase === "response");
  const durationByRole = Object.fromEntries(["classifier", "judge"].map(role => {
    const elapsed = responses.filter(response => starts.find(start => start.requestId === response.requestId)?.role === role && typeof response.durationMs === "number").map(r => r.durationMs).sort((a, b) => a-b);
    return [role, { count: elapsed.length, totalMs: elapsed.reduce((a, b) => a+b, 0), medianMs: elapsed.length ? elapsed[Math.floor((elapsed.length-1)*0.5)] : null, p90Ms: elapsed.length ? elapsed[Math.floor((elapsed.length-1)*0.9)] : null }];
  }));
  const usage = { prompt: 0, completion: 0, reasoning: 0, cost: 0, reportedCostCount: 0 };
  for (const response of responses) {
    let body: any; try { body = JSON.parse(response.body); } catch { continue; }
    usage.prompt += body.usage?.prompt_tokens ?? 0; usage.completion += body.usage?.completion_tokens ?? 0; usage.reasoning += body.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    if (typeof body.usage?.cost === "number") { usage.cost += body.usage.cost; usage.reportedCostCount++; }
  }
  const proposals = evaluation.rows.filter(row => row.relacao_proposta !== null);
  const classifier = { proposed: proposals.length, selected: ids.length, branchHits: proposals.filter(row => matchesBranch(row.relacao_proposta) || row.relacao_proposta === "fora").length,
    exactHits: proposals.filter(row => row.relacao_proposta === "exato" || row.relacao_proposta === "fora").length,
    branchAgreement: proposals.length ? proposals.filter(row => matchesBranch(row.relacao_proposta) || row.relacao_proposta === "fora").length / proposals.length : null,
    exactAgreement: proposals.length ? proposals.filter(row => row.relacao_proposta === "exato" || row.relacao_proposta === "fora").length / proposals.length : null,
    missing: ids.filter(id => !exp.records[id]?.proposal), outside: records.filter(r => r.proposal?.fora).map(r => r.id),
    disagreements: proposals.filter(row => !matchesBranch(row.relacao_proposta) && row.relacao_proposta !== "fora") };
  const delivery = records.filter(r => r.verdict).map(r => {
    const request = starts.filter(s => s.role === "judge" && s.ids.includes(r.id)).at(-1);
    const input = request?.body.messages.find((m: any) => m.role === "user" && m.content.includes('"questoes"'));
    const deliveredSources = input ? JSON.parse(input.content).questoes[0].contexto_externo.fontes : [];
    const sources = deliveredSources.map((s: any) => s.id);
    return { id: r.id, requestId: request?.requestId, delivered: sources, deliveredSources, cited: r.knowledge!.sourcesUsed, allCitationsDelivered: r.knowledge!.sourcesUsed.every(id => sources.includes(id)) };
  });
  const toolStates = records.flatMap(r => r.classifierKnowledgeAgent ? [r.classifierKnowledgeAgent] : []);
  const operations = toolStates.flatMap(s => s.operations);
  const checks = {
    attemptsWithinFive: records.every(r => Object.values(r.attempts ?? {}).every(n => n <= 5)),
    reservationsMatchRequests: records.reduce((n, r) => n + Object.values(r.attempts ?? {}).reduce((a, b) => a + b, 0), 0) === starts.length,
    classifierHasNoOriginalLabels: starts.filter(s => s.role === "classifier").every(s => !JSON.stringify(s.body.messages).includes('"rotulo_original"') && !JSON.stringify(s.body.messages).includes('\\"rotulo_original\\"')),
    classifierHasNoReferenceFields: starts.filter(s => s.role === "classifier").every(s => !/resposta_proposta|tema_referencia|alternativos_plausiveis_v2/.test(JSON.stringify(s.body.messages))),
    judgeHasNoToolsOrClassifierTranscript: starts.filter(s => s.role === "judge").every(s => !s.body.tools && !s.body.messages.some((m: any) => m.role === "tool")),
    judgeQueriesAutomatic: records.every(r => !r.knowledge || r.knowledge.queries.length === 4 && r.knowledge.queries.every(q => ["questao", "classificador", "origem", "concorrentes"].includes(q.role))),
    allJudgeCitationsDelivered: delivery.every(r => r.allCitationsDelivered),
    roundsWithinTwo: toolStates.every(s => s.rounds <= 2), toolCallsWithinFour: toolStates.every(s => s.operations.length <= 4),
    toolCallsPerAcceptedMessageWithinTwo: toolStates.every(s => s.messages.every(m => !m.tool_calls || m.tool_calls.length <= 2)),
    classifierDocumentsWithinSix: records.every(r => !r.classifierKnowledge || r.classifierKnowledge.chunks.length <= 6),
    judgeDocumentsWithinSix: records.every(r => !r.knowledge || r.knowledge.chunks.length <= 6),
    toolResultsWithin16000: toolStates.every(s => s.operations.reduce((n, o) => n + (o.result?.length ?? 0), 0) <= 16000),
    noClassifierSourceIdsInProposal: records.every(r => !r.proposal || !/S-[a-f0-9]{12}\b/.test(JSON.stringify(r.proposal))),
  };
  if (Object.values(checks).some(v => !v)) throw new Error(`Falha de isolamento/limites: ${name}: ${JSON.stringify(checks)}`);
  for (const record of records) {
    if (record.verdict && record.knowledge) for (const sourceId of record.knowledge.sourcesUsed) citationInventory.push({ experiment: name, id: record.id, sourceId,
      source: record.knowledge.chunks.find(c => c.id === sourceId), deliveredSource: delivery.find(d => d.id === record.id)?.deliveredSources.find((s: any) => s.id === sourceId),
      uses: Object.entries(record.verdict).filter(([, value]) => JSON.stringify(value).includes(sourceId)), proposal: record.proposal, decision: record.decision });
    if (record.proposal) classifierInventory.push({ experiment: name, id: record.id, question: data.questions.find(q => q.id === record.id), proposal: record.proposal,
      queries: record.classifierKnowledge?.queries ?? [], sources: record.classifierKnowledge?.chunks ?? [], operations: record.classifierKnowledgeAgent?.operations ?? [], verdict: record.verdict, decision: record.decision });
  }
  const running = await exists(`${exp.directory}/run.lock`);
  const executionSummary = await exists(`${exp.directory}/last-run.json`) ? JSON.parse(await readFile(`${exp.directory}/last-run.json`, "utf8")) : null;
  const plausibleAlternativeHits = evaluation.rows.filter(row => row.decisao === "publicar" && !matchesBranch(row.relacao_final) && provisional.find(ref => ref.id === row.id)?.classificacao.alternativos_plausiveis_v2?.includes(row.tema_final)).map(row => row.id);
  const alternativeSensitivity = { addedIds: plausibleAlternativeHits, publishedAgreement: evaluation.overall.published ? (evaluation.overall.publishedAgreementHits + plausibleAlternativeHits.length) / evaluation.overall.published : null, rule: "Só alternativas registradas na v2 antes do teste; não substitui a métrica principal." };
  reports.push({ name, running, executionSummary, config: exp.manifest.config, fingerprint: exp.manifest.fingerprint, codeHash: exp.manifest.codeHash, promptHashes: exp.manifest.promptHashes, knowledgeIdentity: exp.manifest.knowledgeIdentity,
    recordsHash: hash(raw), referenceHash: evaluation.referenceHash, alternativeSensitivity, classifier, verdicts: records.filter(r => r.verdict).length, overall: evaluation.overall,
    publishedDisagreements: evaluation.rows.filter(row => row.decisao === "publicar" && !matchesBranch(row.relacao_final)), pending: records.filter(r => !r.decision).map(r => r.id),
    outsideDisagreements: evaluation.rows.filter(row => row.decisao === "fora" && row.relacao_final !== "fora"),
    pendingDetails: records.filter(r => !r.decision).map(r => ({ id: r.id, hasProposal: !!r.proposal, hasVerdict: !!r.verdict, attempts: r.attempts ?? {},
      classifierStatus: r.classifierKnowledgeAgent?.status ?? null, proposedOutside: r.proposal?.fora ?? null,
      judgeConfirmedOutside: r.verdict?.fora_sustentado ?? null, alternative: r.verdict?.tema_alternativo_id ?? null, errors: r.errors })),
    calls: { total: starts.length, classifier: starts.filter(s => s.role === "classifier").length, judge: starts.filter(s => s.role === "judge").length, responses: responses.length, httpFailures: responses.filter(s => s.status !== 200).map(s => ({ requestId: s.requestId, status: s.status })), usage, durationByRole },
    retrieval: { classifierOperations: operations.length, names: Object.fromEntries([...new Set(operations.map(o => o.name))].map(n => [n, operations.filter(o => o.name === n).length])), empty: operations.filter(o => o.result && JSON.parse(o.result).status === "vazio").length,
      toolErrors: operations.filter(o => o.result && JSON.parse(o.result).status === "erro").length, judgeRegisteredQueries: records.reduce((n, r) => n + (r.knowledge?.queries.length ?? 0), 0), judgeWithCitations: records.filter(r => r.knowledge?.sourcesUsed.length).length },
    checks, delivery, errors: records.flatMap(r => r.errors.map(e => ({ id: r.id, ...e }))), rows: evaluation.rows });
}
const [control, treatment] = reports;
const common = ids.filter(id => experiments.every(e => e.records[id]?.decision));
const paired = await Promise.all(names.map(n => evaluate(n, data, common, "pareado-v9", "analise-propria-v2")));
const commonProposals = ids.filter(id => experiments.every(e => e.records[id]?.proposal));
const changedProposals = commonProposals.filter(id => JSON.stringify(experiments[0]!.records[id]!.proposal!.tema_central_id) !== JSON.stringify(experiments[1]!.records[id]!.proposal!.tema_central_id));
const proposalTransitions = commonProposals.map(id => {
  const rows = reports.map(r => r.rows.find(row => row.id === id)!);
  const hit = (row: typeof rows[number]) => matchesBranch(row.relacao_proposta) || row.relacao_proposta === "fora";
  return { id, control: rows[0], treatment: rows[1], branch: `${hit(rows[0]!) ? "acerto" : "divergencia"}->${hit(rows[1]!) ? "acerto" : "divergencia"}` };
});
const historical = JSON.parse(await readFile(resolveRoot("output/comparisons/rag-consultas-v8/resultados.json"), "utf8")).reports.map((r: any) => ({ name: r.name, overall: r.overall }));
const controls = { sameCode: control!.codeHash === treatment!.codeHash, sameJudgePrompt: control!.promptHashes.judge === treatment!.promptHashes.judge,
  sameDatabase: JSON.stringify(control!.knowledgeIdentity) === JSON.stringify(treatment!.knowledgeIdentity), sameModels: control!.config.classifierModel === treatment!.config.classifierModel && control!.config.judgeModel === treatment!.config.judgeModel,
  newProposalsBothConditions: experiments.every(e => !e.manifest.importedProposals), judgeAutomaticBoth: reports.every(r => r.config.knowledge?.mode === "automatic") };
const directory = resolveRoot("output/comparisons/rag-classificador-v9");
const report = { at: new Date().toISOString(), referenceVersion: "analise-propria-v2", selected: ids, controls, reports, changedProposals, proposalTransitions, historical, paired: { ids: common, conditions: paired.map(p => ({ name: p.experiment, overall: p.overall })) },
  limit: "Mesmo recorte de desenvolvimento já exposto; referência provisória, sem validação humana independente. Classificador com ferramentas inclui novas inferências, instruções de consulta e documentos: o teste não isola o efeito puro do texto jurídico. Juiz usa o mesmo algoritmo automático, cujos resultados podem mudar com a proposta." };
await atomicJson(`${directory}/resultados.json`, report); await atomicJson(`${directory}/citacoes-juiz.json`, citationInventory); await atomicJson(`${directory}/propostas-e-fontes.json`, classifierInventory);
const pct = (n: number | null) => n === null ? "—" : `${(100 * n).toFixed(1).replace(".", ",")}%`;
const lines = ["# Classificador com consultas e juiz automático — v9", "", `Gerado em ${report.at}. 50 questões por condição, modelos 3.5VL/classificador e 3 Super/juiz, base penal50-v3 e referência de avaliação v2.`, "", "[Interpretação dos resultados e recomendação](analise.md). As duas condições geram propostas novas. O controle usa o classificador v3 sem RAG; a condição experimental usa v9 com consultas escolhidas. O juiz mantém prompt v8, quatro consultas automáticas e regras conservadoras de decisão.", "", "| Condição | Propostas / pareceres / decisões | Classificador por ramo | Classificador exato | Publicadas | Publicadas por ramo | Publicadas exatas | Cobertura | Chamadas |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
lines.splice(4, 0, reports.some(r => r.running) ? "**Execução em andamento: números parciais.** Não interpretar diferenças de qualidade antes do fechamento dos dois conjuntos." : "**Execuções encerradas.** Pendências técnicas ou sem decisão permanecem listadas abaixo, sem criar publicações artificiais.", "");
for (const r of reports) lines.push(`| ${r.name} | ${r.classifier.proposed}/${r.verdicts}/${r.overall.processed} | ${pct(r.classifier.branchAgreement)} | ${pct(r.classifier.exactAgreement)} | ${r.overall.published} | ${r.overall.publishedAgreementHits}/${r.overall.published} (${pct(r.overall.publishedAgreement)}) | ${pct(r.overall.exactPublishedAgreement)} | ${pct(r.overall.coverageAmongSelected)} | ${r.calls.total} (${r.calls.classifier}+${r.calls.judge}) |`);
lines.push("", "Concordância por ramo aceita ancestral/descendente; exata exige o mesmo ID. A cobertura usa todos os 50 selecionados. Propostas ausentes são informadas separadamente; a concordância do classificador usa somente propostas válidas. A meta de 95% refere-se à concordância temática provisória, não à correção jurídica integral.", "", `Controles verificados: ${JSON.stringify(controls)}. Há ${common.length} IDs com decisão em ambas; temas propostos diferentes em ${changedProposals.length} IDs.`, "", report.limit, "", "## Execução, contexto e erros", "");
const difference = (a: number | null, b: number | null) => a === null || b === null ? "—" : `${((b-a)*100).toFixed(1).replace(".", ",")} pontos percentuais`;
lines.push(`Diferença tratamento menos controle: concordância das publicadas por ramo ${difference(control!.overall.publishedAgreement, treatment!.overall.publishedAgreement)}; exata ${difference(control!.overall.exactPublishedAgreement, treatment!.overall.exactPublishedAgreement)}; cobertura ${difference(control!.overall.coverageAmongSelected, treatment!.overall.coverageAmongSelected)}.`, "", `Propostas pareadas: ${commonProposals.length}; mudanças de acerto por ramo: ${JSON.stringify(Object.fromEntries([...new Set(proposalTransitions.map(t => t.branch))].map(k => [k, proposalTransitions.filter(t => t.branch === k).length])))}. A tabela geral ainda pode conter quantidades distintas de questões concluídas; o JSON contém também as métricas no conjunto comum.`, "");
for (const r of reports) {
  lines.push(`### ${r.name}`, "", `Chamadas: classificador ${r.calls.classifier}, juiz ${r.calls.judge}. Consultas de ferramenta do classificador: ${r.retrieval.classifierOperations} (${JSON.stringify(r.retrieval.names)}), vazias: ${r.retrieval.empty}, erros locais: ${r.retrieval.toolErrors}. Consultas registradas do juiz: ${r.retrieval.judgeRegisteredQueries}; pareceres do juiz com ID citado: ${r.retrieval.judgeWithCitations}.`, "", `Tokens: entrada ${r.calls.usage.prompt}, saída ${r.calls.usage.completion}, raciocínio ${r.calls.usage.reasoning} (subconjunto da saída). Custo reportado: ${r.calls.usage.cost}, presente em ${r.calls.usage.reportedCostCount}/${r.calls.responses} respostas.`, "", `Limites/isolamento: ${JSON.stringify(r.checks)}. Pendentes: ${r.pending.join(", ") || "nenhum"}.`, "", `Erros: ${JSON.stringify(r.errors)}.`, "", `Publicadas divergentes: ${r.publishedDisagreements.map(r => `${r.id} (${r.tema_final} versus ${r.tema_referencia})`).join("; ") || "nenhuma"}.`, "");
  lines.push(`Encerramento registrado: ${JSON.stringify(r.executionSummary)}. Intervalo descritivo Wilson de 95% da concordância por ramo: ${r.overall.publishedAgreementWilson95?.map(pct).join(" a ") ?? "—"}. O recorte não é aleatório nem independente do desenvolvimento; esse intervalo não valida generalização nem garante 95% em produção.`, "");
  lines.push(`Sensibilidade às alternativas já registradas na referência: ${pct(r.alternativeSensitivity.publishedAgreement)}, IDs adicionais: ${r.alternativeSensitivity.addedIds.join(", ") || "nenhum"}. ${r.alternativeSensitivity.rule}`, "");
  lines.push(`Destinos: ${r.overall.published} publicações, ${r.overall.reviewed} revisões, ${r.overall.outside} fora. Fora discordantes da referência: ${r.outsideDisagreements.map(row => row.id).join(", ") || "nenhum"}. Falhas HTTP: ${JSON.stringify(r.calls.httpFailures)}. As respostas interrompidas ou inválidas com HTTP200 constam nos erros de etapa acima e não equivalem a falha de classificação nem a decisão fora.`, "");
  lines.push(`Duração das respostas por papel, em milissegundos: ${JSON.stringify(r.calls.durationByRole)}. Exclui esperas no limitador; não somar os tempos das duas condições como duração de calendário, pois executaram em paralelo.`, "");
}
lines.push("## Histórico exploratório", "", "Estas rodadas usavam propostas antigas reaproveitadas. Servem como contexto, sem isolar o efeito da mudança atual. A comparação principal é o controle novo acima.", "", "| Experimento anterior | Publicadas | Concordância por ramo | Exata | Cobertura |", "| --- | --- | --- | --- | --- |");
for (const r of historical) lines.push(`| ${r.name} | ${r.overall.published} | ${pct(r.overall.publishedAgreement)} | ${pct(r.overall.exactPublishedAgreement)} | ${pct(r.overall.coverageAmongSelected)} |`);
lines.push("", "## Conferência e reprodução", "", "[Resultados e IDs completos](resultados.json), [propostas e fontes do classificador](propostas-e-fontes.json), [citações do juiz](citacoes-juiz.json) e [conferência jurídica](conferencia-juridica.md) e [menções normativas](mencoes-normativas.md). Os IDs técnicos não são incluídos na proposta do classificador, mas seus textos e resultados de ferramentas ficam registrados por questão. Entrega de documento não comprova que a inferência seja correta.", "", "A validação automática comprova estrutura, evidência literal, IDs, limites e integridade dos checkpoints; a conferência jurídica substantiva é separada. A referência não participou da recuperação. Os 72 testes e o preflight estão preservados em testes.txt/preflight-inicial.json; a cópia do código e configurações, sem credenciais, está em codigo/ com hashes. Para reproduzir métricas sem novas chamadas: `node --import tsx scripts/relatorio-classificador-rag-v9.ts`.", "");
await writeFile(`${directory}/relatorio.md`, lines.join("\n") + "\n");
console.log(JSON.stringify({ directory, controls, commonCompleted: common.length, conditions: reports.map(r => ({ name: r.name, classifier: r.classifier, overall: r.overall, calls: r.calls.total })) }, null, 2));
