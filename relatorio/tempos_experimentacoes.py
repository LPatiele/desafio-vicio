"""Enriquece somente condições encerradas do retrato; não lê a v20-r2."""
from pathlib import Path
import datetime, hashlib, json
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]

def stamp(value):
 if not value:return None
 try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 except (ValueError,TypeError):return None

def enrich(snapshot):
 sources=snapshot.setdefault('fontes',{})
 active=Path(snapshot['em_execucao_excluida']).resolve() if snapshot.get('em_execucao_excluida') else None
 def read_json(p):
  raw=p.read_bytes();sources[str(p)]={'sha256':hashlib.sha256(raw).hexdigest()};return json.loads(raw)
 def read_lines(p):
  if not p.exists():return []
  raw=p.read_bytes();sources[str(p)]={'sha256':hashlib.sha256(raw).hexdigest()};return [json.loads(l) for l in raw.splitlines() if l.strip()]
 for row in snapshot['linhas']:
  folder=Path(row['pasta']);assert active is None or folder.resolve()!=active
  durations=[];start=None;end=None;missing=0;endpoint='';kind='';aux=[]
  if not row.get('legado'):
   paths=[folder/'requests.jsonl']+[ROOT/x/'requests.jsonl' for x in row.get('inclui_custos',[])]
   req=[]
   for p in paths:req.extend(read_lines(p))
   starts={e['requestId']:e for e in req if e.get('phase')=='start'}
   finishes={e['requestId']:e for e in req if e.get('phase') in ['response','network_error']}
   timestamps=[stamp(e.get('at')) for e in starts.values()];timestamps=[x for x in timestamps if x]
   start=min(timestamps) if timestamps else None
   times=[stamp(e.get('at')) for e in finishes.values()];times=[x for x in times if x]
   end=max(times) if times else None
   for rid in starts:
    last=finishes.get(rid,{})
    if isinstance(last.get('durationMs'),(int,float)):durations.append(last['durationMs']/1000)
    elif stamp(last.get('at')) and stamp(starts[rid].get('at')):
     durations.append((stamp(last['at'])-stamp(starts[rid]['at'])).total_seconds())
    else:missing+=1
   endpoint='primeiro envio até o último retorno registrado'
   if row['key']=='pro-judge-v20-359' and (folder/'operator-stop.json').exists():
    operator=read_json(folder/'operator-stop.json');stop=stamp(operator.get('at'))
    if stop and (end is None or stop>end):end=stop;endpoint='primeiro envio até o registro da interrupção'
   kind='registros de início/fim das requisições'
   if not starts and durations:kind='durações registradas'
  else:
   # Os arquivos antigos têm duração por resposta, mas não horário final da execução.
   files=list(folder.glob('Q*-classificador.json'))+list(folder.glob('Q*-juiz.json'))+list(folder.glob('tentativa-*-classificador.json'))
   files+=[p for p in [folder/'juiz.json',folder/'resposta.json'] if p.exists()]
   seen=set()
   for p in files:
    data=read_json(p);rid=data.get('id_resposta',str(p))
    if rid in seen:continue
    seen.add(rid)
    if isinstance(data.get('duracao_ms'),(int,float)):durations.append(data['duracao_ms']/1000)
   missing=max(0,row['chamadas']-len(durations))
   kind='duração por resposta; horário final da execução não registrado'
  elapsed=(end-start).total_seconds() if start and end else None
  accumulated=sum(durations) if durations else None
  base=elapsed if elapsed is not None else accumulated
  basis='tempo total decorrido da execução local' if elapsed is not None else ('tempo acumulado conhecido nas chamadas' if accumulated is not None else None)
  n=row['metricas']['concluidas']
  avg=base/n if base is not None and n else None
  projection=avg*359 if avg is not None else None
  notes=[]
  if elapsed is not None:notes.append('Inclui intervalos entre chamadas, pausas e retomadas existentes entre os marcos registrados.')
  else:notes.append('Tempo total decorrido indisponível; a média usa a soma conhecida das chamadas, quando disponível.')
  if missing:notes.append(f'{missing} chamada(s) sem duração completa; o tempo acumulado conhecido não representa necessariamente todo o processamento.')
  if row.get('importacao'):notes.append('Medição local da condição: não inclui o tempo histórico do classificador reaproveitado.')
  if not n:notes.append('Média por avaliação e projeção para 359 não são calculáveis sem decisões concluídas.')
  elif row['metricas']['selecionadas']==359 and n==359:notes.append('O conjunto de 359 já foi concluído: o valor para 359 corresponde ao observado na base escolhida.')
  elif row['metricas']['pendentes']:notes.append('Projeção condicional de ritmo; não demonstra que as pendências possam ser concluídas com a mesma configuração.')
  else:notes.append('Projeção linear da amostra; depende de manter ritmo, tamanho dos lotes e perfil de consumo semelhantes.')
  row['tempos']={'inicio_utc':start.isoformat() if start else None,'fim_utc':end.isoformat() if end else None,'marco_tempo_decorrido':endpoint or None,'metodo_fonte':kind,'tempo_total_decorrido_s':elapsed,'tempo_acumulado_chamadas_conhecido_s':accumulated,'chamadas_com_duracao':len(durations),'chamadas_sem_duracao_completa':missing,'base_media_e_projecao':basis,'tempo_medio_por_questao_avaliada_s':avg,'estimativa_359_questoes_s':projection,'notas':notes}
 snapshot['tempos_atualizados_em']=datetime.datetime.now(ZoneInfo('America/Fortaleza')).isoformat()
 return snapshot

if __name__=='__main__':
 from formatar_resultados import render
 path=ROOT/'relatorio/evidencias/resultados-experimentacoes.json'
 snapshot=enrich(json.loads(path.read_text()))
 path.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'relatorio/tabela-resultados-experimentacoes.md').write_text(render(snapshot))
 print('Tempos adicionados às',len(snapshot['linhas']),'condições encerradas; demais métricas preservadas.')
