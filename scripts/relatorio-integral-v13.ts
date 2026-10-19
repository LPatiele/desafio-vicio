import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadData, indexThemes } from '../src/data.js';
import { evaluate } from '../src/evaluation.js';
import { exists } from '../src/utils.js';

const name=process.argv[2]??'gemini-flash-v13-livros-359';
if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name))throw new Error('Experimento inválido.');
const dir=`output/experiments/${name}`, out=`output/comparisons/${name}`;
const data=await loadData(), themes=indexThemes(data.themes);
const evaluation=await evaluate(name,data,data.questions.map(q=>q.id),'exploratorio','analise-propria-v2');
const records=JSON.parse(await readFile(`${dir}/records.json`,'utf8'));
const manifest=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const spend=JSON.parse(await readFile(`${dir}/spend.json`,'utf8'));
const entries=Object.values(spend.entries) as any[];
const events=(await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
const errors=data.questions.flatMap(q=>(records[q.id]?.errors??[]).map((e:any)=>({id:q.id,...e})));
const pending=data.questions.filter(q=>!records[q.id]?.decision).map(q=>({id:q.id,proposal:!!records[q.id]?.proposal,verdict:!!records[q.id]?.verdict,attempts:records[q.id]?.attempts,errors:records[q.id]?.errors??[]}));
const requests=(await readFile(`${dir}/requests.jsonl`,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
const apiFailures=requests.filter(r=>r.phase==='response'&&r.status>=400).map(r=>{const start=requests.find(s=>s.phase==='start'&&s.requestId===r.requestId);let error:any;try{error=JSON.parse(r.body).error;}catch{};return {ids:start?.ids,role:start?.role,model:start?.model,httpStatus:r.status,error};});
const decisions=Object.values(records).filter((r:any)=>r.decision) as any[];
const citations=decisions.flatMap((r:any)=>(r.knowledge?.sourcesUsed??[]).map((id:string)=>{
 const c=r.knowledge.chunks.find((c:any)=>c.id===id);
 const delivered=JSON.parse(r.knowledge.judgeContext).fontes.find((f:any)=>f.id===id);
 return {question:r.id,id,sourceId:c?.sourceId,kind:c?.kind,title:c?.title,locator:c?.locator,url:c?.url,text:delivered?.texto,metadata:c?.metadata,verdict:r.verdict};
}));
const bySource=Object.fromEntries([...new Set(citations.map((c:any)=>c.sourceId))].sort().map(id=>[id,{citations:citations.filter((c:any)=>c.sourceId===id).length,questions:new Set(citations.filter((c:any)=>c.sourceId===id).map((c:any)=>c.question)).size}]));
const retrieval=data.questions.map(q=>{
 const r=records[q.id];const classifier=r?.classifierKnowledge?.chunks??[],judge=r?.knowledge?.chunks??[];
 return {id:q.id,classifierDocuments:classifier.length,judgeDocuments:judge.length,classifierBooks:classifier.filter((c:any)=>c.kind==='doutrina').map((c:any)=>c.id),judgeBooks:judge.filter((c:any)=>c.kind==='doutrina').map((c:any)=>c.id),judgeCitesBooks:citations.some((c:any)=>c.question===q.id&&c.kind==='doutrina'),gaps:r?.knowledge?.gaps??[],classifierToolOperations:r?.classifierKnowledgeAgent?.operations.length??0};
});
const metricsFor=(predicate:(r:any)=>boolean)=>{
 const selected=evaluation.rows.filter(row=>predicate(retrieval.find(r=>r.id===row.id)));
 const published=selected.filter(r=>r.decisao==='publicar');
 return {questions:selected.length,published:published.length,branchHits:published.filter(r=>['exato','ancestral','descendente'].includes(r.relacao_final??'')).length,exactHits:published.filter(r=>r.relacao_final==='exato').length};
};
const groupedErrors=Object.entries(errors.reduce((a:Record<string,number>,e:any)=>{a[e.message]=(a[e.message]??0)+1;return a;},{})).sort((a,b)=>Number(b[1])-Number(a[1]));
const report={experiment:name,generatedAt:new Date().toISOString(),status:pending.length?'partial':'complete',models:{classifier:manifest.config.classifierModel,judge:manifest.config.judgeModel},snapshot:manifest.config.knowledge.snapshot,promptHashes:manifest.promptHashes,knowledgeIdentity:manifest.knowledgeIdentity,evaluation,spending:{calls:entries.filter(e=>e.state!=='not_sent').length,knownCostUsd:entries.reduce((n,e)=>n+(e.actualUsd??0),0),unknownCalls:entries.filter(e=>e.actualUsd===null).length,reservedOrKnownUsd:entries.reduce((n,e)=>n+(e.actualUsd??e.reservedUsd),0),byRole:Object.fromEntries(['classifier','judge'].map(role=>[role,{calls:entries.filter(e=>e.role===role).length,costUsd:entries.filter(e=>e.role===role).reduce((n,e)=>n+(e.actualUsd??0),0),inputTokens:entries.filter(e=>e.role===role).reduce((n,e)=>n+(e.usage?.inputTokens??0),0),cachedInputTokens:entries.filter(e=>e.role===role).reduce((n,e)=>n+(e.usage?.cachedInputTokens??0),0),outputTokens:entries.filter(e=>e.role===role).reduce((n,e)=>n+(e.usage?.outputTokens??0),0)}]))},pending,errors,groupedErrors,apiFailures,citations,bySource,retrieval,observationalGroups:{judgeDeliveredBooks:metricsFor(r=>r.judgeBooks.length>0),judgeWithoutBooks:metricsFor(r=>r.judgeBooks.length===0)},publishedDisagreements:evaluation.rows.filter(r=>r.decisao==='publicar'&&!['exato','ancestral','descendente'].includes(r.relacao_final??'')),stops:events.filter(e=>e.type==='stopped'),limitations:['Concordância com referência provisória não é validação jurídica independente.','Uma execução com a nova base e novos prompts não isola causalmente o incremento do RAG. Os grupos com e sem livros têm questões de dificuldade e conteúdo diferentes.','IDs, hashes e proveniência das citações foram verificados pelo pipeline. A pertinência e interpretação de todas as passagens não são validadas automaticamente.','O custo é uma estimativa pelas tarifas versionadas e tokens informados; a fatura do provedor prevalece.']};
await mkdir(out,{recursive:true});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const pct=(n:number|null)=>n===null?'—':`${(100*n).toFixed(2)}%`;
const m=evaluation.overall;
const markdown=[`# Teste integral das 359 questões`,``,`Estado: ${report.status}. ${m.processed}/359 decisões, ${pending.length} pendências. Classificador ${report.models.classifier}; juiz ${report.models.judge}. Base \`${report.snapshot}\`.`,``,`| Indicador | Resultado |`,`| --- | ---: |`,`| Publicadas | ${m.published} |`,`| Revisão | ${m.reviewed} |`,`| Fora | ${m.outside} |`,`| Cobertura de publicação | ${pct(m.coverageOf359)} |`,`| Concordância por ramo entre publicadas | ${pct(m.publishedAgreement)} (${m.publishedAgreementHits}/${m.published}) |`,`| Concordância exata entre publicadas | ${pct(m.exactPublishedAgreement)} |`,`| Classificador antes do filtro | ${pct(m.classifierAgreementBeforeFilter)} |`,`| Chamadas aos modelos | ${report.spending.calls} |`,`| Custo conhecido estimado | US$ ${report.spending.knownCostUsd.toFixed(4)} |`,``,`Meta observada de 95% por ramo: ${m.publishedAgreement===null?'não avaliável':m.publishedAgreement>=.95?'atingida neste conjunto e nesta referência':'não atingida'}. Intervalo de Wilson: ${m.publishedAgreementWilson95?.map(pct).join(' a ')??'—'}. Concordância exata e por ramo são reportadas separadamente.`,``,`## Falhas e retentativas`,``,`${errors.length} ocorrências em ${new Set(errors.map((e:any)=>e.id)).size} questões. As tentativas não foram reiniciadas para melhorar resultados.`,``,...groupedErrors.map(([error,n])=>`- ${n} × ${error}`),``,`## Bloqueios da API`,``,...apiFailures.map(f=>`- ${f.ids?.join(', ')}: ${f.role}/${f.model}, HTTP ${f.httpStatus}, ${f.error?.message??'resposta sem JSON'}`),``,`## Uso dos livros e citações`,``,`${retrieval.filter(r=>r.classifierBooks.length).length} questões receberam livros no classificador; ${retrieval.filter(r=>r.judgeBooks.length).length} no juiz; ${retrieval.filter(r=>r.judgeCitesBooks).length} tiveram citação doutrinária no parecer. O JSON contém o inventário das citações, texto entregue e resultados por ID para conferência.`,``,`## Discordâncias entre publicadas`,``,...report.publishedDisagreements.map(r=>`- ${r.id}: proposta/final ${r.tema_final} (${themes.get(r.tema_final??'')?.titulo??'—'}); referência ${r.tema_referencia} (${themes.get(r.tema_referencia??'')?.titulo??'—'}); relação ${r.relacao_final}.`),``,`## Limitações`,``,...report.limitations.map(s=>`- ${s}`),``,`Dados: [report.json](report.json). Registros originais: [records.json](../../experiments/${name}/records.json).`];
await writeFile(`${out}/analise.md`,markdown.join('\n')+'\n');
const csv=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
const cols=['id','decisao','tema_proposto','tema_final','tema_referencia','relacao_proposta','relacao_final'];
await writeFile(`${out}/resultados.csv`,cols.join(',')+'\n'+evaluation.rows.map(row=>cols.map(k=>csv((row as any)[k])).join(',')).join('\n')+'\n');
console.log(JSON.stringify({report:`${out}/analise.md`,status:report.status,metrics:m,spending:report.spending,pending:pending.length},null,2));
