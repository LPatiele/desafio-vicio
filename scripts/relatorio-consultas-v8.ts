import { readFile } from "node:fs/promises";
import { loadData, indexThemes } from "../src/data.js";
import { evaluate, loadExperiment, metrics, matchesBranch } from "../src/evaluation.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { atomicJson, hash, resolveRoot } from "../src/utils.js";

const names = ["individual-v3-invertido-50", "local-penal50-v7", "local-penal50-v8-auto-r2", "local-penal50-v8-tools-r2"];
const data = await loadData(), ids = data.questions.slice(0, 50).map(q => q.id), themes = indexThemes(data.themes);
const provisional = (await readFile(resolveRoot("referencias/analise-propria-v2/referencia.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
const reports = [];
const inventory: unknown[] = [];
for (const name of names) {
  const evaluation = await evaluate(name, data, ids, "exploratorio", "analise-propria-v2");
  const exp = await loadExperiment(name, data);
  const { records, directory, manifest } = exp;
  const raw = await readFile(`${directory}/records.json`, "utf8");
  const requests = (await readFile(`${directory}/requests.jsonl`, "utf8")).trim().split("\n").map(l => JSON.parse(l));
  const starts = requests.filter(r => r.phase === "start"), responses = requests.filter(r => r.phase === "response");
  const usage = { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cost: 0 };
  for (const response of responses) {
    let body: any; try { body = JSON.parse(response.body); } catch { continue; }
    usage.prompt_tokens += body.usage?.prompt_tokens ?? 0; usage.completion_tokens += body.usage?.completion_tokens ?? 0;
    usage.reasoning_tokens += body.usage?.completion_tokens_details?.reasoning_tokens ?? 0; usage.cost += body.usage?.cost ?? 0;
  }
  const noGateRows = evaluation.rows.map(row => {
    const r = records[row.id];
    const config = structuredClone(manifest.config);
    if (config.knowledge) config.knowledge.requireContextForPublication = false;
    const decision = r ? decideRecord(r, data.questions.find(q => q.id === row.id)!, themes, config) : null;
    return { ...row, decisao: decision?.decisao ?? null };
  });
  const citations = Object.values(records).flatMap(record => {
    if (!record.verdict || !record.knowledge) return [];
    const context = JSON.parse(record.knowledge.judgeContext);
    return record.knowledge.sourcesUsed.map(sourceId => ({
      id: record.id, sourceId, source: record.knowledge!.chunks.find(c => c.id === sourceId),
      uses: Object.entries(record.verdict!).filter(([, value]) => JSON.stringify(value).includes(sourceId)),
      decision: record.decision, delivered: context.fontes.some((s: { id: string }) => s.id === sourceId),
    }));
  });
  const mentions = Object.values(records).filter(r => r.verdict).map(r => ({ id: r.id, verdict: r.verdict, decision: r.decision, sources: r.knowledge?.chunks.map(c => ({ id: c.id, title: c.title, locator: c.locator })), queries: r.knowledge?.queries, errors: r.errors }));
  if (name.includes("v8")) inventory.push({ experiment: name, citations, mentions });
  const deliveryAudit = Object.values(records).filter(r => r.verdict && r.knowledge).map(r => {
    const request = starts.filter(x => x.ids?.includes(r.id)).at(-1);
    const delivered = new Set<string>();
    for (const message of request?.body?.messages ?? []) {
      try {
        const value = JSON.parse(message.content);
        for (const source of value.fontes ?? value.questoes?.[0]?.contexto_externo?.fontes ?? []) delivered.add(source.id);
      } catch { /* system, reasoning and non-JSON feedback */ }
    }
    return { id: r.id, finalRequestId: request?.requestId, actualDeliveredIds: [...delivered], citations: r.knowledge!.sourcesUsed,
      allCitationsInActualRequest: r.knowledge!.sourcesUsed.every(id => delivered.has(id)) };
  });
  const operations = Object.values(records).flatMap(r => r.knowledgeAgent?.operations ?? []);
  const rows = Object.values(records).map(r => ({
    id: r.id, attempts: r.attempts?.judge ?? null, decision: r.decision?.decisao ?? null, citations: r.knowledge?.sourcesUsed ?? [],
    retrieved: r.knowledge?.chunks.length ?? null, gaps: r.knowledge?.gaps ?? [], toolRounds: r.knowledgeAgent?.rounds ?? null,
    toolCalls: r.knowledgeAgent?.operations.map(o => ({ name: o.name, arguments: o.rawArguments, state: o.state, status: o.result ? JSON.parse(o.result).status : null, characters: o.result?.length })) ?? [], errors: r.errors,
  }));
  const plausibleAlternativeHits = evaluation.rows.filter(row => row.decisao === "publicar" && !matchesBranch(row.relacao_final) && provisional.find(ref => ref.id === row.id)?.classificacao.alternativos_plausiveis_v2?.includes(row.tema_final)).map(row => row.id);
  const alternativeSensitivity = { addedIds: plausibleAlternativeHits, publishedAgreement: evaluation.overall.published ? (evaluation.overall.publishedAgreementHits + plausibleAlternativeHits.length) / evaluation.overall.published : null, rule: "Sensibilidade separada: aceita só os IDs alternativos explicitamente registrados na v2 antes do teste. Não substitui a métrica principal." };
  reports.push({ name, alternativeSensitivity, verdicts: Object.values(records).filter(r => r.verdict).length, recordsHash: hash(raw), fingerprint: manifest.fingerprint, referenceHash: evaluation.referenceHash, overall: evaluation.overall, publishedDisagreements: evaluation.rows.filter(row => row.decisao === "publicar" && !matchesBranch(row.relacao_final)),
    noLocalGapGate: metrics(noGateRows, data.questions.length), promptHashes: manifest.promptHashes, knowledgeIdentity: manifest.knowledgeIdentity,
    api: { calls: starts.length, responses: responses.length, usage, totalResponseMs: responses.reduce((n: number, r: any) => n + r.durationMs, 0), httpFailures: responses.filter(r => r.status !== 200).map(r => ({ requestId: r.requestId, status: r.status })) },
    errors: Object.values(records).flatMap(r => r.errors.map(e => ({ id: r.id, ...e }))), deliveryAudit,
    retrieval: { registeredQueries: Object.values(records).reduce((n, r) => n + (r.knowledge?.queries.length ?? 0), 0), withCitation: rows.filter(r => r.citations.length).length, citedPublished: metrics(evaluation.rows.filter(row => records[row.id]?.knowledge?.sourcesUsed.length), data.questions.length), uncitedPublished: metrics(evaluation.rows.filter(row => !records[row.id]?.knowledge?.sourcesUsed.length), data.questions.length), citationSourceUses: citations.length, distinctCitedIds: new Set(citations.map(c => c.sourceId)).size, deliveredAndCited: citations.every(c => c.delivered), operations: operations.length, operationNames: Object.fromEntries([...new Set(operations.map(o => o.name))].map(name => [name, operations.filter(o => o.name === name).length])), emptyOperations: operations.filter(o => o.result && JSON.parse(o.result).status === "vazio").length, failedOperations: operations.filter(o => o.result && JSON.parse(o.result).status === "erro").length }, rows });
}
const [auto, tools] = reports.slice(2);
const common = ids.filter(id => auto!.rows.find(r => r.id === id)?.decision && tools!.rows.find(r => r.id === id)?.decision);
const paired = await Promise.all(names.slice(2).map(name => evaluate(name, data, common, "pareado-v8", "analise-propria-v2")));
const v1Sensitivity = await Promise.all(names.slice(2).map(name => evaluate(name, data, ids, "sensibilidade-v1", "analise-propria-v1")));
const [autoExperiment, toolExperiment] = await Promise.all(names.slice(2).map(name => loadExperiment(name, data)));
const controls = { sameCode: autoExperiment!.manifest.codeHash === toolExperiment!.manifest.codeHash,
  samePrompts: JSON.stringify(autoExperiment!.manifest.promptHashes) === JSON.stringify(toolExperiment!.manifest.promptHashes),
  sameDatabase: JSON.stringify(autoExperiment!.manifest.knowledgeIdentity) === JSON.stringify(toolExperiment!.manifest.knowledgeIdentity),
  sameProposals: ids.every(id => JSON.stringify(autoExperiment!.records[id]?.proposal) === JSON.stringify(toolExperiment!.records[id]?.proposal)) };
const changeKey = (experiment: typeof autoExperiment, id: string) => {
  const decision = experiment!.records[id]?.decision;
  return JSON.stringify([decision?.decisao, decision?.tema_central_id, decision?.extras_ids]);
};
const changes = ids.map(id => ({ id, auto: auto!.rows.find(r => r.id === id), tools: tools!.rows.find(r => r.id === id) })).filter(r => changeKey(autoExperiment, r.id) !== changeKey(toolExperiment, r.id));
const publishedIds = (r: typeof auto) => r!.rows.filter(row => row.decision === "publicar").map(row => row.id);
const autoPub = publishedIds(auto), toolsPub = publishedIds(tools);
const publicationTransitions = {
  addedByTools: toolsPub.filter(id => !autoPub.includes(id)).map(id => ({ id, agreement: !tools!.publishedDisagreements.some(row => row.id === id) })),
  removedByTools: autoPub.filter(id => !toolsPub.includes(id)).map(id => ({ id, agreement: !auto!.publishedDisagreements.some(row => row.id === id) })),
  commonPublished: autoPub.filter(id => toolsPub.includes(id)),
};
const report = { publicationTransitions, at: new Date().toISOString(), selected: ids, referenceVersion: "analise-propria-v2", controls, reports,
  paired: { ids: common, auto: paired[0]!.overall, tools: paired[1]!.overall },
  v1Sensitivity: v1Sensitivity.map(r => ({ experiment: r.experiment, overall: r.overall })), changes,
  limits: ["Referência provisória do assistente; 50 itens previamente expostos e sem revisão humana independente.", "Concordância por ramo aceita ancestral/descendente; concordância exata é apresentada separadamente.", "Auto versus ferramentas mantém propostas, modelos, prompt, base e regras; muda o mecanismo de recuperação e o número de inferências.", "Históricos v3/v7 diferem em prompt/corpus/política; diferenças não identificam efeito causal isolado do RAG.", "Simulação sem veto de lacunas reutiliza pareceres: isola somente a regra determinística, não comportamento do modelo."] };
const directory = resolveRoot("output/comparisons/rag-consultas-v8");
await atomicJson(`${directory}/resultados.json`, report);
await atomicJson(`${directory}/inventario-citacoes.json`, inventory);
const pct = (n: number | null) => n === null ? "—" : `${(100 * n).toFixed(1).replace(".", ",")}%`;
const lines = ["# Referência v2 e consultas do juiz — comparação v8", "", "**A meta de 95% não foi atingida.** O juiz com ferramentas publicou nove questões a mais (+18 pontos de cobertura), com seis publicações concordantes e três divergentes adicionais no saldo. A concordância por ramo caiu de 85,2% para 80,6% (−4,6p.p.), e as chamadas subiram de 54 para 142 (2,63 vezes). O resultado favorece a busca automática entre essas duas condições quando a prioridade é precisão, embora ela também fique abaixo da meta.", "", `Gerado em ${report.at}. Mesmo recorte de 50 IDs, referência provisória v2. Classificador 3.5 VL e juiz 3 Super, esforço médio; as propostas do classificador foram reaproveitadas, sem novas chamadas desse papel.`, "", "| Condição | Pareceres/decisões | Publicadas | Concordância por ramo | Exata | Cobertura | Chamadas |", "| --- | --- | --- | --- | --- | --- | --- |"];
for (const r of reports) lines.push(`| ${r.name} | ${r.verdicts}/${r.overall.processed} | ${r.overall.published} | ${r.overall.publishedAgreementHits}/${r.overall.published} (${pct(r.overall.publishedAgreement)}) | ${pct(r.overall.exactPublishedAgreement)} | ${pct(r.overall.coverageAmongSelected)} | ${r.api.calls} |`);

lines.push("", ...report.limits.map(l => `- ${l}`), "", "## Recuperação, custos e erros", "");
for (const r of reports.slice(2)) {
  lines.push(`### ${r.name}`, "", `Consultas registradas: ${r.retrieval.registeredQueries}; operações de ferramenta escolhidas pelo juiz: ${r.retrieval.operations}; distribuição: ${JSON.stringify(r.retrieval.operationNames)}. Resultados vazios: ${r.retrieval.emptyOperations}; erros locais: ${r.retrieval.failedOperations}. Pareceres com ID citado: ${r.retrieval.withCitation}; usos de IDs: ${r.retrieval.citationSourceUses}. Todos os IDs citados foram entregues: ${r.retrieval.deliveredAndCited}.`, "", `Tokens de entrada: ${r.api.usage.prompt_tokens}; saída: ${r.api.usage.completion_tokens}; raciocínio (subconjunto da saída): ${r.api.usage.reasoning_tokens}; custo reportado: ${r.api.usage.cost}. O tempo somado das respostas foi ${(r.api.totalResponseMs / 60000).toFixed(1)} minutos (não equivale ao tempo de parede quando há concorrência).`, "", `Erros registrados: ${JSON.stringify(r.errors)}.`, "");
}
lines.push("## Comparação controlada e incerteza", "", `Os controles conferidos foram: ${JSON.stringify(controls)}. A comparação pareada contém ${common.length} IDs com decisão nas duas condições; os totais gerais mantêm todos os 50 selecionados.`, "", `Nos IDs comuns, automático: ${pct(paired[0]!.overall.publishedAgreement)} por ramo e ${pct(paired[0]!.overall.coverageAmongSelected)} de cobertura; ferramentas: ${pct(paired[1]!.overall.publishedAgreement)} e ${pct(paired[1]!.overall.coverageAmongSelected)}.`, "");
for (const r of reports.slice(2)) lines.push(`- ${r.name}: Wilson95 por ramo ${JSON.stringify(r.overall.publishedAgreementWilson95)}; observação de 95% atingida: ${r.overall.publishedAgreement !== null && r.overall.publishedAgreement >= .95}. Uma proporção observada neste recorte de desenvolvimento não garante precisão futura.`, "");
lines.push("## Efeito da regra de lacunas e da versão da referência", "", "A simulação abaixo mantém os mesmos pareceres e desliga apenas o veto de publicação por lacunas/contexto vazio; não executa novo julgamento.", "", "| Condição | Publicadas real / sem veto | Concordância por ramo real / sem veto | Cobertura real / sem veto |", "| --- | --- | --- | --- |");
for (const r of reports.slice(2)) lines.push(`| ${r.name} | ${r.overall.published}/${r.noLocalGapGate.published} | ${pct(r.overall.publishedAgreement)}/${pct(r.noLocalGapGate.publishedAgreement)} | ${pct(r.overall.coverageAmongSelected)}/${pct(r.noLocalGapGate.coverageAmongSelected)} |`);
lines.push("", "Sensibilidade à referência v1 (mesmas decisões, sem novas chamadas):", "");
for (const r of v1Sensitivity) lines.push(`- ${r.experiment}: ${r.overall.publishedAgreementHits}/${r.overall.published} por ramo (${pct(r.overall.publishedAgreement)}), exata ${pct(r.overall.exactPublishedAgreement)}.`, "");
for (const r of reports.slice(2)) lines.push(`- Sensibilidade a alternativas editoriais já registradas na v2 (${r.name}): ${pct(r.alternativeSensitivity.publishedAgreement)}, IDs adicionais ${r.alternativeSensitivity.addedIds.join(", ") || "nenhum"}. Não é alteração posterior da referência nem substitui a comparação principal.`, "");
lines.push("[Conferência jurídica das citações](conferencia-juridica.md). A concordância temática pode coexistir com conclusão jurídica errada; os dois eixos são apresentados separadamente.", "");
lines.push("## Mudanças de publicação entre os modos", "", `Ferramentas acrescentaram ${publicationTransitions.addedByTools.length} publicações em relação ao automático: ${publicationTransitions.addedByTools.filter(x => x.agreement).length} concordantes por ramo e ${publicationTransitions.addedByTools.filter(x => !x.agreement).length} divergentes. Retiraram ${publicationTransitions.removedByTools.length}: ${publicationTransitions.removedByTools.filter(x => x.agreement).length} concordantes e ${publicationTransitions.removedByTools.filter(x => !x.agreement).length} divergentes. As decisões comuns e todos os IDs estão no JSON.`, "");
lines.push("## Publicações divergentes e pendências", "");
for (const r of reports.slice(2)) {
  lines.push(`**${r.name}.** Publicadas divergentes: ${r.publishedDisagreements.map(row => `${row.id} (${row.tema_final} versus ${row.tema_referencia}, ${row.relacao_final})`).join("; ") || "nenhuma"}. Pendentes de decisão: ${r.rows.filter(row => !row.decision).map(row => row.id).join(", ") || "nenhuma"}.`, "");
}
lines.push("## Referência, implementação e validação", "", "A [referência v2](../../../referencias/analise-propria-v2/README.md) tem 359 IDs: a revisão documental/editorial nova cobre 50, enquanto 309 herdam a análise v1 com limites explícitos. Foram registradas 22 verificações oficiais, cinco mudanças de tema e uma de alternativa (Q0028, CPP 409: cinco dias). Foi congelada antes das execuções; não é gabarito oficial nem validação humana independente.", "", "O ciclo está em [agent-judge.ts](../../../src/knowledge/agent-judge.ts), com contratos e execução em [tools.ts](../../../src/knowledge/tools.ts). O prompt é [juiz.v8-local.md](../../../src/agents/juiz.v8-local.md); configurações [automática](../../../config/individual-v8-auto.json) e [com ferramentas](../../../config/individual-v8-judge-tools.json). O juiz consulta apenas o SQLite jurídico, sem acesso à referência de avaliação. [Documentação](../../../docs/base-local-rag.md).", "", "TypeScript e 69 testes aprovados. A última checagem encontrou uma asserção antiga sensível ao horário de conclusão de promises no teste do limitador; ela foi corrigida para verificar a duração das janelas de reservas persistidas. O limitador e o código dos experimentos não foram alterados. [Log de testes](testes.txt), [validação dos limites, entrega e controles](validacao-tecnica.json).", "", "Foram 196 chamadas nos experimentos definitivos, mais 10 envios iniciados nos ensaios interrompidos (oito respostas registradas); estes não entram nas métricas de qualidade. O custo reportado nas respostas definitivas foi zero. Não houve HTTP 429 ou falha HTTP nas duas condições definitivas. Os erros de coerência e as pendências são mantidos, sem tentativas extras ou conversão automática para fora.", "", "Para reproduzir os relatórios sem novas chamadas: `node --import tsx scripts/relatorio-consultas-v8.ts` e `python3 scripts/conferencia-consultas-v8.py`. A conferência jurídica consolida notas documentais registradas; não realiza automaticamente uma nova pesquisa ou validação independente.", "");
lines.push("## Registros e conferência", "", "[Resultados completos](resultados.json), [inventário das citações e pareceres](inventario-citacoes.json). A conferência jurídica substantiva é registrada separadamente: entrega/autenticidade de um ID não comprova apoio à afirmação.", "", "As execuções iniciais v8 (sem sufixo r2) foram interrompidas ao encontrar o campo adicional index do provedor em tool_calls. Foram preservadas com interrupcao.json. As condições definitivas r2 usam o mesmo código corrigido; os ensaios interrompidos não entram nas métricas acima.");
await import("node:fs/promises").then(fs => fs.writeFile(`${directory}/relatorio.md`, lines.join("\n") + "\n"));
console.log(JSON.stringify({ directory, commonCompleted: common.length, conditions: reports.map(r => ({ name: r.name, overall: r.overall, calls: r.api.calls })) }, null, 2));
