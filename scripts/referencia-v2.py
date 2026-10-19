"""Consolida revisão editorial v2; consultas oficiais estão registradas em fontes-v2.json.
Não chama modelos nem usa suas classificações para preencher a referência.
"""
import copy
import hashlib
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / "referencias/analise-propria-v1"
OUT = ROOT / "referencias/analise-propria-v2"


def read(p): return json.loads(p.read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def save(p, x): p.write_text(json.dumps(x, ensure_ascii=False, indent=2) + "\n")


if OUT.exists(): raise SystemExit("v2 já existe: preserve o congelamento; use nova versão.")
OUT.mkdir()
data = read(ROOT / "output/prepared.json")
themes = {t['tema_id']: t for t in data['themes']}
manifest_v1 = read(OLD / "manifesto.json")
raw_v1 = (OLD / "referencia.jsonl").read_bytes()
assert sha(raw_v1) == manifest_v1['sha256_referencia']
rows = [json.loads(line) for line in raw_v1.decode().splitlines()]
sources = copy.deepcopy(read(OLD / "fontes.json"))
at = datetime.now(ZoneInfo("America/Fortaleza")).isoformat()
snapshot = ROOT / "output/knowledge/snapshots/penal50-v2"
captured = read(snapshot / "manifest.json")
mapping = {'cp':'CP','cpp':'CPP','cf':'CF','lep':'LEP','drogas':'L11343', 'maria-penha':'L11340',
           'ambientais':'L9605','lavagem':'L9613','juizados':'L9099','eca':'ECA','abuso':'L13869',
           'terrorismo':'L13260','ordem-economica':'L8137'}
checks = {}
for item in captured['captures']:
    if item['id'] not in mapping: continue
    source = item.get('supplement') if item.get('supplement', {}).get('rawFile') and not item['supplement'].get('error') else item
    raw = (snapshot / 'raw' / source['rawFile']).read_bytes()
    assert sha(raw) == source['bodyHash']
    key = mapping[item['id']]
    checks[key] = {'id':key, 'url':source['url'], 'data_consulta':source['retrievedAt'],
                   'tipo':'texto_oficial_recuperado', 'sha256':sha(raw),
                   'captura':str((snapshot/'raw'/source['rawFile']).relative_to(ROOT)),
                   'limite':'Documento integral capturado; localização e interpretação dos dispositivos são verificações distintas. Publicação original exige conferir alterações.'}

extra = {
 'L9430': ('https://www.planalto.gov.br/ccivil_03/leis/l9430.htm', 'Art. 83 consultado; observar alterações e remissão à Lei 10.684/2003, art. 9º.'),
 'CNJ487': ('https://www.gov.br/mj/pt-br/assuntos/sua-protecao/politicas-sobre-drogas/obid/legislacao-obid/resolucao-cnj-no-487-de-15-de-fevereiro-de-2023.pdf', 'Texto da Resolução 487/2023 em repositório oficial; não certifica o estado de implementação nem todas as alterações.'),
 'SENADO_RS5': ('https://legis.senado.leg.br/norma/593026', 'Resolução 5/2012 identificada em registro oficial do Senado; suspensão da expressão sobre conversão em restritivas, não autorização irrestrita de benefícios.'),
 'ADI4424': ('https://stf.jus.br/arquivo/informativo/documento/informativo657.htm', 'Informativo oficial sobre lesão corporal doméstica e ação pública incondicionada; não resolve as imperfeições de redação de Q0114.'),
 'STJ_PRAZO_DEFENSORIA': ('https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias-antigas/2017/2017-09-04_08-03_Prazos-para-Ministerio-Publico-e-Defensoria-contam-a-partir-do-recebimento-dos-autos.aspx', 'Notícia oficial de repetitivo: início no recebimento institucional dos autos; não leitura integral de todos os acórdãos.'),
 'STJ_DOMICILIAR': ('https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2025/22072025-Negada-prisao-domiciliar-a-mulher-que-desviou-dinheiro-de-campanha-para-tratamento-de-doenca-do-filho.aspx', 'Notícia oficial confirma excepcionalidade fora do aberto; benefício depende do caso concreto, não basta ser mãe.'),
 'STF_INSIGNIFICANCIA': ('https://stf.jus.br/arquivo/informativo/documento/informativo391.htm', 'Informativo oficial faz referência ao HC 84.412; os vetores também foram cotejados em acórdão oficial STJ registro 202401912224. Conferência indireta do precedente, não inteiro teor do HC.'),
 'SISDEPEN': ('https://www.gov.br/senappen/pt-br/servicos/sisdepen/relatorios/brasil', 'Repositório oficial de séries; sua existência não verifica sozinha a afirmação histórica de Q0292. Pendência de análise dos números mantida.'),
 'ROUBO_IMPROPRIO': ('https://www.stj.jus.br/docs_internet/revista/eletronica/stj-revista-eletronica-1992_29_capJurisprudencia.pdf', 'Revista oficial registra entendimento de não admissão de tentativa do roubo impróprio; fonte antiga, com ressalva para conferência de evolução posterior.'),
}
for key, (url, limit) in extra.items():
    checks[key] = {'id':key,'url':url,'data_consulta':at,'tipo':'pagina_oficial_consultada','limite':limit}
    if key != 'SISDEPEN':
        sources['fontes'][key] = {'id':key,'titulo':key,'url':url,'situacao':'fonte_primaria_consultada_com_limite', 'limite':limit,'data_consulta':at[:10]}
for key, value in checks.items():
    if key in sources['fontes']:
        sources['fontes'][key]['verificacao_v2'] = value

edits = {
 'Q0001': {'tema':'5524','motivo':'A questão reúne desaforamento e decisões da primeira fase; nenhum filho isolado representa todo o comando. CPP 416, 419, 427 e 428.'},
 'Q0004': {'tema':'5480','motivo':'Há critérios territorial/domicílio, matéria federal e prerrogativa de função. O pai Competência cobre o conjunto; a alternativa continua indeterminada por ressalvas temporais/semânticas.'},
 'Q0006': {'tema':'5157','motivo':'O conjunto cobra furto e roubo. O pai patrimonial é mais abrangente de modo necessário; não escolher Roubo apenas por ser o tema da assertiva remanescente.'},
 'Q0023': {'tema':'5524','motivo':'Bifasicidade, prisão na pronúncia, impronúncia, defensor e oitiva em plenário exigem o rito do Júri como conjunto; CPP 413, 414, 456 e 473.'},
 'Q0028': {'tema':'5524','resposta':'C','fundamento':'Os arts. 406, 409 e 421, § 1º, confirmam os três trechos: resposta escrita em dez dias, manifestação da acusação em cinco dias e remessa ao MP por circunstância superveniente após preclusão da pronúncia. A v1 confundiu o prazo do art. 409 com três dias.', 'motivo':'Correção expressa do prazo na v1 e enquadramento no conjunto de etapas do rito; não apenas pronúncia nem uma troca automática para acompanhar modelo.'},
}
changes = []
for row in rows:
    before = copy.deepcopy(row)
    if row['id'] in edits:
        edit = edits[row['id']]
        t = themes[edit['tema']]
        old_id = row['classificacao']['tema_id']
        row['classificacao'].update(tema_id=t['tema_id'],caminho=t['caminho'],nivel=t['nivel'],descricao_ausente=not bool(t['descricao']))
        row['classificacao']['concorrentes_ids'] = list(dict.fromkeys([x for x in [old_id,*row['classificacao']['concorrentes_ids']] if x and x != t['tema_id']]))
        row['classificacao']['limite_especifico'] = 'Item multitemático: escolha editorial do pai que cobre o conjunto; não equivalência automática de todos os filhos.'
        if 'resposta' in edit:
            row['resposta_proposta'] = edit['resposta']; row['texto_alternativa'] = row['questao']['alternativas'][edit['resposta']]
            row['fundamento_resposta'] = edit['fundamento']
        changes.append({'id':row['id'],'antes':{'resposta':before['resposta_proposta'],'tema':old_id,'fundamento':before['fundamento_resposta']},'depois':{'resposta':row['resposta_proposta'],'tema':t['tema_id'],'fundamento':row['fundamento_resposta']},'motivo':edit['motivo']})
    if row['id']=='Q0005':
        row['fontes'] = ['CP:33,59,61 I,64 I,68']
    if row['id']=='Q0006': row['fontes'].append('ROUBO_IMPROPRIO:tentativa')
    if row['id']=='Q0040':
        row['classificacao']['alternativos_plausiveis_v2'] = ['5562']
        row['ressalvas'].append('Apelação 5562 também é destino editorial plausível; suas descrições incluem efeito suspensivo. Mantido 5515 pelo conhecimento perguntado, sem tratá-lo como verdade jurídica única.')
    reviewed = int(row['id'][1:]) <= 50
    verified = []
    for citation in row['fontes']:
        key, _, loc = citation.partition(':')
        source = sources['fontes'].get(key, {})
        verified.append({'referencia':citation,'url':checks.get(key,source).get('url'), 'localizador':loc,
                         'verificacao':'consulta_documental_v2' if key in checks else 'herdada_v1',
                         'limite':checks.get(key,source).get('limite')})
    # Publicações já vistas são desenvolvimento. Nenhuma resposta dos novos braços foi lida.
    if reviewed: row['exposicao_previa_a_rotulos_ou_pilotos'] = True
    row['revisao_v2'] = {'escopo':'conferencia_legislativa_e_editorial_do_recorte' if reviewed else 'vinculacao_documental_com_analise_v1_herdada',
                         'fontes_oficiais':verified,'alteracao_registrada':row['id'] in edits,
                         'limite':'Legislação não substitui fonte doutrinária nem garante interpretação correta; itens fora do recorte não receberam nova revisão integral.'}
    pending = [c for c in row['fontes'] if sources['fontes'].get(c.split(':')[0],{}).get('situacao')=='referencia_pendente_de_conferencia_primaria']
    # A mera localização do repositório não resolve a série estatística.
    row['conferencia']['fontes_pendentes'] = pending
    row['conferencia']['possui_ressalva'] = bool(row['ressalvas'])
    row['conferencia']['situacao'] = 'alternativa_indeterminada' if row['resposta_proposta'] is None else 'proposta_com_fonte_pendente' if pending else 'proposta_com_ressalva' if row['ressalvas'] else 'proposta_fundamentada'
    row['versao_referencia'] = 'v2'
    tid = row['classificacao']['tema_id']
    assert tid is None or themes[tid]['status']=='active'
    assert tid is None or row['classificacao']['caminho']==themes[tid]['caminho']
    assert row['resposta_proposta'] is None or row['resposta_proposta'] in row['questao']['alternativas']

text = ''.join(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n' for row in rows)
(OUT/'referencia.jsonl').write_text(text)
save(OUT/'fontes.json',sources);save(OUT/'fontes-v2.json',{'consultas':checks,'data':at,'limites':'Novas verificações documentais e reaproveitamento de capturas oficiais íntegras da mesma data. Verificar URL não equivale a auditar todos os argumentos.'})
save(OUT/'alteracoes.json',changes)
stats = {'total':len(rows),'novamente_revisadas_no_recorte':50,'analise_v1_herdada_fora_do_recorte':309,
         'fontes_com_verificacao_v2':len(checks),'fontes_pendentes':sum(bool(r['conferencia']['fontes_pendentes'])for r in rows),
         'com_ressalva':sum(r['conferencia']['possui_ressalva']for r in rows),'mudancas_de_tema':len(edits),'mudancas_de_alternativa':1,'chamadas_openrouter':0}
save(OUT/'manifesto.json',{'versao':'v2','createdAt':at,'data_corte':'2026-10-16','hashes_entrada':manifest_v1['hashes_entrada'],
                         'sha256_referencia':sha(text.encode()),'origem':{'versao':'v1','sha256_referencia':sha(raw_v1)},'estatisticas':stats,
                         'exposicao':'Todos os 50 itens do recorte já vistos em desenvolvimento; não são teste independente.',
                         'escopo':'359 registros; revisão legislativa/editorial nova dos 50 do piloto; vinculação documental e limites herdados nos demais. Não é certificação jurídica integral.',
                         'artefatos':{f:sha((OUT/f).read_bytes())for f in ['fontes.json','fontes-v2.json','alteracoes.json']}})
lines=['# Referência provisória v2','',f'Congelada em {at}, com 359 IDs e corte jurídico em 16/10/2026.','',
       '**Escopo:** nova conferência legislativa/editorial de Q0001–Q0050. Nos outros 309, a análise v1 foi herdada e recebeu vinculação às fontes documentais disponíveis; não se declara nova revisão jurídica integral. Pendências doutrinárias e materiais insuficientes permanecem explícitas.','',
       'Foram preservadas a v1 e suas limitações. A v2 não é gabarito oficial nem revisão humana independente. Nenhum novo julgamento OpenRouter foi usado para preencher seus rótulos. Os 50 itens já tiveram exposição a resultados anteriores e são de desenvolvimento.','',
       '## Correções registradas','', '| ID | Alternativa antes/depois | Tema antes/depois | Motivo |','| --- | --- | --- | --- |']
for c in changes:lines.append(f"| {c['id']} | {c['antes']['resposta']} → {c['depois']['resposta']} | {c['antes']['tema']} → {c['depois']['tema']} | {c['motivo']} |")
lines+=['','A mudança de tema é decisão editorial sobre a taxonomia; a legislação fundamenta os institutos, não determina IDs. A Q0040 continua com ressalva e alternativa temática plausível, sem transformar o resultado anterior do modelo em resposta de referência.','',
        '## Evidências e reprodução','', '[Fontes e capturas verificadas](fontes-v2.json), [registro completo de fontes](fontes.json), [alterações](alteracoes.json), [manifesto e hashes](manifesto.json).','',
        'A correção da Q0028 se apoia no [CPP oficial, art. 409](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html): cinco dias, não três. Os arts. 406 e 421, § 1º, confirmam os outros trechos.','',
        'O construtor é `scripts/referencia-v2.py`. Ele não refaz o raciocínio nem pesquisa automaticamente: consolida as notas editoriais e as consultas oficiais registradas nesta sessão. Recusa sobrescrever a versão já congelada.','',
        'A referência permanece exclusiva da avaliação. A base consultável pelos modelos contém documentos jurídicos, sem gabaritos, temas corrigidos ou notas por questão desta versão.','']
(OUT/'README.md').write_text('\n'.join(lines))
assert sha((OLD/'referencia.jsonl').read_bytes())==manifest_v1['sha256_referencia']
print(json.dumps({'directory':str(OUT),'stats':stats,'hash':sha(text.encode())},ensure_ascii=False))
