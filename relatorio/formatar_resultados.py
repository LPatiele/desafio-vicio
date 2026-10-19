"""Formata o retrato existente em tópicos, sem atualizar os experimentos."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
CLEAN_NOTES={
'gemma-v0':'Nenhuma avaliação completa com classificador e juiz; não há precisão publicada calculável.',
'sondagem-gemma':'Repetição isolada de Q0001, sem proposta concluída.',
'lote-v2-gemma-dots':'Nenhuma avaliação completa; o juiz não chegou a ser chamado.',
'controle-individual-dots-nemotron':'Cinco fluxos em dez chamadas. Três candidatos à publicação; a política experimental manteve publicação bloqueada.',
'piloto-v1':'Primeiro lote de trinta da pasta atual; nenhuma avaliação completa. Não confundir com o v1 da pasta anterior.',
'piloto-20-v3':'Nenhuma avaliação completa; a condição seguinte testou raciocínio desativado.',
'local-penal50-v8-auto':'Ensaio preliminar com duas decisões; não integra a comparação definitiva v8, realizada nas condições r2.',
'local-penal50-v8-tools':'Ensaio preliminar com duas decisões; não integra a comparação definitiva v8, realizada nas condições r2.',
'pagos-v10-gemini-openai':'Nenhuma decisão concluída; não há evidência para comparar a qualidade da dupla.',
'pagos-v10-juiz-isolado':'Verificação isolada do juiz, com proposta reaproveitada; sem avaliação completa.',
'gemini35-v15-livros-359':'Somente uma avaliação completa; amostra insuficiente para concluir qualidade da condição.',
'paid-v17-b20':'Resultado parcial: 27 decisões entre 359 selecionadas. Não interpretar 20/22 concordantes como superioridade comprovada do lote vinte.',
'model-only-v19-359':'359 decisões; 94 chamadas e 38,8 minutos. A condição sem RAG completou o conjunto, mas não atingiu 95%. Prompts e política de retentativas também mudaram.',
'pro-judge-v20-359':'Tentativa encerrada sem propostas ou pareceres. Não permite avaliar a qualidade do juiz Pro; reservas não são cobrança confirmada.'
}
def pct(v):return '—' if v is None else f'{100*v:.1f}%'.replace('.',',')
def usd(v):return 'US$ '+f'{v:.6f}'.replace('.',',')
def duration(v):
 if v is None:return 'Não registrado'
 if v<60:return f'{v:.1f} s'.replace('.',',')
 seconds=round(v);hours,seconds=divmod(seconds,3600);minutes,seconds=divmod(seconds,60)
 return (f'{hours} h ' if hours else '')+f'{minutes} min {seconds:02d} s'
def render(snapshot):
 rows=snapshot['linhas']
 md=['# Resultados das experimentações em tópicos','',
 f'Retrato dos dados: {snapshot["gerado_em"]}, horário de Fortaleza. '+('A execução v20-r2 tem somente espaço reservado.' if snapshot.get('em_execucao_excluida') else 'A execução v20-r2 está encerrada e seus resultados foram incluídos.'),'',
 '## Critérios de leitura','',
 '- **Questões avaliadas:** têm proposta, parecer e decisão final salvos. Uma sondagem só do classificador não constitui avaliação completa.',
 '- **Precisão:** concordância por ramo entre publicadas contra a referência própria v2; aceita tema exato, pai ou filho. Não equivale a precisão jurídica independente. Sem publicações, a precisão não é calculável.',
 '- **Cobertura:** publicadas/selecionadas, incluindo pendências no denominador. Testes integrais usam 359; pilotos usam seu próprio recorte.',
 '- **Custo por questão avaliada:** custo conhecido do classificador e juiz, incluindo consultas e retentativas, dividido pelas avaliações concluídas. O consumo associado às pendências também participa do custo da condição.',
 '- **† Custo incompleto:** há chamadas sem custo confirmado. Zero conhecido não significa custo total comprovadamente zero. Reservas conservadoras não são cobrança confirmada.',
 '- **Custos históricos:** propostas reaproveitadas têm a origem indicada e incluem o custo conhecido do classificador original. Não somar os gastos de todos os tópicos: alguns compartilham etapas e orçamento. O b30 já incorpora sua preparação inicial e seus diagnósticos.',
 '- **Consumo:** tokens de saída já incluem raciocínio quando informado. Tokens/chamadas descrevem a execução local; o consumo original de propostas importadas não é repetido. Custos excluem revisão humana, infraestrutura e desenvolvimento.','',
 '## Métricas de tempo','',
 '- **Tempo de execução:** intervalo entre o primeiro envio e o último retorno registrado da condição. Inclui pausas e retomadas; na tentativa v20 inicial, o marco final é o registro de interrupção. Não inclui preparação anterior ao primeiro envio nem exportação posterior ao último retorno. Não é uma medida isolada da velocidade dos modelos.',
 '- **Tempo acumulado nas chamadas:** soma das durações conhecidas, incluindo consultas e retentativas. Pode diferir do tempo decorrido e ficar incompleto quando uma duração não foi registrada.',
 '- **Tempo por questão avaliada:** tempo de execução dividido pelas questões com decisão concluída, não apenas pelas publicadas. Nos pilotos antigos sem horário final, usa a soma conhecida das chamadas; a base é indicada em cada tópico.',
 '- **Estimativa para 359:** média por questão multiplicada por 359. É uma extrapolação linear, sem garantia de prazo ou conclusão das pendências. Quando as 359 já foram concluídas, corresponde ao tempo observado na base indicada.',
 '- **Propostas reaproveitadas:** os tempos descrevem a execução local e não incluem o tempo histórico do classificador de origem. Comparações devem respeitar essa diferença.','',
 '## Resultados por experimento','']
 if snapshot.get('tempos_atualizados_em'):md.insert(4,'Métricas de tempo conferidas em '+snapshot['tempos_atualizados_em']+'.\n')
 for r in rows:
  m=r['metricas'];b=r['custo_por_papel'];u=r['chamadas_custo_desconhecido_cj'];extra=r.get('custo_classificador_reaproveitado_conhecido_usd',0)
  prec=f'{m["concordantes_publicadas"]}/{m["publicar"]} ({pct(m["precisao_ramo"])})' if m['publicar'] else 'Não calculável: sem publicações'
  cost=usd(r['custo_conhecido_por_avaliada_usd'])+(' †' if u else '') if m['concluidas'] else 'Não calculável: nenhuma avaliação concluída'
  note=CLEAN_NOTES.get(r['key'],r['nota'])
  if r.get('importacao') and r['key'] in CLEAN_NOTES:note+=' Classificador reaproveitado de '+r['importacao']+'.'
  md+=[f'- **[{r["key"]}]({r["pasta"]}/):**',
   f'  - Questões avaliadas / selecionadas: {m["concluidas"]}/{m["selecionadas"]}',
   f'  - Questões pendentes: {m["pendentes"]}',
   f'  - Publicadas / revisão / fora: {m["publicar"]}/{m["revisar"]}/{m["fora"]}',
   f'  - Precisão por ramo (referência v2): {prec}',
   f'  - Cobertura: {m["publicar"]}/{m["selecionadas"]} ({pct(m["cobertura"])})',
   f'  - Custo por questão avaliada (classificador + juiz): {cost}',
   f'  - Custo conhecido do classificador: {usd(b["classifier"]["known_usd"]+extra)}'+(' (origem reaproveitada)' if r.get('importacao') else ''),
   f'  - Custo conhecido do juiz: {usd(b["judge"]["known_usd"])}',
   f'  - Custo total conhecido: {usd(r["custo_conhecido_total_cj_usd"])}']
  if b['diagnostic']['calls']:md.append(f'  - Diagnósticos incluídos no total conhecido: {usd(b["diagnostic"]["known_usd"])}')
  if u:md += [f'  - Chamadas sem custo confirmado: {u}',f'  - Reserva registrada para consumo não confirmado: {usd(r["reserva_desconhecida_usd"])}']
  toks=[sum(x[f'{kind}_tokens'] for x in b.values()) for kind in ['input','output']]
  md += [f'  - Tokens informados de entrada / saída: {toks[0]:,} / {toks[1]:,}'.replace(',','.'),f'  - Chamadas locais: {r["chamadas"]}']
  t=r.get('tempos',{})
  avg=t.get('tempo_medio_por_questao_avaliada_s');forecast=t.get('estimativa_359_questoes_s')
  md += [f'  - Tempo de execução (total decorrido): {duration(t.get("tempo_total_decorrido_s"))}',
   f'  - Tempo acumulado conhecido nas chamadas: {duration(t.get("tempo_acumulado_chamadas_conhecido_s"))}',
   f'  - Tempo médio por questão avaliada: {duration(avg) if avg is not None else "Não calculável com os registros disponíveis"}',
   f'  - Estimativa de tempo para 359 questões: {duration(forecast) if forecast is not None else "Não calculável com os registros disponíveis"}',
   f'  - Base da média e da estimativa: {t.get("base_media_e_projecao") or "Indisponível"}',
   '  - Observações sobre os tempos: '+' '.join(t.get('notas',[])),
   f'  - Comparações e resultados: {note}','']
 active=snapshot['em_execucao_excluida']
 if active:
  md += [f'- **[pro-judge-v20-359-r2]({active}/):**',
  '  - Situação: em execução; resultados parciais não incluídos.',
  '  - Questões avaliadas / selecionadas: a preencher / 359',
  '  - Questões pendentes: a preencher',
  '  - Publicadas / revisão / fora: a preencher',
  '  - Precisão por ramo (referência v2): a preencher',
  '  - Cobertura: a preencher',
  '  - Custo por questão avaliada (classificador + juiz): a preencher',
  '  - Custo conhecido do classificador: a preencher',
  '  - Custo conhecido do juiz: a preencher',
  '  - Custo total conhecido: a preencher',
  '  - Tokens informados de entrada / saída: a preencher',
  '  - Chamadas locais: a preencher',
  '  - Tempo de execução (total decorrido): a preencher',
  '  - Tempo acumulado conhecido nas chamadas: a preencher',
  '  - Tempo médio por questão avaliada: a preencher',
  '  - Estimativa de tempo para 359 questões: a preencher',
  '  - Base da média e da estimativa: a preencher',
  '  - Comparações e resultados: a preencher.','']
 md += [
 '## Ensaios técnicos e análises complementares','',
 '- **[b30 inicial arquivado]('+str(ROOT/'output/paid-v17/paid-v17-359/archive/b30-initial-400')+'/):**',
 '  - Resultado: sem avaliação completa; gastos e chamadas incorporados à condição b30 recuperada, sem duplicação.','',
 '- **[Diagnóstico de esquema]('+str(ROOT/'output/paid-v17/paid-v17-359/diagnostics/schema')+'/):**',
 '  - Resultado: duas chamadas sintéticas; consumo incluído no custo operacional do b30, sem contar como questões avaliadas.','',
 '- **[Protocolo MCP]('+str(ROOT/'output/integration/lexml-mcp/protocol')+'/):**',
 '  - Resultado: verificação técnica de ferramentas; precisão, cobertura temática e custo por questão avaliada não se aplicam.','',
 '- **[Retrospectiva sem juiz]('+str(ROOT/'output/comparisons/sem-juiz-retrospectiva-20261016T235150Z')+'/):**',
 '  - Resultado: simulação com respostas salvas, sem novas inferências ou novo gasto de classificação.','',
 '- **[Finalização v19]('+str(ROOT/'output/delivery/model-only-v19-359')+'/):**',
 '  - Resultado: conferência e exportação das 359 decisões; resultados e custos pertencem ao tópico v19.','',
 '## Referências','',
 '- [Dados numéricos e proveniência](evidencias/resultados-experimentacoes.json).',
 '- [Decisões e justificativas](decisoes-por-experimento.md).',
 '- [Comparação v19/RAG](../output/comparisons/no-rag-v19/analysis.md).',
 '- [Comparação b30/v16](../output/comparisons/v16-v17-b30/analysis.md).','']
 return '\n'.join(md)
if __name__=='__main__':
 snapshot=json.loads((ROOT/'relatorio/evidencias/resultados-experimentacoes.json').read_text())
 (ROOT/'relatorio/tabela-resultados-experimentacoes.md').write_text(render(snapshot))
 print('Formatadas',len(snapshot['linhas']),'condições encerradas; formatação atualizada.')
