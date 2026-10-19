"""Gera relatório offline; não acessa credenciais, rede ou execução v20-r2."""
from pathlib import Path
import json, re, csv, hashlib, collections, datetime
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT.parent/'DesafioVicio'
OUT=ROOT/'relatorio'
REF={x['id']:x for x in map(json.loads,(ROOT/'referencias/analise-propria-v2/referencia.jsonl').open())}
THEMES={r['tema_id']:r for r in csv.DictReader((ROOT/'anexos/temas.csv').open())}
SOURCES={}
def read(p):
 p=Path(p);raw=p.read_bytes();SOURCES[str(p)]={'sha256':hashlib.sha256(raw).hexdigest()};return json.loads(raw)
def lines(p):
 if not p.exists():return []
 raw=p.read_bytes();SOURCES[str(p)]={'sha256':hashlib.sha256(raw).hexdigest()}
 return [json.loads(l) for l in raw.splitlines() if l.strip()]
def ancestors(t):
 a=set()
 while t and t not in a:a.add(t);t=THEMES.get(t,{}).get('parent_id')
 return a
def rel(t,r):
 if not t or not r:return 'sem_tema'
 if t==r:return 'exato'
 if t in ancestors(r):return 'ancestral'
 if r in ancestors(t):return 'descendente'
 return 'irmao' if THEMES.get(t,{}).get('parent_id') and THEMES.get(t,{}).get('parent_id')==THEMES.get(r,{}).get('parent_id') else 'distinto'
def measure(records,n):
 dec=[r['decision'] for r in records.values() if r.get('decision')];c=collections.Counter(d['decisao'] for d in dec)
 relationships=collections.Counter(rel(d.get('tema_central_id'),REF[d['id']]['classificacao']['tema_id']) for d in dec if d['decisao']=='publicar')
 hits=sum(relationships[k] for k in ['exato','ancestral','descendente']);p=c['publicar']
 return {'selecionadas':n,'propostas':sum(bool(r.get('proposal')) for r in records.values()),'pareceres':sum(bool(r.get('verdict')) for r in records.values()),'concluidas':len(dec),'publicar':p,'revisar':c['revisar'],'fora':c['fora'],'pendentes':n-len(dec),'concordantes_publicadas':hits,'divergentes_publicadas':p-hits,'exatas_publicadas':relationships['exato'],'precisao_ramo':hits/p if p else None,'precisao_exata':relationships['exato']/p if p else None,'cobertura':p/n if n else None,'cobertura_359':p/359,'relacoes_publicadas':dict(relationships)}
def classify_error(message):
 s=message.lower()
 if 'consulta válida' in s or 'consulta valida' in s:return 'consulta obrigatória ausente'
 if 'evid' in s and ('localiz' in s or 'campo' in s):return 'evidência/campo'
 if 'contradit' in s or 'fora sustentado' in s:return 'contradição do parecer'
 if 'não foi possível decidir' in s or 'nao foi possivel decidir' in s:return 'decisão sem tema válido'
 if 'length' in s or 'trunc' in s or 'interrompida (error)' in s:return 'saída interrompida'
 if 'tool' in s or 'ferramenta' in s or 'operaç' in s:return 'protocolo/ferramenta'
 if 'timeout' in s or 'timed out' in s:return 'timeout'
 if 'fetch failed' in s or 'network' in s or 'rede' in s:return 'rede'
 if 'http' in s:return 'HTTP'
 if 'ausente' in s or 'não retorn' in s:return 'resultado ausente'
 return 'outra validação/execução'
LEDGERS={}
for p in (ROOT/'output').rglob('spend.json'):
 if any(k in p.parts for k in ['migrations','source-snapshot','source-snapshot-wirefix']):continue
 # Ler apenas ledgers; a tabela não exporta configuração, contas ou credenciais.
 d=read(p)
 for rid,e in d.get('entries',{}).items():LEDGERS.setdefault(rid,[]).append((p,e))
NOTES={
'piloto-v1':'Primeiro lote de 30 da pasta atual: timeout, juiz não chamado; não confundir com v1 da pasta anterior.',
'piloto-20-v3':'JSON truncado: 17.669/18.000 tokens de saída em raciocínio. Motivou teste sem raciocínio.',
'piloto-20-v3-sem-raciocinio':'Integração concluída, filtro publicou todas. Pela referência v1 histórica: 13/20; aqui recalculado contra v2.',
'piloto-2x10-v3-raciocinio':'Classificador manteve 13/20 na referência histórica. Seis chamadas; tempo somado 5,36 vezes o anterior; o aumento publicado histórico veio do denominador.',
'piloto-5x10-v3-juiz-nemotron35':'Controle N3/N3.5: 14 chamadas. Comparar à inversão nos mesmos 50 IDs, não apenas publicações selecionadas.',
'piloto-5x10-v3-invertido-nemotron35':'N3.5/N3: 10 chamadas, todas as decisões. Nas mesmas 37 publicações do controle, 30 concordantes contra 29.',
'piloto-5x10-v2-juiz-nemotron35':'V2 N3/N3.5: duas pendências; não demonstrou ganho consistente frente à v3. Q0044 sem proposta válida.',
'piloto-5x10-v2-invertido-nemotron35':'V2 N3.5/N3: proporção publicada maior com apenas 11 publicações e 11 pendências; não é superioridade comprovada.',
'individual-v3-invertido-50':'Individual: nas mesmas 36 publicações do lote invertido, 26 concordantes contra 31. Mais chamadas e menor cobertura.',
'contexto-api-v5-q0001':'Busca remota indisponível/incompleta levou a revisão; uma questão não mede ganho de pesquisa.',
'local-penal50-v7':'RAG+prompt+política: 85,7% publicados e 56% cobertura, frente a 73,7%/76% no individual. Não isola RAG; propostas reaproveitadas.',
'local-penal50-v8-auto':'Ensaio interrompido por campo extra index no protocolo; excluir da comparação final v8. Propostas importadas.',
'local-penal50-v8-tools':'Ensaio interrompido pela mesma incompatibilidade; excluir da comparação final v8. Propostas importadas.',
'local-penal50-v8-auto-r2':'Controle v8 definitivo, menor custo de chamadas e maior concordância que ferramentas. 46 decisões comuns entre os braços.',
'local-penal50-v8-tools-r2':'Contra automático: +18 p.p. cobertura, −4,6 p.p. concordância e 142/54 = 2,63 vezes envios do juiz.',
'local-penal50-v9-control':'Controle contemporâneo sem RAG no classificador; propostas novas nas duas condições v9.',
'local-penal50-v9-classifier-tools':'Contra controle: +8 p.p. cobertura, −1,3 p.p. concordância, +73,3% chamadas (175/101); três concordantes e uma divergente líquidas a mais.',
'pagos-v10-gemini-openai':'Cota zero para o classificador; nenhuma decisão. Não há evidência sobre a qualidade da dupla.',
'pagos-v10-juiz-isolado':'Proposta importada; juiz sem resposta válida e reserva insuficiente para continuar. Não mede qualidade de GPT-5.2.',
'gemini-flash-v11-piloto':'Mesmos 10 IDs: 7/7 por ramo contra 6/7 no Nemotron v9. Só sete publicações; Wilson 95% ≈64,6%–100%.',
'gemini-flash-v13-livros-359':'Nos dez concluídos: 8/9 publicados contra 7/7 no v11; base/prompts/política mudaram juntos. Cobertura do case 9/359.',
'gemini35-v15-livros-359':'Somente uma decisão; bloqueio diário do juiz, não excesso observado de RPM. Sem conclusão de qualidade.',
'gemini35-v16-projeto2-359':'Individual interrompido por bloqueio financeiro; 179 pendências. Comparação pareada com b30 disponível, sem condição integral completa.',
'paid-v17-b30':'Lote 30: mais rápido e menor custo por decisão, mas 198 pendências. Nas 66 publicações comuns à v16: 54 concordantes contra 60.',
'paid-v17-b20':'Interrompido por HTTP 402. Amostra concluída parcial; não interpretar 20/22 como vitória do lote vinte.',
'vertex-v18-piloto-10-b10':'Verificou funcionamento dos dois modelos pelo novo canal. Pequeno recorte já usado em desenvolvimento.',
'vertex-v18-359-b20':'218 decisões; 141 pendências. Nas 158 publicações comuns à v19: 87,3% aqui contra 88,6% sem RAG.',
'vertex-v18-359-b10':'Interrompido a pedido da usuária; 198 pendências. Nas 126 publicações comuns à v19: 81,7% aqui contra 88,1% sem RAG.',
'model-only-v19-359':'359 decisões; 94 chamadas, 38,8 min, sem erros HTTP/rede. Retirar RAG resolveu completude nesta condição, mas não atingiu 95%. Prompts/retentativas também mudaram.',
'pro-judge-v20-359':'Tentativa encerrada sem conectividade: nenhuma resposta HTTP/proposta/parecer. Não avalia o juiz Pro; reservas não são cobrança confirmada.'
}
rows=[]; full_records={}
paths=list((ROOT/'output/experiments').glob('*/records.json'))
paths+=list((ROOT/'output/paid-v17/paid-v17-359').glob('b*/records.json'))
paths+=list((ROOT/'output/vertex-v18').glob('*/*/records.json'))
paths+=list((ROOT/'output/no-rag-v19').glob('*/records.json'))
paths+=[ROOT/'output/individual-v20/pro-judge-v20-359/records.json']
active_folder=ROOT/'output/individual-v20/pro-judge-v20-359-r2'
active_status=read(active_folder/'status.json') if (active_folder/'status.json').exists() else {}
active_finished=active_status.get('state')=='finished'
if active_finished:paths.append(active_folder/'records.json')
for p in paths:
 if not p.exists():continue
 folder=p.parent;name=folder.name
 if 'paid-v17' in folder.parts:key='paid-v17-'+name
 elif 'vertex-v18' in folder.parts:key=folder.parent.name+'-'+name
 else:key=name
 records=read(p);full_records[key]=records
 manifest=read(folder/'manifest.json') if (folder/'manifest.json').exists() else {}
 req=lines(folder/'requests.jsonl');events=lines(folder/'events.jsonl');starts={d['requestId']:d for d in req if d.get('phase')=='start'}
 # A recuperação b30 inclui o custo causal do ensaio inicial e diagnóstico, exibidos só aqui na tabela principal.
 includes=[]; diagnostic_ids=set()
 if key=='paid-v17-b30':
  for extra in [folder.parent/'archive/b30-initial-400',folder.parent/'diagnostics/schema']:
   for d in lines(extra/'requests.jsonl'):
    if d.get('phase')=='start':
     starts[d['requestId']]=d
     if extra.name=='schema':diagnostic_ids.add(d['requestId'])
   req+=lines(extra/'requests.jsonl');events+=lines(extra/'events.jsonl');includes.append(str(extra.relative_to(ROOT)))
 usage={e.get('data',{}).get('requestId'):e['data'] for e in events if e.get('type')=='usage' and e.get('data',{}).get('requestId')}
 byrole={r:{'known_usd':0.,'unknown_calls':0,'reserved_unknown_usd':0.,'input_tokens':0,'output_tokens':0,'usage_calls':0,'calls':0} for r in ['classifier','judge','diagnostic']}
 for rid,start in starts.items():
  role=start.get('role');role='diagnostic' if rid in diagnostic_ids else (role if role in byrole else 'diagnostic');z=byrole[role];z['calls']+=1
  entries=LEDGERS.get(rid,[]); ledger=next((e for lp,e in entries if lp==folder/'spend.json'),entries[0][1] if entries else None)
  u=usage.get(rid,{}).get('usage',{})
  if ledger:
   if ledger.get('state')=='not_sent':z['calls']-=1;continue
   actual=ledger.get('actualUsd')
   if actual is None:z['unknown_calls']+=1;z['reserved_unknown_usd']+=ledger.get('reservedUsd',0)
   else:z['known_usd']+=actual
   u2=ledger.get('usage') or {};it=u2.get('inputTokens',0);ot=u2.get('outputTokens',0)
   if u2:z['usage_calls']+=1
  else:
   cost=u.get('cost')
   if cost is None:z['unknown_calls']+=1
   else:z['known_usd']+=cost
   it=u.get('prompt_tokens',u.get('promptTokenCount',0));ot=u.get('completion_tokens',u.get('candidatesTokenCount',0)+u.get('thoughtsTokenCount',0))
   if u:z['usage_calls']+=1
  z['input_tokens']+=it;z['output_tokens']+=ot
 n=len(records)
 if manifest.get('questions'):n=max(n,manifest['questions']) if isinstance(manifest['questions'],int) else n
 met=measure(records,n)
 err=collections.Counter();affected=set();decision_err=0;tech=0
 for q,r in records.items():
  for e in r.get('errors',[]):
   cat=classify_error(e.get('message',''));err[cat]+=1;affected.add(q)
   if e.get('stage')=='decision':decision_err+=1
   else:tech+=1
 http=collections.Counter(str(d['status']) for d in req if d.get('phase')=='response' and isinstance(d.get('status'),int) and d['status']>=400)
 network=sum(d.get('phase')=='network_error' for d in req)
 abnormal=collections.Counter()
 for response in req:
  if response.get('phase')!='response':continue
  body=response.get('body') or response.get('response')
  if isinstance(body,str):
   try:body=json.loads(body)
   except ValueError:body={}
  if isinstance(body,dict):
   for choice in body.get('choices',[]):
    reason=choice.get('finish_reason')
    if reason not in [None,'stop','tool_calls','function_call']:abnormal[reason]+=1
 final=read(folder/'report.json') if (folder/'report.json').exists() else (read(folder/'last-run.json') if (folder/'last-run.json').exists() else {})
 created=manifest.get('createdAt','')
 row={'key':key,'pasta':str(folder),'createdAt':created,'metricas':met,'custo_por_papel':byrole,'chamadas':sum(v['calls'] for v in byrole.values()),'erros':{'ocorrencias_registradas':sum(err.values()),'tecnicas':tech,'decisao':decision_err,'ids_afetados':len(affected),'categorias':dict(err),'http':dict(http),'rede':network,'encerramentos_anormais':dict(abnormal)},'inclui_custos':includes,'importacao':manifest.get('importedProposals',{}).get('experiment'),'duracao_somada_respostas_ms':sum(d.get('durationMs',0) for d in req if d.get('phase')=='response'),'nota':NOTES.get(key,'Consultar registros da condição.')}
 if final.get('durationSeconds') is not None:row['duracao_ultima_invocacao_segundos']=final['durationSeconds']
 rows.append(row)
# Ensaios antigos: formato diferente, sem inferir publicação a partir de candidatos.
old_specs=[
 ('gemma-v0',OLD/'output/runs/2026-10-15T19-47-06-481Z-af82a8bb','Gemma bloqueado nas cinco questões; a sexta falha é sondagem separada. Não houve julgamento.',5),
 ('sondagem-nemotron',OLD/'output/sondagens/2026-10-15T19-50-12-086Z-af3acb5d','Somente classificador: uma proposta válida; não é questão avaliada pelos dois papéis.',1),
 ('sondagem-gemma',OLD/'output/sondagens/2026-10-15T19-51-17-827Z-589a8bcf','Repetição isolada de Q0001: novo 429, sem proposta.',1),
 ('nemotron-duplo-v1',OLD/'output/runs/2026-10-15T20-09-14-502Z-42c1060f','Cinco fluxos concluídos. Três candidatos à publicação; política experimental conservou revisão. Sem publicação liberada.',5),
 ('lote-v2-gemma-dots',OLD/'output/lotes/2026-10-16T00-03-52-547Z-682480b0','Gemma 429; Dots sem campos obrigatórios em cinco respostas. Juiz não chamado.',5),
 ('lote-v3-dots-nemotron',OLD/'output/lotes/2026-10-16T00-06-51-322Z-fe56e37e','Esquema estruturado: cinco fluxos em duas chamadas. Quatro candidatos, mas publicação bloqueada. Comparado ao individual: −80% chamadas, −79,3% entrada e +24,5% tempo.',5),
 ('controle-individual-dots-nemotron',OLD/'output/runs/2026-10-16T00-11-29-306Z-b37956b7','Cinco fluxos em dez chamadas. Três candidatos; publicação bloqueada. Juiz afirmou falsamente ausência de ramo na árvore em Q0001.',5)]
for key,folder,note,n in old_specs:
 records={}
 for f in folder.glob('Q*-resultado.json'):
  d=read(f);qid=d['questao']['id']; records[qid]={'id':qid,'proposal':d.get('proposta'),'verdict':d.get('parecer'),'decision':dict(d['decisao'],id=qid)}
 if key=='sondagem-nemotron':records['Q0001']={'id':'Q0001','proposal':read(folder/'proposta.json')}
 met=measure(records,n);byrole={r:{'known_usd':0.,'unknown_calls':0,'reserved_unknown_usd':0.,'input_tokens':0,'output_tokens':0,'usage_calls':0,'calls':0} for r in ['classifier','judge','diagnostic']}
 responsefiles=list(folder.glob('Q*-classificador.json'))+list(folder.glob('Q*-juiz.json'))
 responsefiles+=list(folder.glob('tentativa-*-classificador.json'))
 if (folder/'juiz.json').exists():responsefiles.append(folder/'juiz.json')
 if (folder/'resposta.json').exists():responsefiles.append(folder/'resposta.json')
 seen=set()
 for f in responsefiles:
  d=read(f);rid=d.get('id_resposta',str(f))
  if rid in seen:continue
  seen.add(rid);role='judge' if 'juiz' in f.name else 'classifier';z=byrole[role];z['calls']+=1
  if d.get('custo_informado') is None:z['unknown_calls']+=1
  else:z['known_usd']+=d['custo_informado']
  u=d.get('uso',{});z['input_tokens']+=u.get('input_tokens',0);z['output_tokens']+=u.get('output_tokens',0);z['usage_calls']+=bool(u)
 errfiles=list(folder.glob('*erro.json'));http=collections.Counter()
 for f in errfiles:
  raw=f.read_text();SOURCES[str(f)]={'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
  if '429' in raw:http['429']+=1
  # Um erro de validação pode acompanhar uma resposta recebida: não é nova chamada.
  sibling=folder/(f.name.replace('-erro.json','-classificador.json'))
  if not sibling.exists():
   byrole['classifier']['calls']+=1;byrole['classifier']['unknown_calls']+=1
 rows.append({'key':key,'pasta':str(folder),'createdAt':read(folder/'manifesto.json').get('inicio',folder.name[:23]+'Z') if (folder/'manifesto.json').exists() else folder.name[:23]+'Z','metricas':met,'custo_por_papel':byrole,'chamadas':sum(v['calls'] for v in byrole.values()),'erros':{'ocorrencias_registradas':len(errfiles),'categorias':{},'http':dict(http),'rede':0},'nota':note,'legado':True})
# Propostas importadas: contabilizar a origem do classificador sem nova cobrança fictícia.
bykey={r['key']:r for r in rows}
if 'pro-judge-v20-359-r2' in bykey:
 left=full_records['model-only-v19-359'];right=full_records['pro-judge-v20-359-r2']
 common=[q for q in left if left[q].get('decision',{}).get('decisao')=='publicar' and right.get(q,{}).get('decision',{}).get('decisao')=='publicar']
 hits=lambda records:sum(rel(records[q]['decision'].get('tema_central_id'),REF[q]['classificacao']['tema_id']) in ['exato','ancestral','descendente'] for q in common)
 a,b=hits(left),hits(right)
 bykey['pro-judge-v20-359-r2']['nota']=f'Encerrado com 354 decisões e cinco pendências; a meta de 95% não foi atingida. Contra v19: concordância agregada 85,8%/85,2% e cobertura 78,6%/86,6%. Nas mesmas {len(common)} publicações: v20 {b}/{len(common)} e v19 {a}/{len(common)} concordantes. Modelo do juiz e tamanho do lote mudaram juntos; não isola o efeito do Pro. Custos desta linha correspondem à r2; a tentativa inicial permanece separada.'
 bykey['pro-judge-v20-359-r2']['comparacao_v19']={'publicacoes_comuns':len(common),'concordantes_v19':a,'concordantes_v20':b}
for r in rows:
 origin=r.get('importacao');r['custo_classificador_reaproveitado_conhecido_usd']=0.;r['classificador_origem_desconhecida']=0
 if origin and origin in bykey:
  source=bykey[origin]['custo_por_papel']['classifier'];r['custo_classificador_reaproveitado_conhecido_usd']=source['known_usd'];r['classificador_origem_desconhecida']=source['unknown_calls']
  r['nota']+=' Classificador reaproveitado de '+origin+'; custo histórico desse papel incluído na visão C+J, sem nova chamada.'
rows.sort(key=lambda r:(0 if r.get('legado') else 1,(r.get('createdAt') or '').replace(':','-').replace('.','-'),r['key']))
now=datetime.datetime.now(ZoneInfo('America/Fortaleza')).isoformat()
def pct(v):return '—' if v is None else f'{100*v:.1f}%'.replace('.',',')
def usd(v):return 'US$ '+f'{v:.6f}'.replace('.',',')
def totals(r):
 known=sum(v['known_usd'] for v in r['custo_por_papel'].values())+r.get('custo_classificador_reaproveitado_conhecido_usd',0)
 unknown=sum(v['unknown_calls'] for v in r['custo_por_papel'].values())+r.get('classificador_origem_desconhecida',0)
 reserve=sum(v['reserved_unknown_usd'] for v in r['custo_por_papel'].values())
 return known,unknown,reserve
def link(r):return '['+r['key']+']('+r['pasta']+'/)'
for r in rows:
 m=r['metricas'];k,u,res=totals(r)
 r['custo_conhecido_total_cj_usd']=k
 r['chamadas_custo_desconhecido_cj']=u
 r['reserva_desconhecida_usd']=res
 r['custo_conhecido_por_avaliada_usd']=k/m['concluidas'] if m['concluidas'] else None
active=ROOT/'output/individual-v20/pro-judge-v20-359-r2'
snapshot={'gerado_em':now,'referencia':'analise-propria-v2','em_execucao_excluida':None if active_finished else str(active),'linhas':rows,'fontes':SOURCES}
from tempos_experimentacoes import enrich
snapshot=enrich(snapshot)
(OUT/'evidencias/resultados-experimentacoes.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n')
from formatar_resultados import render
(OUT/'tabela-resultados-experimentacoes.md').write_text(render(snapshot))
print('Condições encerradas:',len(rows))
