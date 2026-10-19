"""Materializa a conferência assistida de fontes primárias e as métricas já calculadas.

As avaliações jurídicas abaixo são editoriais, não decisões de um classificador automático.
Não modifica o corpus, a referência, os pareceres ou as decisões do experimento.
"""
import hashlib
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/experiments/local-penal50-v7"
CP = "https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-2848-7-dezembro-1940-412868-normaatualizada-pe.html"
CPP = "https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html"
LAVAGEM = "https://www.planalto.gov.br/ccivil_03/leis/l9613.htm"
ABUSO = "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13869.htm"
JUIZADOS = "https://www.planalto.gov.br/ccivil_03/leis/l9099.htm"
ORDEM = "https://www.planalto.gov.br/ccivil_03/leis/l8137.htm"
RESP = "https://www.planalto.gov.br/ccivil_03/leis/l1079.htm"
SUM542 = "https://processo.stj.jus.br/SCON/pesquisar.jsp?b=SUMU&livre=SUMULA.tipo.+e+%40num%3D%27000542%27"
TEMA1167 = "https://processo.stj.jus.br/jurisprudencia/externo/informativo/?acao=pesquisarumaedicao&livre=%270766%27.cod."


def read(file):
    return json.loads(file.read_text())


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def pct(value):
    return f"{100*value:.1f}%".replace(".", ",")


records = read(OUT / "records.json")
impact = read(OUT / "impacto-rag.json")
assert digest(OUT / "records.json") == impact["identity"]["currentRecordsHash"]

# Unidade: um par questão–ID de fonte, mesmo se repetido em mais de uma rubrica.
reviews = [
    ("Q0003", "S-c6984c6728ba", "inadequado", CPP, "CPP, art. 573",
     "O artigo disciplina nulidades, não recursos. O cabeçalho do título seguinte foi anexado ao trecho e não pertence ao dispositivo. A leitura do juiz é incorreta.",
     "Separar cabeçalhos; recuperar CPP 397, 593 e 67, III, para os pontos específicos da questão."),
    ("Q0011", "S-e56aa1b1ee1f", "adequado", LAVAGEM, "Lei 9.613/1998, art. 1º",
     "O dispositivo sustenta o assunto ocultação/dissimulação de valores de infração penal. Não basta, sozinho, para confirmar autoria ou competência federal.",
     "Uso temático correto; preservar a distinção entre tema, gabarito e imputação concreta."),
    ("Q0019", "S-85ced96695fd", "adequado", CPP, "CPP, art. 64",
     "Sustenta o caráter reparatório da ação civil ex delicto. Não resolve isoladamente todas as alternativas.",
     "A citação é pertinente, embora a rubrica de evidência textual tenha sido aplicada de modo indevido no mesmo parecer."),
    ("Q0027", "S-a5270bae687e", "adequado", CPP, "CPP, art. 367",
     "Confere com a regra citada de prosseguimento sem acusado pessoalmente citado/intimado e ausente sem justificativa.",
     "Não generalizar para citação por edital, tratada no art. 366."),
    ("Q0028", "S-aa87256f0804", "adequado", CPP, "CPP, art. 406",
     "A citação e a resposta escrita em dez dias pertencem ao rito do Júri, como afirma o juiz.",
     "Apoio correto ao tema; o art. 421, mencionado no parecer, não está provado por este ID."),
    ("Q0028", "S-ab1235ba04cd", "parcial", CPP, "CPP, art. 409",
     "Corrobora a manifestação do MP/querelante em cinco dias. O termo audiência usado pelo juiz é impreciso: este artigo não institui uma audiência oral.",
     "Preferir manifestação/oitiva. A imprecisão não altera o enquadramento no rito do Júri."),
    ("Q0033", "S-0b9b4bdc9a33", "adequado", CPP, "CPP, art. 312",
     "O dispositivo trata da prisão preventiva e sustenta o tema indicado. Os requisitos devem ser lidos em conjunto com os demais artigos aplicáveis.",
     "Conferido o caput utilizado, sem declarar que um trecho isolado resolve todas as hipóteses de prisão."),
    ("Q0033", "S-aba9c13f2655", "adequado", ABUSO, "Lei 13.869/2019, art. 40 → Lei 7.960/1989, art. 2º",
     "A alteração legislativa distingue duração/libertação na prisão temporária e a hipótese de preventiva. É apoio indireto pertinente, não uma definição completa da temporária.",
     "Preferir também o texto consolidado da Lei 7.960/1989 para futuras consultas."),
    ("Q0041", "S-f8a757febdd5", "parcial", CP, "CP, art. 96",
     "Enumera medidas de segurança. Não demonstra sozinho toda a distinção de culpabilidade/inimputabilidade alegada pelo juiz; exige leitura com arts. 26 e 97.",
     "Citação correta quanto ao assunto, com alcance superestimado na distinção dos regimes. Não é validação integral das alternativas nem da política de saúde mental."),
]
citations = []
for qid, sid, grade, url, provision, analysis, action in reviews:
    record = records[qid]
    context = json.loads(record["knowledge"]["judgeContext"])
    source = next(s for s in context["fontes"] if s["id"] == sid)
    fields = [key for key in ["tema_central", "evidencia_textual", "distincao_de_concorrentes"]
              if sid in record["verdict"][key]["justificativa"]]
    assert sid in record["knowledge"]["sourcesUsed"] and fields
    citations.append({"question": qid, "sourceId": sid, "provision": provision,
                      "delivered": True, "officialProvisionExists": True,
                      "useAssessment": grade, "analysis": analysis, "action": action,
                      "primaryVerificationUrl": url, "source": source,
                      "citedIn": {key: record["verdict"][key]["justificativa"] for key in fields},
                      "decision": record.get("decision")})
actual = {(qid, sid) for qid, r in records.items() for sid in r["knowledge"]["sourcesUsed"]}
assert actual == {(r["question"], r["sourceId"]) for r in citations}

# Menções normativas sem ID; revisão limitada à afirmação feita no parecer.
uncited = [
    ("Q0004", "adequado", "CPP, art. 69", [CPP], "A enumeração de critérios de competência é pertinente. Não resolve por si cada assertiva da questão."),
    ("Q0005", "inadequado", "CP, arts. 59, IV, 61, I, e 68", [CP], "Reincidência é agravante da segunda fase; o art. 59, IV, versa sobre substituição da pena, não reincidência. A publicação ficou apoiada em razão jurídica errada."),
    ("Q0008", "adequado", "CP, art. 33, § 4º", [CP], "A referência à reparação/devolução na progressão por crime contra a administração é pertinente ao texto legal. Não valida o veto de evidência textual nem decide qual ramo da taxonomia é preferível."),
    ("Q0012", "adequado", "Lei 9.099/1995, art. 82", [JUIZADOS], "A norma prevê apelação contra rejeição de denúncia/queixa nos Juizados. Cobrar ID externo do classificador continua indevido."),
    ("Q0017", "inadequado", "Lei 1.079/1950 versus CPP, arts. 513–518", [CPP, RESP], "O contexto é o rito do CPP para crimes funcionais; a Lei 1.079 não é a fundamentação adequada. Arts. 513, 514 e 516 estavam entre os trechos entregues e foram desconsiderados."),
    ("Q0020", "adequado", "CP, art. 307", [CP], "É norma penal substantiva de falsa identidade. A citação não demonstra, por si, que a questão deva ser excluída da taxonomia."),
    ("Q0025", "inadequado", "CP, arts. 332, 333 e 316", [CP], "Art. 332 é tráfico de influência; corrupção ativa é art. 333. O trecho entregue do art. 332 termina com o cabeçalho do art. 333. A associação errada reaparece no parecer e acompanha nova publicação divergente."),
    ("Q0028", "adequado", "CPP, art. 421, § 1º", [CPP], "A remessa ao MP por circunstância superveniente que altere a classificação, após preclusão da pronúncia, corresponde ao dispositivo mencionado. Os IDs citados dos arts. 406 e 409 não bastam, por si, para comprovar esta outra regra."),
    ("Q0029", "adequado", "Lei 13.869/2019", [ABUSO], "A identificação da legislação de abuso de autoridade é pertinente; a menção genérica não comprova cada alternativa."),
    ("Q0030", "inadequado", "CP, art. 197 e Título IV da Parte Especial", [CP], "O tipo foi localizado, mas está no título dos crimes contra a organização do trabalho, não no capítulo de liberdade pessoal. É erro de contexto sistemático que afeta o destino."),
    ("Q0036", "parcial", "Lei Maria da Penha, art. 16; STJ Súmula 542 e Tema 1167", [SUM542, TEMA1167], "Lesão corporal doméstica tem ação pública incondicionada. Nesse caso, a audiência não depende da vítima ter ou não manifestado retratação; o art. 16 trata de ações condicionadas. O juiz mistura essa natureza com a regra geral de não designar audiência de ofício."),
    ("Q0037", "inadequado", "CP, arts. 149, 206, 297, § 3º, II, 298 e 342", [CP], "Falso testemunho é art. 342, não 206 (aliciamento para emigração). A afirmação sobre CTPS deve ser confrontada com art. 297, § 3º, II; não basta reproduzir como verdadeira a atribuição ao art. 298 que a alternativa submete a julgamento."),
    ("Q0039", "adequado", "Lei 8.137/1990, art. 4º, II, a", [ORDEM], "A referência a acordo para fixação artificial de preços é pertinente ao tipo contra a ordem econômica. Ausência de nó específico é questão separada da correção da norma."),
    ("Q0049", "adequado", "CP, art. 122, redação da Lei 13.968/2019", [CP], "A instigação/induzimento ao suicídio é o assunto correto. O caput atual não exige morte ou lesão para a figura básica; resultados qualificam hipóteses. Não é conclusão de responsabilidade concreta."),
]
uncited = [{"question": q, "assessment": grade, "provision": provision, "primaryUrls": urls, "analysis": analysis}
           for q, grade, provision, urls, analysis in uncited]
extra = [
    {"question": "Q0022", "assessment": "inadequado", "primaryUrls": [CP],
     "analysis": "O juiz afirma falso testemunho culposo. O CP, art. 18, parágrafo único, exige previsão expressa para culpa; a hipótese das alternativas é peculato culposo (art. 312, § 2º), não falso testemunho (art. 342). O encaminhamento à revisão evita publicação, mas a razão e o tema alternativo estão errados."},
    {"question": "Q0040", "assessment": "divergencia_taxonomica", "primaryUrls": [],
     "analysis": "A oposição Apelação (5562) versus Efeitos dos Recursos (5515) é de escopo temático; não há citação legal no parecer que permita chamar essa divergência, sozinha, de erro jurídico. A referência tem ressalva. Mantida a discordância na métrica original, sem corrigir o rótulo para favorecer o teste."},
]
counts = dict(Counter(r["useAssessment"] for r in citations))
report = {"at": datetime.now(ZoneInfo("America/Fortaleza")).isoformat(),
          "experiment": "local-penal50-v7", "method": "Conferência assistida com fontes primárias; não é revisão humana independente. Critério: correspondência, pertinência e alcance da afirmação citada.",
          "cutoff": "2026-10-16", "temporalLimit": "Conferidos os dispositivos utilizados nas afirmações; não é certificação de vigência/interpretação de todo o corpus nem reconstrução histórica de cada questão.",
          "citations": citations, "citationAssessmentCounts": counts,
          "textualIdOccurrences": sum(len(re.findall(r"S-[a-f0-9]{12}\b", json.dumps(r["verdict"]))) for r in records.values()),
          "uncitedNormativeMentions": uncited, "additionalFindings": extra,
          "identity": impact["identity"], "referenceHash": impact["referenceHash"],
          "referenceChanged": False, "recordsChanged": False, "newModelCalls": 0}
(OUT / "conferencia-juridica.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

left, right = impact["all50"]["baseline"], impact["all50"]["current"]
no_gate = impact["localGapGate"]["withoutGate"]
lines = ["# Conferência jurídica das citações e impacto observado da RAG", "",
         f"Experimento `local-penal50-v7`; conferência em {report['at']}. Nenhuma nova chamada de modelo. "
         "Corpus, referência, propostas, pareceres e decisões foram preservados.", "",
         "O conjunto com RAG elevou a concordância por ramo entre publicadas em **12,0 pontos percentuais**, "
         "com queda de **20 pontos na cobertura**. Foram publicadas seis divergências a menos, mas também quatro "
         "questões concordantes a menos. **Não é possível atribuir os 12 pontos exclusivamente à recuperação de documentos.**", "",
         "Em termos práticos: o filtro ficou mais restritivo. Ele reteve mais divergências, mas também mandou para revisão "
         "questões que coincidiam com a referência. As propostas do classificador não foram corrigidas nem refeitas.", "",
         "## Escopo e critérios da conferência", "",
         "Foram examinados os nove pares questão–fonte dos sete pareceres com IDs, mais quatorze pareceres com alguma menção "
         "normativa sem ID específico para aquele dispositivo e dois casos complementares. A Q0028 aparece nos dois grupos. "
         "Os nove IDs são distintos e aparecem onze vezes nas justificativas. "
         "Não foi feita uma auditoria de relevância de todos os 300 trechos recuperados nem um gabarito jurídico completo das 50 questões.", "",
         "A conferência foi assistida, com consulta a Câmara, Planalto, STJ e fontes oficiais indicadas abaixo; "
         "não constitui revisão humana independente. A referência própria foi mantida para a comparação, inclusive quando tem ressalvas.", "",
         "- **Adequado:** a norma sustenta a afirmação no alcance em que foi usada.",
         "- **Parcial:** assunto correto, com imprecisão ou alcance maior que o demonstrado pelo trecho.",
         "- **Inadequado:** instituto, dispositivo ou inferência incompatível com o conteúdo normativo.", "",
         "A autenticidade e a existência do dispositivo não garantem a correção da interpretação. "
         "As datas das normas relevantes foram consideradas; isto não certifica a vigência de todo o corpus nem "
         "resolve automaticamente questões antigas sob alterações posteriores.", "",
         "## Citações com ID", "",
         "**Nove fontes reais e entregues ao juiz; seis usos adequados, dois parciais e um inadequado.** "
         "Esta contagem avalia usos de fontes, não a precisão jurídica geral do sistema.", "",
         "| Questão | ID | Dispositivo e fonte primária | Uso | Conferência |",
         "| --- | --- | --- | --- | --- |"]
for r in citations:
    lines.append(f"| {r['question']} | `{r['sourceId']}` | [{r['provision']}]({r['primaryVerificationUrl']}) | {r['useAssessment']} | {r['analysis']} |")
lines += ["", "As quatro publicações com citação explícita (Q0011, Q0027, Q0028 e Q0033) coincidem com a referência por ramo: "
          "4/4. O grupo sem ID tem 20/24. Isso é uma descrição de subgrupos escolhidos pelo comportamento do modelo, "
          "não uma comparação randomizada. Quatro itens não demonstram precisão de 95%. Ausência de ID tampouco demonstra "
          "que o juiz ignorou o contexto: Q0025 é um exemplo de influência plausível sem citação formal.", "",
          "## Problemas de segmentação e de uso", "",
          "O segmentador HTML anexou cabeçalhos dos artigos seguintes ao corpo do artigo anterior. "
          "Na Q0003, o trecho do art. 573 termina com o título de recursos; o juiz tomou nulidades por recursos. "
          "Na Q0025, o art. 332 termina com o cabeçalho de corrupção ativa do art. 333, e o juiz reproduziu a associação errada. "
          "A posição desses cabeçalhos foi conferida no [CPP oficial](" + CPP + ") e no [CP oficial](" + CP + "). "
          "A coincidência sugere um mecanismo de erro da RAG, mas não prova o processo interno do modelo nem o efeito causal de retirar os cabeçalhos.", "",
          "A Q0025 é especialmente relevante: saiu de revisão no histórico para publicação no teste com RAG. "
          "O documento juridicamente correto estava disponível; a montagem do trecho e a interpretação falharam. "
          "Na Q0017, por outro lado, os arts. 513, 514 e 516 do CPP foram efetivamente entregues, mas o juiz invocou a Lei 1.079/1950. "
          "Não se pode explicar esse caso apenas por ausência de conhecimento na base.", "",
          "## Menções legais sem ID de fonte", "",
          "A tabela avalia a afirmação normativa, sem transformar toda divergência de taxonomia em erro jurídico.", "",
          "| Questão | Avaliação | Conferência | Fontes primárias |", "| --- | --- | --- | --- |"]
for r in uncited:
    links = ", ".join(f"[fonte {i+1}]({url})" for i, url in enumerate(r["primaryUrls"]))
    lines.append(f"| {r['question']} | {r['assessment']} | {r['analysis']} | {links} |")
for r in extra:
    links = ", ".join(f"[fonte {i+1}]({url})" for i, url in enumerate(r["primaryUrls"]))
    lines += ["", f"**{r['question']}:** {r['analysis']} {links}"]
lines += ["", "Nas quatro divergências publicadas, Q0005, Q0025 e Q0030 têm problemas jurídicos concretos no raciocínio "
          "do juiz. Q0040 requer revisão do critério de especificidade, não uma condenação automática da resposta pela referência.", "",
          "## Precisão e cobertura em relação à referência", "",
          "Por ramo = mesmo tema, ancestral ou descendente. Exata = mesmo ID. As porcentagens a seguir mantêm o universo de 50 IDs; "
          "os dois experimentos têm 49 decisões, mas em conjuntos diferentes. A comparação pareada nos 48 IDs comuns, já disponível "
          "em `impacto-rag.json`, conserva as mesmas contagens de publicações e concordâncias; a cobertura nesses 48 é 79,2% → 58,3%.", "",
          "| Métrica (50 IDs) | Histórico v3 | V7 + RAG + veto | Variação |", "| --- | ---: | ---: | ---: |",
          f"| Publicadas | {left['published']} | {right['published']} | −10 |",
          f"| Concordantes por ramo entre publicadas | {left['publishedAgreementHits']} | {right['publishedAgreementHits']} | −4 |",
          "| Divergentes entre publicadas | 10 | 4 | −6 |",
          f"| Concordância por ramo | {pct(left['publishedAgreement'])} | {pct(right['publishedAgreement'])} | +12,0 p.p. |",
          f"| Concordância exata | {pct(left['exactPublishedAgreement'])} | {pct(right['exactPublishedAgreement'])} | +8,1 p.p. |",
          f"| Cobertura de publicação | {pct(left['coverageAmongSelected'])} | {pct(right['coverageAmongSelected'])} | −20,0 p.p. |",
          "| Concordantes publicadas / 50 selecionadas | 56,0% | 48,0% | −8,0 p.p. |", "",
          "O número de publicações divergentes caiu 60% (10 → 4); o de concordantes publicadas caiu 14,3% (28 → 24). "
          "Essas medidas descrevem o compromisso entre seleção mais estrita e aproveitamento dos itens. "
          "A meta de 95% não foi atingida, inclusive pelo critério mais permissivo de ramo. O intervalo Wilson da concordância "
          "atual é 68,5%–94,3%; ele não corrige seleção do recorte, dependência entre questões ou erros da referência.", "",
          "### De onde vieram as mudanças", "",
          "Das 38 publicações históricas, 25 foram mantidas e 13 viraram revisão: **sete divergentes e seis concordantes**. "
          "Três itens antes em revisão foram publicados: **dois concordantes e um divergente**. "
          "Logo, o saldo foi de seis divergências evitadas e quatro concordâncias publicadas perdidas.", ""]
for key, label in [("removed", "Publicações retiradas"), ("added", "Publicações acrescentadas")]:
    group = impact["publicationChanges"][key]
    lines += [f"- {label}, concordantes: {', '.join(group['branchMatches'])}.",
              f"- {label}, divergentes: {', '.join(group['branchDisagreements'])}."]
lines += ["", "Cinco das seis publicações concordantes retiradas (Q0001, Q0012, Q0019, Q0029 e Q0044) receberam "
          "objeções que exigem fonte/regra externa na rubrica de evidência textual; a Q0024 tem lacuna de doutrina. "
          "Isso não é, por si, demonstração de melhor conferência jurídica. A rubrica deveria verificar a evidência da questão.", "",
          "## Qual parte pode ser atribuída à RAG?", "",
          "O efeito isolado dos documentos **não é identificável com este histórico**. Ficaram constantes as propostas "
          "e os modelos/papéis, mas mudaram simultaneamente o prompt do juiz (v3 → v7), a exposição do rótulo original, "
          "os documentos e a regra de veto por lacuna. Há também variação natural das respostas e do provedor. "
          "Os 12,0 p.p. são o efeito observado da condição inteira, não uma estimativa causal da recuperação.", "",
          "### Efeito determinístico que conseguimos medir", "",
          "Reexecutei somente o motor de decisão sobre os mesmos pareceres, desativando `requireContextForPublication`. "
          "Não houve novo julgamento nem retirada dos documentos do contexto que gerou esses pareceres.", "",
          "| Mesmos pareceres V7 | Sem veto de lacunas | Com veto (real) |", "| --- | ---: | ---: |",
          f"| Publicações | {no_gate['published']} | {right['published']} |",
          f"| Concordantes por ramo | {no_gate['publishedAgreementHits']} | {right['publishedAgreementHits']} |",
          f"| Concordância | {pct(no_gate['publishedAgreement'])} | {pct(right['publishedAgreement'])} |",
          f"| Cobertura / 50 | {pct(no_gate['coverageAmongSelected'])} | {pct(right['coverageAmongSelected'])} |", "",
          "O veto retirou uma concordante (Q0007) e uma divergente (Q0031): **+2,4 p.p. de concordância condicional e "
          "−4 p.p. de cobertura** sobre esses pareceres fixos. O veto da Q0007 foi disparado por um plano de fontes "
          "com tópico incorreto. Portanto parte do resultado vem de uma política de bloqueio e de seus metadados, não "
          "de melhor raciocínio do juiz. Os outros 9,6 p.p. em uma decomposição nessa ordem continuam confundindo prompt, "
          "rótulo original e documentos; não devem ser rotulados como ganho puro da RAG.", "",
          "## Recomendações para a próxima medição", "",
          "1. Corrigir a delimitação de artigos/cabeçalhos, carregar a hierarquia da norma e revisar o plano da Q0007 em um novo snapshot; preservar o atual.",
          "2. Melhorar a busca para evitar artigos de diplomas/assuntos diferentes ocupando o contexto; medir relevância dos trechos antes do julgamento.",
          "3. Separar no prompt/contrato a evidência da questão e o apoio externo. Não usar falta de ID do classificador como motivo de reprovação.",
          "4. Comparar dois braços com as mesmas propostas, prompt, modelo, parâmetros e rótulo original, mascarando apenas os documentos no controle. Deixar o veto por lacunas desativado em ambos para medir o efeito do contexto; avaliar o veto separadamente por cálculo determinístico.",
          "5. Repetir as condições e reservar questões não usadas para construir/ajustar a base. Registrar a referência provisória e suas ressalvas sem alterá-la após ver o resultado.", "",
          "Esse teste controlado é uma recomendação; **não foi executado nesta análise**. "
          "Os cálculos são reproduzíveis com `node --import tsx scripts/analise-impacto-rag.ts` e "
          "`python3 scripts/conferencia-juridica-rag.py`. Os JSONs preservam os trechos usados, justificativas, "
          "fontes oficiais, IDs das transições e hashes de entrada.", ""]
(OUT / "analise-juridica-e-impacto.md").write_text("\n".join(lines))
assert digest(OUT / "records.json") == impact["identity"]["currentRecordsHash"]
assert len(citations) == 9 and counts == {"inadequado": 1, "adequado": 6, "parcial": 2}
print(json.dumps({"report": str(OUT / "analise-juridica-e-impacto.md"), "citationGrades": counts,
                  "uncitedMentionsReviewed": len(uncited), "newModelCalls": 0}, ensure_ascii=False))
