"""Gera uma leitura dos resultados salvos, sem inferência nem alteração de rótulos."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(file):
    return json.loads(file.read_text())


def jsonl(file):
    return [json.loads(line) for line in file.read_text().splitlines() if line.strip()]


def folder(name):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", name):
        raise ValueError("Nome de experimento inválido")
    return ROOT / "output/experiments" / name


def statistics(name):
    directory = folder(name)
    records = read(directory / "records.json")
    evaluation = read(directory / "evaluation-exploratorio.json")
    events = jsonl(directory / "events.jsonl")
    requests = jsonl(directory / "requests.jsonl")
    usage = {event["data"]["requestId"]: event["data"] for event in events
             if event["type"] == "usage" and isinstance(event["data"].get("usage"), dict)}
    starts = {request["requestId"] for request in requests if request["phase"] == "start"}
    start_details = {request["requestId"]: request for request in requests if request["phase"] == "start"}
    transport_failures = [{key: value for key, value in {
        "requestId": request["requestId"], "role": start_details.get(request["requestId"], {}).get("role"),
        "ids": start_details.get(request["requestId"], {}).get("ids"), "phase": request["phase"],
        "status": request.get("status"), "error": request.get("error"), "durationMs": request.get("durationMs"),
    }.items() if value is not None} for request in requests
        if request["phase"] == "network_error" or (request["phase"] == "response" and request.get("status", 0) >= 400)]
    responses = {request["requestId"]: request for request in requests if request["phase"] == "response"}
    active_requests, rejected_outputs = {}, {}
    for event in events:
        details = event["data"]
        if event["type"] in ["stage_attempt", "usage"]:
            active_requests[details["role"]] = details["requestId"]
        if event["type"] != "validation" or not details.get("errors"):
            continue
        request_id = active_requests.get(details["role"])
        response = responses.get(request_id, {})
        try:
            raw_output = json.loads(response["body"])["choices"][0]["message"]["content"]
            decoded = json.loads(re.sub(r"\s*```$", "", re.sub(r"^```(?:json)?\s*", "", raw_output.strip(), flags=re.I)))
        except (KeyError, TypeError, IndexError, ValueError):
            raw_output, decoded = response.get("body", "Resposta indisponível."), None
        for id, message in details["errors"].items():
            matching = [item for item in decoded.get("resultados", []) if isinstance(item, dict) and item.get("id") == id] if isinstance(decoded, dict) and isinstance(decoded.get("resultados"), list) else []
            output = json.dumps(matching[0] if len(matching) == 1 else decoded, ensure_ascii=False, indent=2) if decoded is not None else raw_output
            rejected_outputs.setdefault(id, []).append({"requestId": request_id, "role": details["role"], "error": message,
                "output": output[:8000], "truncatedForReport": len(output) > 8000})
    rows = evaluation["rows"]
    ids = [row["id"] for row in rows]
    manifest = read(directory / "manifest.json")
    config = manifest["config"]
    attempts_by_id = {id: records.get(id, {}).get("attempts", {}) for id in ids}
    stage_limit = config.get("maxAttemptsPerStage", 1)
    exhausted = [{"id": id, "role": role, "attempts": count}
                 for id, attempts in attempts_by_id.items() for role, count in attempts.items()
                 if count >= stage_limit and not records.get(id, {}).get("proposal" if role == "classifier" else "verdict")]
    summary = {
        "experiment": name,
        "selected": len(ids),
        "proposals": sum(bool(records.get(id, {}).get("proposal")) for id in ids),
        "verdicts": sum(bool(records.get(id, {}).get("verdict")) for id in ids),
        "decisions": sum(bool(records.get(id, {}).get("decision")) for id in ids),
        "pending": [id for id in ids if not records.get(id, {}).get("decision")],
        "metrics": evaluation["overall"],
        "requestAttempts": len(starts),
        "reportedUsageCalls": len(usage),
        "attemptsWithoutUsage": sorted(starts - usage.keys()),
        "inputTokens": sum(item["usage"].get("prompt_tokens", 0) for item in usage.values()),
        "cachedInputTokens": sum((item["usage"].get("prompt_tokens_details") or {}).get("cached_tokens", 0) for item in usage.values()),
        "outputTokens": sum(item["usage"].get("completion_tokens", 0) for item in usage.values()),
        "reasoningTokens": sum((item["usage"].get("completion_tokens_details") or {}).get("reasoning_tokens", 0) for item in usage.values()),
        "reportedCostUsd": sum(item["usage"].get("cost", 0) for item in usage.values()),
        "callsWithoutReportedCost": sum("cost" not in item["usage"] for item in usage.values()),
        "summedRequestDurationMs": sum(item["durationMs"] for item in usage.values()),
        "summedAttemptDurationMs": sum(request.get("durationMs", 0) for request in requests if request["phase"] in ["response", "network_error"]),
        "transportFailures": transport_failures,
        "requestedConfig": config,
        "codeHash": manifest["codeHash"],
        "attemptsById": attempts_by_id,
        "additionalStageAttempts": sum(max(0, count - 1) for attempts in attempts_by_id.values() for count in attempts.values()),
        "exhaustedStages": exhausted,
        "technicalErrorsById": {id: records[id]["errors"] for id in ids if records.get(id, {}).get("errors")},
        "rejectedOutputsById": {id: rejected_outputs[id] for id in ids if id in rejected_outputs},
        "rubricCounts": {field: {state: sum(records.get(id, {}).get("verdict", {}).get(field, {}).get("avaliacao") == state for id in ids)
                                  for state in ["sustentado", "incerto", "inadequado"]}
                         for field in ["tema_central", "evidencia_textual", "distincao_de_concorrentes"]},
        "scope": "Comparação exploratória com referência provisória; não comprova precisão jurídica real.",
    }
    for start in range(0, len(rows), 10):
        group = rows[start:start + 10]
        key = f"{group[0]['id']}-{group[-1]['id']}"
        published = [row for row in group if row["decisao"] == "publicar"]
        hits = sum(row["relacao_final"] in ["exato", "ancestral", "descendente"] for row in published)
        proposals = [row for row in group if row["relacao_proposta"] is not None]
        proposal_hits = sum(row["relacao_proposta"] in ["exato", "ancestral", "descendente", "fora"] for row in proposals)
        summary.setdefault("groupsOf10", {})[key] = {
            "selected": len(group), "completed": sum(bool(row["decisao"]) for row in group),
            "published": len(published), "publishedAgreementHits": hits,
            "publishedAgreement": hits / len(published) if published else None,
            "classifierAgreementHits": proposal_hits, "classifierAgreementDenominator": len(proposals),
            "classifierAgreement": proposal_hits / len(proposals) if proposals else None,
        }
    return summary, records, evaluation


def percent(value):
    return "não disponível" if value is None else f"{value * 100:.1f}%"


def escape(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("experiment")
    parser.add_argument("--baseline")
    args = parser.parse_args()
    summary, records, evaluation = statistics(args.experiment)
    directory = folder(args.experiment)
    prepared = read(ROOT / "output/prepared.json")
    themes = {theme["tema_id"]: theme for theme in prepared["themes"]}
    questions = {question["id"]: question for question in prepared["questions"]}
    lines = [f"# Resultado: {args.experiment}", "", summary["scope"], "",
             f"Propostas: {summary['proposals']}/{summary['selected']}. Pareceres: {summary['verdicts']}/{summary['selected']}. Decisões: {summary['decisions']}/{summary['selected']}.",
             f"Tentativas de chamada: {summary['requestAttempts']}. Tokens informados de entrada/saída/raciocínio: {summary['inputTokens']}/{summary['outputTokens']}/{summary['reasoningTokens']}.",
             f"Custo informado: US$ {summary['reportedCostUsd']:.2f}. Tentativas sem consumo retornado: {len(summary['attemptsWithoutUsage'])}.",
             f"Soma dos tempos de requisições com consumo informado: {summary['summedRequestDurationMs'] / 1000:.1f} s (não é tempo de parede).", ""]
    lines += [f"Soma das durações de todas as tentativas com término registrado, incluindo falhas: {summary['summedAttemptDurationMs'] / 1000:.1f} s. Consumo ausente continua desconhecido.", ""]
    lines += [f"Tokens de entrada informados como cache: {summary['cachedInputTokens']} (já incluídos no total de entrada).", ""]
    if args.baseline:
        base, _, previous = statistics(args.baseline)
        same_ids = [row["id"] for row in previous["rows"]] == [row["id"] for row in evaluation["rows"]]
        changed_config = [key for key in sorted(base["requestedConfig"].keys() | summary["requestedConfig"].keys())
                          if base["requestedConfig"].get(key) != summary["requestedConfig"].get(key)]
        caution = ("Parâmetros diferentes: " + ", ".join(changed_config) + ". " if changed_config else "")
        caution += "A comparação é exploratória."
        if any(base["requestedConfig"][key] != summary["requestedConfig"][key] for key in ["classifierModel", "judgeModel"]):
            caution += " A troca de modelos não isola a contribuição individual de cada papel."
        code_changed = base["codeHash"] != summary["codeHash"]
        if code_changed:
            caution += " O código também mudou entre os experimentos."
        if base["requestedConfig"]["batchSize"] != summary["requestedConfig"]["batchSize"]:
            caution += " O tamanho da requisição e o orçamento de saída disponível por questão mudaram juntos; não é um teste isolado do agrupamento."
        summary["comparison"] = {"baseline": args.baseline, "sameSelectedIds": same_ids, "baselineSummary": base,
                                 "changedConfig": changed_config, "codeChanged": code_changed, "caution": caution}
        lines += ["## Comparação", "", f"Mesmos IDs selecionados: {'sim' if same_ids else 'não; não comparar médias diretamente'}.", "",
                  "| Medida | Anterior | Atual |", "|---|---|---|"]
        for label, before, after in [
            ("Pareceres", base["verdicts"], summary["verdicts"]),
            ("Publicar", base["metrics"]["published"], summary["metrics"]["published"]),
            ("Revisar", base["metrics"]["reviewed"], summary["metrics"]["reviewed"]),
            ("Fora", base["metrics"]["outside"], summary["metrics"]["outside"]),
            ("Concordância entre fora", percent(base["metrics"]["outsideAgreement"]), percent(summary["metrics"]["outsideAgreement"])),
            ("Concordância do classificador", percent(base["metrics"]["classifierAgreementBeforeFilter"]), percent(summary["metrics"]["classifierAgreementBeforeFilter"])),
            ("Concordância entre publicadas", percent(base["metrics"]["publishedAgreement"]), percent(summary["metrics"]["publishedAgreement"])),
            ("Cobertura entre selecionadas", percent(base["metrics"]["coverageAmongSelected"]), percent(summary["metrics"]["coverageAmongSelected"])),
            ("Tokens de raciocínio", base["reasoningTokens"], summary["reasoningTokens"]),
            ("Tokens de entrada", base["inputTokens"], summary["inputTokens"]),
            ("Tokens de entrada em cache", base["cachedInputTokens"], summary["cachedInputTokens"]),
            ("Tentativas de chamada", base["requestAttempts"], summary["requestAttempts"]),
            ("Soma dos tempos informados (s)", round(base["summedRequestDurationMs"] / 1000, 1), round(summary["summedRequestDurationMs"] / 1000, 1)),
            ("Soma dos tempos de tentativas, incluindo falhas (s)", round(base["summedAttemptDurationMs"] / 1000, 1), round(summary["summedAttemptDurationMs"] / 1000, 1)),
        ]:
            lines.append(f"| {label} | {before} | {after} |")
        lines += ["", summary["comparison"]["caution"], "",
                  "A concordância do classificador usa todas as propostas disponíveis. A concordância entre publicadas usa somente os itens indicados para publicação; observe também seus denominadores e a cobertura.", ""]
    lines += ["## Grupos de 10 questões", "",
              "| IDs | Propostas | Concordância do classificador | Publicadas | Concordância entre publicadas |",
              "|---|---:|---:|---:|---:|"]
    for ids, group in summary.get("groupsOf10", {}).items():
        lines.append(f"| {ids} | {group['classifierAgreementDenominator']}/{group['selected']} | "
                     f"{group['classifierAgreementHits']}/{group['classifierAgreementDenominator']} ({percent(group['classifierAgreement'])}) | "
                     f"{group['published']} | {group['publishedAgreementHits']}/{group['published']} ({percent(group['publishedAgreement'])}) |")
    lines += ["", "Os grupos seguem os IDs selecionados; recuperações podem reunir pendências de grupos diferentes.", "",
              "## Tentativas e falhas técnicas", "",
              f"Tentativas adicionais por etapa: {summary['additionalStageAttempts']}. Etapas esgotadas: {len(summary['exhaustedStages'])}.", "",
              "As contagens persistidas abaixo estão disponíveis no modo individual. Experimentos anteriores podem não possuir esses contadores.", "",
              "| ID | Classificador | Juiz | Falhas registradas | Etapas esgotadas |",
              "|---|---:|---:|---:|---|"]
    for id in [row["id"] for row in evaluation["rows"]]:
        attempts = summary["attemptsById"][id]
        errors = summary["technicalErrorsById"].get(id, [])
        exhausted_roles = [stage["role"] for stage in summary["exhaustedStages"] if stage["id"] == id]
        if attempts or errors:
            lines.append(f"| {id} | {attempts.get('classifier', 'não registrado')} | {attempts.get('judge', 'não registrado')} | {len(errors)} | {', '.join(exhausted_roles) or 'nenhuma'} |")
    if summary["transportFailures"]:
        lines += ["", "Falhas de transporte:", "", "| IDs | Etapa | Falha | Duração (s) |", "|---|---|---|---:|"]
        for failure in summary["transportFailures"]:
            lines.append(f"| {', '.join(failure.get('ids', []))} | {failure.get('role', 'desconhecida')} | {escape(failure.get('error') or failure.get('status'))} | {failure.get('durationMs', 0) / 1000:.1f} |")
    lines += ["", "## Leitura por questão", ""]
    for row in evaluation["rows"]:
        id = row["id"]
        record = records.get(id, {})
        proposal, verdict, decision = record.get("proposal"), record.get("verdict"), record.get("decision")
        lines += [f"### {id}", ""]
        if record.get("errors") or not decision or row["relacao_final"] in ["irmao", "distinto"]:
            question = questions[id]
            lines += ["Enunciado e comando do item para conferência:", "",
                      escape(question["enunciado"]), "", escape(question["comando"]), ""]
            for letter, text in question["alternativas"].items():
                lines.append(f"- **{escape(letter)}:** {escape(text)}")
            lines.append("")
        if proposal:
            theme_id = proposal["tema_central_id"]
            lines += [f"Tema proposto: {theme_id or 'fora'} — {escape(themes.get(theme_id, {}).get('caminho', 'Fora'))}.",
                      f"Classificador: {escape(proposal['justificativa'])}", ""]
            for evidence in proposal["evidencias"]:
                lines.append(f"- Evidência em {escape(evidence['campo'])}: {escape(evidence['trecho'])}")
            lines += [f"Incertezas do classificador: {escape('; '.join(proposal['incertezas'])) or 'nenhuma'}.", ""]
        if verdict:
            for field in ["tema_central", "evidencia_textual", "distincao_de_concorrentes"]:
                rubric = verdict[field]
                lines += [f"- **{field}: {rubric['avaliacao']}**. {escape(rubric['justificativa'])}"]
            lines += [f"- Alternativa de tema: {verdict['tema_alternativo_id'] or 'nenhuma'}.",
                      f"- Alertas: {escape('; '.join(verdict['alertas'])) or 'nenhum'}.", ""]
        reference_id = row["tema_referencia"]
        lines += [f"Decisão: {decision['decisao'] if decision else 'pendente'}. Referência provisória: {reference_id or 'fora'} — {escape(themes.get(reference_id, {}).get('caminho', 'Fora'))}. Relação: {row['relacao_final'] or 'sem resultado'}.", ""]
        if decision:
            lines += [f"Motivo da decisão: {escape(decision['motivo'])}", ""]
        if record.get("errors"):
            lines += ["Falhas técnicas registradas (incluem tentativas recuperadas):", ""]
            for error in record["errors"]:
                lines.append(f"- {error['at']} — {error['stage']}: {escape(error['message'])}")
            lines.append("")
        for rejected in summary["rejectedOutputsById"].get(id, []):
            lines += [f"Resposta rejeitada de {rejected['role']} — {escape(rejected['error'])}", "",
                      "```json", rejected["output"], "```", ""]
            if rejected["truncatedForReport"]:
                lines += ["Trecho limitado a 8.000 caracteres neste relatório; resposta completa em requests.jsonl.", ""]
    (directory / "resumo.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    (directory / "pareceres.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({key: value for key, value in summary.items() if key not in ["comparison", "requestedConfig"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
