"""Consolida a conferência editorial registrada; não infere correção jurídica por ID."""
import json
from pathlib import Path
from collections import Counter
root = Path(__file__).resolve().parents[1]
out = root/'output/comparisons/rag-classificador-v9'
notes = json.loads((out/'conferencia-notas.json').read_text())
raw_inventory = json.loads((out/'citacoes-juiz.json').read_text())
inventory = [dict(experiment=name,citations=[c for c in raw_inventory if c['experiment']==name]) for name in sorted(set(c['experiment'] for c in raw_inventory))]
rows, pending = [], []
for condition in inventory:
    for citation in condition['citations']:
        matched = [n for n in notes['itens'] if n['experimento'] == condition['experiment'] and n['id'] == citation['id'] and n.get('sourceId') == citation['sourceId']]
        row = dict(experimento=condition['experiment'], id=citation['id'], sourceId=citation['sourceId'], localizador=citation['source']['locator'], url=citation['source']['url'], hash=citation['source']['contentHash'], usos=citation['uses'], entregue=citation.get('deliveredSource'), avaliacao=matched[0]['avaliacao'] if matched else 'pendente', analise=matched[0].get('correcao') if matched else None)
        rows.append(row)
        if not matched: pending.append({**row,'texto':citation.get('deliveredSource',{}).get('texto',citation['source']['text'])})
report = dict(natureza=notes['natureza'], unidade='experimento/questão/ID; repetição do mesmo ID em campos do mesmo parecer é agrupada', escopo='Todos os usos de IDs do juiz inventariados; conferência adicional intencional de afirmações normativas e rubricas selecionadas. Não é uma auditoria integral de todas as proposições jurídicas das justificativas dos experimentos.', usos_com_id=len(rows), conferidos=len(rows)-len(pending), pendentes=len(pending), contagens=dict(Counter(r['avaliacao'] for r in rows)), citacoes=rows, notas=notes['itens'])
(out/'conferencia-juridica.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(out/'citacoes-pendentes.json').write_text(json.dumps(pending,ensure_ascii=False,indent=2)+'\n')
lines=['# Conferência jurídica das citações — v9','','Fonte verdadeira, pertinência ao caso e classificação temática são verificações distintas. A conferência é documental e feita pelo assistente, sem validação humana independente. Textos oficiais congelados têm URL e hash no inventário.','','A conferência adicional das menções sem ID é intencional e selecionada; não equivale à revisão jurídica integral das justificativas dos experimentos.','','Foram conferidos **%d de %d usos de IDs**; pendentes: **%d**.' % (len(rows)-len(pending),len(rows),len(pending)),'','| Experimento | Questão | ID / dispositivo | Avaliação |','| --- | --- | --- | --- |']
for r in rows: lines.append('| %s | %s | %s / %s | %s |' % (r['experimento'],r['id'],r['sourceId'],r['localizador'],r['avaliacao']))
lines += ['','## Análise por uso de fonte','']
for r in rows: lines += ['**%s / %s / %s — %s.** %s [Fonte oficial](%s).' % (r['experimento'],r['id'],r['sourceId'],r['avaliacao'],r['analise'] or 'Conferência ainda pendente.',r['url']),'']
lines += ['## Outras afirmações jurídicas selecionadas e aplicação das rubricas','']
for n in notes['itens']:
    if n.get('sourceId'): continue
    lines += ['**%s / %s — %s.** %s %s' % (n['experimento'],n['id'],n['avaliacao'],n['correcao'],n.get('relevancia','')),'']
lines += ['As menções do classificador a leis/artigos são conferidas separadamente, pois o protocolo não transmite seus IDs técnicos na proposta. A contagem acima abrange usos de IDs pelo juiz; as notas adicionais não entram nesse denominador. A ausência de ID não demonstra ausência de uso do contexto; tampouco permite atribuir causalidade ao RAG. Não foram refeitos gabaritos ou rótulos a partir destes novos resultados.','','[Menções normativas explícitas, inclusive sem ID](mencoes-normativas.md), [métricas e comparação](relatorio.md), [inventário integral](citacoes-juiz.json), [JSON da conferência](conferencia-juridica.json).']
(out/'conferencia-juridica.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:report[k] for k in ['usos_com_id','conferidos','pendentes','contagens']},ensure_ascii=False))
