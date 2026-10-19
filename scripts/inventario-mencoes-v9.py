"""Inventaria menções normativas explícitas nas justificativas, sem julgar seu mérito."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'output/comparisons/rag-classificador-v9'
pattern=re.compile(r'\b(?:arts?\.?\s*\d|lei\s*(?:n[ºo°.]?\s*)?\d|CPP\b|CP\b|CF\b|s[úu]mula\s*\d|ADI\s*\d|c[óo]digo penal|c[óo]digo de processo penal|lei maria da penha|lei de drogas|lei antiterrorismo|LMP\b|LEP\b|ECA\b|lei de execu[çc][aã]o penal|constitui[çc][aã]o federal)',re.I)
rows=[]
scanned=0
notes_path=out/'conferencia-mencoes-notas.json'
notes=json.loads(notes_path.read_text()) if notes_path.exists() else []
for name in ['local-penal50-v9-control','local-penal50-v9-classifier-tools']:
 records=json.loads((root/'output/experiments'/name/'records.json').read_text())
 for id,record in records.items():
  for role,key in [('classifier','proposal'),('judge','verdict')]:
   value=record.get(key)
   if not value:continue
   scanned+=1
   fields={}
   if role=='classifier':
    fields['justificativa']=value['justificativa']
    fields.update({f'incertezas.{i}':s for i,s in enumerate(value['incertezas'])})
   else:
    fields.update({k:v['justificativa'] for k,v in value.items() if isinstance(v,dict) and 'justificativa' in v})
    fields.update({f'alertas.{i}':s for i,s in enumerate(value['alertas'])})
   mentions={k:s for k,s in fields.items() if pattern.search(s)}
   if not mentions:continue
   matched=[n for n in notes if (n['experimento'],n['id'],n['papel'])==(name,id,role)]
   if len(matched)>1:raise RuntimeError('Notas duplicadas')
   rows.append(dict(experimento=name,id=id,papel=role,mencoes=mentions,conferencia=matched[0] if matched else None))
report=dict(escopo='Todas as justificativas finais válidas foram rastreadas para menções normativas explícitas. A seleção por padrões tem limites: não prova ausência de citações não detectadas, nem valida todas as proposições jurídicas. Evidências literais da questão não são tratadas como fontes externas citadas pelo agente.',unidade='questão e papel, agregando suas menções explícitas; não número de artigos únicos nem taxa de correção jurídica das saídas',saidas_validas_rastreadas=scanned,total=len(rows),conferidos=sum(bool(r['conferencia']) for r in rows),pendentes=sum(not r['conferencia'] for r in rows),itens=rows)
(out/'mencoes-normativas.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(out/'mencoes-pendentes.json').write_text(json.dumps([r for r in rows if not r['conferencia']],ensure_ascii=False,indent=2)+'\n')
from collections import Counter
counts=Counter(r['conferencia']['avaliacao'] if r['conferencia'] else 'pendente' for r in rows)
lines=['# Menções normativas explícitas — v9','',report['escopo'],'',f"Foram rastreadas {scanned} saídas finais válidas; {len(rows)} pares questão/papel contêm menções detectadas. Conferidos: {report['conferidos']}; pendentes: {report['pendentes']}. Avaliações por par: {dict(counts)}.",'',report['unidade']+'. Não somar este denominador aos usos de IDs do juiz: há sobreposição. Não é uma taxa de precisão jurídica nem uma validação humana independente.','','| Condição | Questão | Papel | Avaliação |','| --- | --- | --- | --- |']
for r in rows:lines.append(f"| {r['experimento']} | {r['id']} | {r['papel']} | {r['conferencia']['avaliacao'] if r['conferencia'] else 'pendente'} |")
lines += ['','## Conferência por questão e papel','']
for r in rows:
 n=r['conferencia']
 links='; '.join(f'[fonte oficial {i+1}]({url})' for i,url in enumerate(n.get('fontes',[]))) if n else ''
 lines += [f"**{r['experimento']} / {r['id']} / {r['papel']} — {n['avaliacao'] if n else 'pendente'}.** {n['analise'] if n else 'Conferência pendente.'} {links}.",'']
lines += ['[Trechos completos e notas em JSON](mencoes-normativas.json), [citações por ID](conferencia-juridica.md), [métricas](relatorio.md).']
(out/'mencoes-normativas.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:report[k] for k in ['total','conferidos','pendentes']}))
