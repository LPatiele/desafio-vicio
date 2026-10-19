"""Consolida os testes v2 e documenta itens e erros sem alterar checkpoints."""
import html
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/comparisons"
NAMES = ["piloto-5x10-v2-juiz-nemotron35", "piloto-5x10-v2-invertido-nemotron35"]
BASES = ["piloto-5x10-v3-juiz-nemotron35", "piloto-5x10-v3-invertido-nemotron35"]
LABELS = ["Classificador 3 Super / juiz 3.5 VL", "Classificador 3.5 VL / juiz 3 Super"]


def read(path):
    return json.loads(path.read_text())


def norm(value):
    return re.sub(r"\s+", " ", value).strip()


def cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def local(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(ZoneInfo("America/Fortaleza")).strftime("%d/%m %H:%M:%S")


def percent(value):
    return "indefinida" if value is None else f"{value * 100:.1f}%".replace(".", ",")


def source(question, field):
    if field in ["enunciado", "comando"]:
        return question[field]
    return question["alternativas"].get(field[12:]) if field.startswith("alternativa:") else None


def main():
    prepared = read(ROOT / "output/prepared.json")
    questions = {q["id"]: q for q in prepared["questions"]}
    themes = {t["tema_id"]: t for t in prepared["themes"]}
    theme = lambda id: "Fora / sem tema" if id is None else f"{id} — {themes[id]['caminho']}"
    diagnostics = {"scope": "Resultados exploratórios; divergência com referência provisória, não erro jurídico confirmado.", "experiments": {}}
    affected = set()
    loaded = []
    for name, base, label in zip(NAMES, BASES, LABELS):
        folder = ROOT / "output/experiments" / name
        records = read(folder / "records.json")
        evaluation = read(folder / "evaluation-exploratorio.json")
        summary = read(folder / "resumo.json")
        logs = [json.loads(line) for line in (folder / "requests.jsonl").read_text().splitlines() if line.strip()]
        starts = {x["requestId"]: x for x in logs if x["phase"] == "start"}
        calls, quotes = [], {}
        for entry in logs:
            start = starts.get(entry.get("requestId"), {})
            if entry["phase"] == "network_error":
                calls.append({"requestId": entry["requestId"], "at": local(entry["at"]), "kind": "timeout / erro de rede", "role": start["role"], "ids": start["ids"], "durationMs": entry["durationMs"], "outputLimit": start["body"]["max_tokens"], "message": entry["error"]})
                continue
            if entry["phase"] != "response":
                continue
            try:
                body = json.loads(entry["body"])
                choice = body["choices"][0]
            except (ValueError, KeyError, IndexError, TypeError):
                continue
            if choice.get("finish_reason") == "length":
                calls.append({"requestId": entry["requestId"], "at": local(entry["at"]), "kind": "saída truncada (length)", "role": start["role"], "ids": start["ids"], "durationMs": entry["durationMs"], "outputLimit": start["body"]["max_tokens"], "usage": body.get("usage"), "message": "Resposta não aceita: término por limite de saída."})
            if start.get("role") != "classifier":
                continue
            try:
                proposals = json.loads(choice["message"]["content"])["resultados"]
            except (ValueError, KeyError, TypeError):
                continue
            for proposal in proposals:
                question = questions.get(proposal.get("id"))
                if question is None:
                    continue
                for evidence in proposal.get("evidencias", []):
                    original = source(question, evidence["campo"])
                    if original is not None and norm(evidence["trecho"]) in norm(original):
                        continue
                    repaired = html.unescape(re.sub(r"<br\s*/?>", " ", evidence["trecho"], flags=re.I))
                    quotes.setdefault(proposal["id"], []).append({"at": local(entry["at"]), "requestId": entry["requestId"], "field": evidence["campo"], "quote": evidence["trecho"], "brEntityNormalizationWouldMatch": original is not None and norm(repaired) in norm(original), "rejectedTheme": proposal.get("tema_central_id")})
        rows = {row["id"]: row for row in evaluation["rows"]}
        wrong = [row["id"] for row in rows.values() if row["decisao"] == "publicar" and row["relacao_final"] not in ["exato", "ancestral", "descendente"]]
        wrong_outside = [row["id"] for row in rows.values() if row["decisao"] == "fora" and row["relacao_final"] != "fora"]
        item_ids = set(quotes) | set(summary["pending"]) | set(wrong) | set(wrong_outside)
        for call in calls:
            item_ids.update(call["ids"])
        affected.update(item_ids)
        detail = {"label": label, "pending": summary["pending"], "publishedDisagreements": wrong, "outsideDisagreements": wrong_outside, "quoteFailures": quotes, "callFailures": calls, "affectedIds": sorted(item_ids)}
        diagnostics["experiments"][name] = detail
        loaded.append((name, base, label, records, rows, summary, detail))

    lines = ["# Erros e itens afetados nos testes v2", "", diagnostics["scope"], "", "Horários abaixo em America/Fortaleza (UTC−3). Os enunciados e alternativas são transcritos do arquivo preparado, sem correção jurídica. As citações rejeitadas são exibidas literalmente, inclusive marcação HTML inserida pelo modelo.", "", "## Pendências atuais", "", "| Configuração | ID | Situação |", "|---|---|---|"]
    for name, _, label, records, _, summary, detail in loaded:
        for id in summary["pending"]:
            record = records[id]
            reason = "Proposta e parecer presentes; decisão inconclusiva sem tema alternativo válido." if "verdict" in record else "Sem proposta validada; citações rejeitadas."
            if id == "Q0020" and name == NAMES[0]:
                reason = "Classificador e juiz sustentam fora, mas há incerteza do classificador e alerta do juiz. As regras vetam a aceitação e não há tema para revisão."
            if id == "Q0044" and name == NAMES[0]:
                reason = "Sem proposta validada; duas rejeições de citações e última tentativa truncada no limite de 3.200 tokens."
            lines.append(f"| {label} | {id} | {reason} |")
    lines += ["", "A última recuperação planejada dos onze itens invertidos (grupos de seis e cinco) não recebeu autorização de execução. Nenhuma chamada dessa rodada foi enviada. Essas onze pendências continuam salvas; não foram convertidas em revisão ou fora.", "", "## Chamadas interrompidas ou truncadas", "", "| Configuração | Horário | Etapa | IDs | Falha | Duração registrada | Teto de saída |", "|---|---|---|---|---|---:|---:|"]
    for _, _, label, _, _, _, detail in loaded:
        for call in detail["callFailures"]:
            lines.append(f"| {label} | {call['at']} | {call['role']} | {', '.join(call['ids'])} | {call['kind']} | {call['durationMs'] / 1000:.1f} s | {call['outputLimit']} |")
    lines += ["", "O timeout configurado é de 900.000 ms; as durações acima são as registradas pelo processo e podem exceder o limite nominal. Os timeouts não retornaram uso de tokens. Não há evidência suficiente para atribuir essas interrupções aos prompts.", "", "## Publicações divergentes da referência", "", "| Configuração | ID | Tema publicado | Referência | Relação |", "|---|---|---|---|---|"]
    for _, _, label, _, rows, _, detail in loaded:
        for id in detail["publishedDisagreements"]:
            row = rows[id]
            lines.append(f"| {label} | {id} | {cell(theme(row['tema_final']))} | {cell(theme(row['tema_referencia']))} | {row['relacao_final']} |")
    lines += ["", "## Fora divergente e revisões de propostas concordantes", "", "| Configuração | Fora divergente da referência | Revisões com proposta concordante |", "|---|---|---|"]
    for _, _, label, _, rows, _, detail in loaded:
        agreeing_reviews = [row['id'] for row in rows.values() if row['decisao'] == 'revisar' and row['relacao_proposta'] in ['exato', 'ancestral', 'descendente']]
        lines.append(f"| {label} | {', '.join(detail['outsideDisagreements']) or 'nenhum'} | {', '.join(agreeing_reviews) or 'nenhuma'} |")
    lines += ["", "Uma revisão de proposta concordante não é necessariamente erro de decisão: pode haver incerteza material. A lista explicita o custo de cobertura do filtro em relação à referência escolhida."]
    lines += ["", "## Conferência por questão", "", "Cada questão abaixo informa o conteúdo original, o estado em cada configuração afetada, o histórico de erros, as citações rejeitadas e os pareceres relevantes. Um erro recuperado continua no histórico e não significa que o item permaneceu pendente.", ""]
    for id in sorted(affected):
        question = questions[id]
        lines += [f"### {id}", "", "**Enunciado preparado**", "", "```text", question["enunciado"], "```", ""]
        if question["comando"]:
            lines += ["**Comando**", "", "```text", question["comando"], "```", ""]
        for letter, text in question["alternativas"].items():
            lines += [f"**Alternativa {letter}**", "", "```text", text, "```", ""]
        for name, _, label, records, rows, _, detail in loaded:
            if id not in detail["affectedIds"]:
                continue
            record, row = records[id], rows[id]
            lines += [f"#### {label}", "", f"Estado: **{row['decisao'] or 'pendente'}**. Proposta validada: {'sim' if 'proposal' in record else 'não'}. Parecer: {'sim' if 'verdict' in record else 'não'}.", f"Referência provisória: {theme(row['tema_referencia'])}. Limitação registrada na referência: {'sim' if row['referencia_limitada'] else 'não'}.", ""]
            if "proposal" in record:
                proposal = record["proposal"]
                lines += [f"Tema proposto: {theme(proposal['tema_central_id'])}. Confiança declarada: {proposal['confianca_declarada']}.", f"Justificativa: {proposal['justificativa']}", f"Incertezas declaradas: {'; '.join(proposal['incertezas']) or 'nenhuma'}.", ""]
            if record["errors"]:
                lines += ["**Histórico de erros registrado por ID**", ""]
                for error in record["errors"]:
                    lines.append(f"- {local(error['at'])} — `{error['stage']}`: {error['message']}")
                lines.append("")
            for quote in detail["quoteFailures"].get(id, []):
                lines += [f"**Citação rejeitada em {quote['at']} — campo `{quote['field']}`**", f"Tema da tentativa rejeitada: {theme(quote['rejectedTheme'])}. Request ID: `{quote['requestId']}`.", "", "```text", quote["quote"], "```", "", f"Normalizar apenas `<br>` e entidades HTML faria o trecho corresponder ao original: **{'sim' if quote['brEntityNormalizationWouldMatch'] else 'não'}**. Diagnóstico apenas; nenhuma correção foi aplicada.", ""]
            for call in detail["callFailures"]:
                if id in call["ids"]:
                    lines += [f"- Chamada afetada: {call['at']}, `{call['role']}`, {call['kind']}; request ID `{call['requestId']}`."]
            lines.append("")
            if "verdict" in record and (id in detail["publishedDisagreements"] or id in detail["outsideDisagreements"] or row["decisao"] is None):
                verdict = record["verdict"]
                lines += ["**Parecer recebido**", ""]
                for key in ["tema_central", "evidencia_textual", "distincao_de_concorrentes"]:
                    lines.append(f"- {key}: **{verdict[key]['avaliacao']}** — {verdict[key]['justificativa']}")
                lines += [f"- Tema alternativo: {theme(verdict['tema_alternativo_id'])}.", f"- Fora sustentado: {verdict['fora_sustentado']}.", f"- Alertas: {'; '.join(verdict['alertas']) or 'nenhum'}.", ""]
            if "decision" in record:
                lines += [f"Motivo da decisão: {record['decision']['motivo'] or 'Nenhuma restrição acionada; três critérios sustentados.'}", ""]
    for name, _, label, _, _, _, _ in loaded:
        lines += [f"Registros de {label}: [requests.jsonl](../experiments/{name}/requests.jsonl), [records.json](../experiments/{name}/records.json), [pareceres completos](../experiments/{name}/pareceres.md).", ""]
    (OUT / "piloto-v2-erros-e-itens.md").write_text("\n".join(lines) + "\n")
    (OUT / "piloto-v2-erros-e-itens.json").write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"report": str(OUT / "piloto-v2-erros-e-itens.md"), "affectedDistinctIds": len(affected), "experiments": {name: {"pending": d['pending'], "publishedDisagreements": d['publishedDisagreements'], "failedQuoteIds": len(d['quoteFailures']), "callFailures": len(d['callFailures'])} for name, d in diagnostics['experiments'].items()}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
