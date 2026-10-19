"""Consolida a conferência editorial registrada; não infere correção jurídica por ID."""
import json
from pathlib import Path
from collections import Counter
root = Path(__file__).resolve().parents[1]
out = root/'output/comparisons/rag-consultas-v8'
notes = json.loads((out/'conferencia-juridica-notas.json').read_text())
inventory = json.loads((out/'inventario-citacoes.json').read_text())
rows, pending = [], []
for condition in inventory:
    for citation in condition['citations']:
        matched = [n for n in notes['itens'] if n['experimento'] == condition['experiment'] and n['id'] == citation['id'] and n.get('sourceId') == citation['sourceId']]
        row = dict(experimento=condition['experiment'], id=citation['id'], sourceId=citation['sourceId'], localizador=citation['source']['locator'], url=citation['source']['url'], hash=citation['source']['contentHash'], usos=citation['uses'], avaliacao=matched[0]['avaliacao'] if matched else 'pendente', analise=matched[0].get('correcao') if matched else None)
        rows.append(row)
        if not matched: pending.append({**row,'texto':citation['source']['text']})
report = dict(natureza=notes['natureza'], usos_com_id=len(rows), conferidos=len(rows)-len(pending), pendentes=len(pending), contagens=dict(Counter(r['avaliacao'] for r in rows)), citacoes=rows, notas=notes['itens'])
(out/'conferencia-juridica.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(out/'citacoes-pendentes.json').write_text(json.dumps(pending,ensure_ascii=False,indent=2)+'\n')
lines=['# Conferência jurídica das citações — v8','','Fonte verdadeira, pertinência ao caso e classificação temática são verificações distintas. A conferência é documental e feita pelo assistente, sem validação humana independente. Textos oficiais congelados têm URL e hash no inventário.','','Foram conferidos **%d de %d usos de IDs**; pendentes: **%d**.' % (len(rows)-len(pending),len(rows),len(pending)),'','| Experimento | Questão | ID / dispositivo | Avaliação |','| --- | --- | --- | --- |']
for r in rows: lines.append('| %s | %s | %s / %s | %s |' % (r['experimento'],r['id'],r['sourceId'],r['localizador'],r['avaliacao']))
lines += ['','## Análise por uso de fonte','']
for r in rows: lines += ['**%s / %s / %s — %s.** %s [Fonte oficial](%s).' % (r['experimento'],r['id'],r['sourceId'],r['avaliacao'],r['analise'] or 'Conferência ainda pendente.',r['url']),'']
lines += ['## Outros erros jurídicos e aplicação das rubricas','']
for n in notes['itens']:
    if n.get('sourceId'): continue
    lines += ['**%s / %s — %s.** %s %s' % (n['experimento'],n['id'],n['avaliacao'],n['correcao'],n.get('relevancia','')),'']
lines += ['As notas de ensaios interrompidos são identificadas separadamente e não entram na contagem da rodada definitiva. A ausência de ID não demonstra ausência de uso do contexto; tampouco permite atribuir causalidade ao RAG. Não foram refeitos gabaritos ou rótulos a partir destes novos resultados.','','[Métricas e comparação](relatorio.md), [inventário integral](inventario-citacoes.json), [JSON da conferência](conferencia-juridica.json).']
(out/'conferencia-juridica.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:report[k] for k in ['usos_com_id','conferidos','pendentes','contagens']},ensure_ascii=False))
