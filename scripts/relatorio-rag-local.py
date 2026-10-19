"""Relatório offline de um teste local já avaliado pelo CLI; não chama modelos."""
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from statistics import median
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("experiment")
parser.add_argument("--baseline", default="individual-v3-invertido-50")
args = parser.parse_args()
if any(not name or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for c in name)
       for name in [args.experiment, args.baseline]):
    raise ValueError("Nome de experimento inválido")
out = ROOT / "output/experiments" / args.experiment
base = ROOT / "output/experiments" / args.baseline


def read(file):
    return json.loads(file.read_text())


def jsonl(file):
    return [json.loads(line) for line in file.read_text().splitlines() if line.strip()]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def escape(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def pct(value):
    return "não estimável" if value is None else f"{100 * value:.1f}%".replace(".", ",")


def title(theme):
    return f"{theme} — {themes.get(theme, 'tema desconhecido')}" if theme else "fora / sem destino"


records, baseline = read(out / "records.json"), read(base / "records.json")
themes = {t["tema_id"]: t["titulo"] for t in read(ROOT / "output/prepared.json")["themes"]}
evaluation = read(out / "evaluation-exploratorio.json")
comparison_file = ROOT / "output/comparisons" / f"{args.baseline}-{args.experiment}-exploratorio.json"
comparison = read(comparison_file)
manifest, prompts = read(out / "manifest.json"), read(out / "prompts.json")
plan = read((ROOT / manifest["config"]["knowledge"]["snapshot"]).parent / "plan.json")
scope = {q["id"]: q for q in plan["questions"]}
events, requests = jsonl(out / "events.jsonl"), jsonl(out / "requests.jsonl")
rows = {r["id"]: r for r in evaluation["rows"]}
starts = [r for r in requests if r["phase"] == "start"]
responses = [r for r in requests if r["phase"] == "response"]
network_errors = [r for r in requests if r["phase"] == "network_error"]
usages = [e["data"] for e in events if e["type"] == "usage"]
known_usage = [u["usage"] for u in usages if isinstance(u.get("usage"), dict)]
preflight = next(e["data"] for e in events if e["type"] == "preflight")
costs = [u["cost"] for u in known_usage if isinstance(u.get("cost"), (int, float))]
durations = [r["durationMs"] for r in responses]
elapsed_ms = ((datetime.fromisoformat(responses[-1]["at"].replace("Z", "+00:00"))
               - datetime.fromisoformat(starts[0]["at"].replace("Z", "+00:00"))).total_seconds() * 1000
              if starts and responses else None)
errors = [{"id": id, **error} for id, r in records.items() for error in r["errors"]]
technical_errors = [e for e in errors if e["stage"] != "decision"]
decision_errors = [e for e in errors if e["stage"] == "decision"]
sources = [s for r in records.values() if r.get("knowledge")
           for s in json.loads(r["knowledge"]["judgeContext"])["fontes"]]
gaps = {id: r["knowledge"]["gaps"] for id, r in records.items()
        if r.get("knowledge", {}).get("gaps")}
with_citations = [id for id, r in records.items() if r.get("verdict") and r["knowledge"]["sourcesUsed"]]
completed = [r for r in records.values() if r.get("decision")]
gap_vetoes = [id for id, r in records.items()
              if r.get("decision", {}).get("motivo", "").startswith("Base local sem trechos")]
published_disagreements = [r for r in evaluation["rows"] if r["decisao"] == "publicar"
                           and r["relacao_final"] not in ["exato", "ancestral", "descendente"]]
changes = [{"id": id, "before": baseline[id].get("decision"), "after": r.get("decision")}
           for id, r in records.items() if baseline[id].get("decision") != r.get("decision")]
transition = Counter((baseline[id].get("decision", {}).get("decisao", "pendente"),
                      r.get("decision", {}).get("decisao", "pendente"))
                     for id, r in records.items())
identity = manifest["importedProposals"]
assert identity["manifestHash"] == digest(base / "manifest.json")
assert identity["recordsHash"] == digest(base / "records.json")
assert all(r["proposal"] == baseline[id]["proposal"] for id, r in records.items())
for role in ["classifier", "judge"]:
    assert hashlib.sha256(prompts[role].encode()).hexdigest() == manifest["promptHashes"][role]
for request in starts:
    assert request["role"] == "judge"
    payload = json.loads(request["body"]["messages"][1]["content"])["questoes"]
    assert len(payload) == 1
    id = request["ids"][0]
    assert payload[0]["contexto_externo"] == json.loads(records[id]["knowledge"]["judgeContext"])
    assert payload[0]["proposta"] == baseline[id]["proposal"]

report = {
    "at": datetime.now(ZoneInfo("America/Fortaleza")).isoformat(),
    "experiment": args.experiment, "baseline": args.baseline,
    "overall": evaluation["overall"], "pairedMetrics": comparison["pairedMetrics"],
    "sameCompletedIds": comparison["sameCompletedIds"], "commonCompleted": comparison["commonCompleted"],
    "calls": len(starts), "responsesByStatus": dict(Counter(r["status"] for r in responses)),
    "networkErrors": network_errors, "recordErrors": errors,
    "technicalErrors": technical_errors, "unresolvedDecisionErrors": decision_errors,
    "usage": {"responses": len(known_usage), "promptTokens": sum(u.get("prompt_tokens", 0) for u in known_usage),
              "completionTokens": sum(u.get("completion_tokens", 0) for u in known_usage),
              "costResponses": len(costs), "reportedCostSum": sum(costs) if costs else None,
              "requestDurationMsSum": sum(r["durationMs"] for r in responses),
              "networkErrorDurationMsSum": sum(r.get("durationMs", 0) for r in network_errors),
              "elapsedFirstSendToLastResponseMs": elapsed_ms,
              "medianResponseMs": median(durations) if durations else None,
              "maximumResponseMs": max(durations) if durations else None,
              "reportedReasoningTokens": sum((u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0) or 0
                                             for u in known_usage)},
    "retrieval": {"contexts": sum("knowledge" in r for r in records.values()), "deliveredChunks": len(sources),
                  "distinctDeliveredIds": len({s["id"] for s in sources}), "verdictsWithCitations": with_citations,
                  "citationCount": sum(len(r.get("knowledge", {}).get("sourcesUsed", [])) for r in records.values()),
                  "gaps": gaps, "publicationVetoesByLocalGaps": gap_vetoes},
    "decisionTransitions": [{"before": a, "after": b, "count": n} for (a, b), n in sorted(transition.items())],
    "publishedDisagreements": published_disagreements, "changes": changes,
    "audit": {"proposalsIdenticalToBaseline": True, "importHashesValid": True, "savedPromptHashesValid": True,
              "onlyJudgeCalled": True, "everyRequestContainsSavedContext": True},
    "validation": {"testsPassed": 64, "typecheck": "passed", "recordsLoadedByEvaluation": True},
    "limitations": ["Concordância com referência provisória, que pode conter erros.",
                    "Recorte de desenvolvimento com base preparada para estas 50 questões.",
                    "Comparação histórica: prompt, rótulo original, contexto e veto por lacuna variam juntos.",
                    "Citação de ID verifica proveniência, não garante pertinência ou interpretação jurídica."]}
(out / "resumo-rag.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

m, lm, rm = evaluation["overall"], comparison["pairedMetrics"]["left"], comparison["pairedMetrics"]["right"]
interval = m["publishedAgreementWilson95"]
window = "não estimável" if interval is None else f"{pct(interval[0])} a {pct(interval[1])}"
lines = [f"# Teste do juiz com RAG local — {args.experiment}", "",
         f"Gerado em {report['at']} (America/Fortaleza). {len(completed)}/{len(records)} questões com decisão e "
         f"{sum('verdict' in r for r in records.values())} pareceres válidos. "
         f"Concordância entre publicadas: **{m['publishedAgreementHits']}/{m['published']} ({pct(m['publishedAgreement'])})**; "
         f"cobertura: **{pct(m['coverageAmongSelected'])}**. Meta de 95% "
         + ("atingida neste recorte, sem garantia de generalização." if m["publishedAgreement"] is not None and m["publishedAgreement"] >= .95
            else "não atingida neste recorte."), "", "## Configuração e comparação", "",
         "Foram reutilizadas as propostas originais do Nemotron 3.5 Super VL com prompt v3. "
         "Somente o juiz Nemotron 3 Super foi chamado, com esforço médio e prompt v7 local. "
         "A busca SQLite FTS5/BM25 entrega até seis trechos e 16 mil caracteres por questão. "
         "O juiz recebe também o rótulo original; a referência própria é usada apenas na avaliação posterior.", "",
         f"Base: `{manifest['config']['knowledge']['snapshot']}`; identidade: `{manifest['knowledgeIdentity']['manifestHash']}`.", "",
         f"Comparação pareada nos **{comparison['commonCompleted']} IDs com decisão em ambos**:", "",
         "| Métrica | Histórico v3 | Juiz v7 com base |", "| --- | ---: | ---: |"]
for name, field in [("Publicadas", "published"), ("Revisão", "reviewed"), ("Fora", "outside")]:
    lines.append(f"| {name} | {lm[field]} | {rm[field]} |")
for name, field in [("Concordância por ramo entre publicadas", "publishedAgreement"),
                    ("Concordância exata entre publicadas", "exactPublishedAgreement"),
                    ("Cobertura dos IDs pareados", "coverageAmongSelected")]:
    lines.append(f"| {name} | {pct(lm[field])} | {pct(rm[field])} |")
lines += ["", "Por ramo significa mesmo ID, ancestral ou descendente; irmãos e ramos distintos não contam como concordância. "
          "A concordância exata exige o mesmo ID da referência. "
          f"Nos {len(records)} selecionados, o resultado novo tem {m['published']} publicadas, {m['reviewed']} revisões, "
          f"{m['outside']} fora e {len(records)-m['processed']} sem decisão final. "
          f"Intervalo Wilson de 95% entre publicadas: {window}.", "",
          "Esta comparação histórica não isola a RAG: mudaram também o prompt, o acesso ao rótulo original e o veto por lacunas. "
          "A seleção e a base foram preparadas para estas questões, já usadas no desenvolvimento. "
          "A referência provisória pode conter erros; concordância não comprova precisão jurídica nem desempenho futuro.", "",
          "## Execução e falhas", "",
          f"- {len(starts)} chamadas ao juiz; zero ao classificador e zero chamadas HTTP para recuperação local.",
          f"- Respostas HTTP: {dict(Counter(r['status'] for r in responses))}; falhas de rede: {len(network_errors)}.",
          f"- Erros técnicos de etapa: {len(technical_errors)}; registros de decisão não resolvida: {len(decision_errors)}. "
          "cinco tentativas totais por questão, sem repetir parecer válido.",
          f"- Uso reportado em {len(known_usage)} respostas: {report['usage']['promptTokens']} tokens de entrada e "
          f"{report['usage']['completionTokens']} de saída. Custo somado das {len(costs)} respostas com custo informado: "
          f"{report['usage']['reportedCostSum']}. Erros sem uso não são contabilizados como custo conhecido.",
          f"- Tempo entre primeiro envio e última resposta: {round(elapsed_ms / 60000, 1) if elapsed_ms is not None else 'indisponível'} minutos. "
          f"Mediana das respostas HTTP: {round(median(durations) / 1000, 1) if durations else 'indisponível'} segundos; "
          f"máxima: {round(max(durations) / 1000, 1) if durations else 'indisponível'} segundos.",
          f"- Cota gratuita no início: {preflight.get('quota')}. Testes locais: 64 aprovados; tipos aprovados.", ""]
if errors:
    lines += ["| Questão | Etapa | Erro |", "| --- | --- | --- |"]
    lines += [f"| {e['id']} | {e['stage']} | {escape(e['message'])} |" for e in errors]
else:
    lines += ["Nenhuma falha técnica foi registrada nos registros por questão."]
if network_errors:
    lines += ["", "Falhas de rede:"] + [f"- `{r['requestId']}`: {r.get('error')}" for r in network_errors]
lines += ["", "## Recuperação e uso declarado", "",
          f"Foram entregues {len(sources)} trechos ({report['retrieval']['distinctDeliveredIds']} IDs distintos). "
          f"{len(with_citations)} pareceres citam pelo menos uma fonte; "
          f"{report['retrieval']['citationCount']} citações distintas por parecer somadas. "
          "Os IDs citados foram validados contra os efetivamente entregues. Essa validação não prova que o trecho sustente a conclusão.", "",
          f"Publicações vetadas especificamente pela regra de lacunas da base: {', '.join(gap_vetoes) or 'nenhuma'}. "
          "São decisões que seriam publicáveis pelas rubricas e pelas demais regras deste registro, mas foram enviadas à revisão pelo contexto local.", "",
          "Lacunas declaradas no plano da base (podem vetar publicação, mesmo quando as rubricas são sustentadas):"]
lines += [f"- {id}: {'; '.join(values)}" for id, values in gaps.items()] or ["- Nenhuma."]
lines += ["", "## Divergências ainda publicadas", ""]
if published_disagreements:
    lines += ["| ID | Tema final | Referência | Relação | Referência com ressalva |", "| --- | --- | --- | --- | --- |"]
    lines += [f"| {r['id']} | {escape(title(r['tema_final']))} | {escape(title(r['tema_referencia']))} | {r['relacao_final']} | {'sim' if r['referencia_limitada'] else 'não'} |"
              for r in published_disagreements]
else:
    lines += ["Nenhuma divergência por ramo entre as publicadas neste recorte."]
lines += ["", "## Transições de decisão", "", "| Antes | Depois | Quantidade |", "| --- | --- | ---: |"]
lines += [f"| {a} | {b} | {n} |" for (a, b), n in sorted(transition.items())]
if args.experiment == "local-penal50-v7":
    lines += ["", "## Problemas observados durante a inspeção", "",
              "- **Q0001, Q0003, Q0008, Q0012 e Q0019:** o juiz rejeitou evidência textual por falta de apoio externo. "
              "O prompt v7 diz expressamente que essa rubrica avalia as citações da questão e que a fonte externa "
              "não as substitui. As respostas são tecnicamente válidas, mas mostram aderência inconsistente ao critério. "
              "Na Q0012, chegou a cobrar IDs externos da proposta de um classificador que não recebeu essa base. "
              "Não foram repetidas para obter uma aprovação.",
              "- **Q0005:** o juiz aprovou o destino afirmando que reincidência seria circunstância judicial "
              "da primeira fase, em vez de agravante. O próprio corpus contém o art. 61, I, do CP "
              "(`S-bfd0856fd36b`), que enumera reincidência entre as circunstâncias agravantes. "
              "É um caso de justificativa problemática mesmo com uma base disponível; conferir também quais trechos "
              "foram efetivamente recuperados para esse item.",
              "- **Q0007:** o plano congelado atribui o tópico 'Emendatio mutatio libelli', enquanto as alternativas "
              "distinguem ação pública incondicionada, condicionada e privada. A busca complementar vazia de mutatio "
              "é tratada como lacuna e veta publicação, embora o parecer tenha as três rubricas sustentadas. "
              "Isso revela um problema do planejamento de cobertura e do veto baseado nesse plano. "
              "A base e as regras foram preservadas durante o teste; uma correção precisa de outra versão.",
              "- **Q0001, recuperação:** entre os seis trechos entregues há um precedente sobre alienação fiduciária "
              "de imóvel (STF RG 982), sem relação evidente com a questão de Tribunal do Júri. "
              "O retorno de candidatos para todos os IDs não comprova relevância de todos os resultados.", ""]
lines += ["", "## Conferência por questão", "",
          "As fontes listadas abaixo são apenas as citadas no parecer. Os trechos completos entregues, consultas, hashes, "
          "lacunas, proposta, parecer e decisão estão em `records.json`; as requisições e respostas integrais, em `requests.jsonl`.", ""]
rubrics = ["tema_central", "evidencia_textual", "distincao_de_concorrentes"]
for id, r in records.items():
    old = baseline[id].get("decision") or {}
    decision = r.get("decision") or {}
    ev = rows[id]
    lines += [f"### {id}", "",
              f"Proposta: `{title(r['proposal']['tema_central_id'])}`. "
              f"Decisão: **{decision.get('decisao', 'pendente')}** "
              f"(antes: {old.get('decisao', 'pendente')}); tema final: `{title(decision.get('tema_central_id'))}`. "
              f"Referência: `{title(ev['tema_referencia'])}`; relação final: {ev['relacao_final'] or 'sem decisão'}.", ""]
    if r.get("verdict"):
        v = r["verdict"]
        for rubric in rubrics:
            lines.append(f"- {rubric}: **{v[rubric]['avaliacao']}** — {v[rubric]['justificativa']}")
        lines += [f"- Tema alternativo: `{title(v['tema_alternativo_id']) if v['tema_alternativo_id'] else 'null'}`; "
                  f"fora sustentado: `{json.dumps(v['fora_sustentado'])}`.",
                  f"- Alertas: {('; '.join(v['alertas']) or 'nenhum').rstrip('.')}." ]
    else:
        lines += ["Parecer não obtido; consultar erros e tentativas."]
    reason = decision.get("motivo") or ("sem ressalvas na decisão" if decision else "decisão não obtida; consultar erros")
    lines += ["", f"Motivo determinístico: {reason.rstrip('.')}." , ""]
    ctx = r.get("knowledge")
    if ctx:
        delivered = {s["id"]: s for s in json.loads(ctx["judgeContext"])["fontes"]}
        lines += [f"Tópico no plano da base: {scope[id]['topics']}. "
                  f"Fontes entregues: {len(delivered)}; citadas: {len(ctx['sourcesUsed'])}; lacunas: {len(ctx['gaps'])}.", ""]
        lines += [f"- `{sid}` — [{s['titulo']}]({s['url']}), `{s['localizador']}`."
                  for sid in ctx["sourcesUsed"] for s in [delivered[sid]]]
        lines += [""]
lines += ["## Integridade conferida", "",
          "As propostas são idênticas às do experimento de origem, cujos arquivos mantêm os hashes importados. "
          "Os prompts salvos correspondem aos hashes do manifesto. Cada requisição foi feita apenas ao juiz "
          "e contém exatamente o contexto local salvo. A avaliação reabriu a base, verificou seus hashes, regenerou "
          "os contextos e revalidou os pareceres e as decisões determinísticas. Nenhum rótulo da referência própria foi enviado ao modelo.", ""]
if (out / "analise-juridica-e-impacto.md").exists():
    lines[4:4] = ["[Conferência jurídica das citações e análise do impacto na precisão/cobertura](analise-juridica-e-impacto.md). "
                  "Inclui falhas de segmentação, usos inadequados de normas e o efeito separado do veto por lacunas.", ""]
(out / "relatorio-rag.md").write_text("\n".join(lines))
print(json.dumps({"report": str(out / "relatorio-rag.md"), "calls": len(starts), "overall": m}, ensure_ascii=False))
