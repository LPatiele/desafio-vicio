"""Summarize recorded integration diagnostics without inference or network calls."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/integration/lexml-mcp"


def read(file):
    return json.loads(file.read_text())


requests = []
usages = []
for folder in [OUT / "protocol", OUT / "protocol/compat"]:
    requests.extend(json.loads(line) for line in (folder / "requests.jsonl").read_text().splitlines())
    usages.extend(row["data"]["usage"] for line in (folder / "events.jsonl").read_text().splitlines()
                  if (row := json.loads(line))["type"] == "usage" and row["data"].get("usage"))
starts = [r for r in requests if r["phase"] == "start"]
responses = [r for r in requests if r["phase"] == "response"]
errors = [{"requestId": r["requestId"], "status": r["status"], "error": json.loads(r["body"]).get("error")}
          for r in responses if r["status"] != 200]
backend = read(OUT / "backend.json")
pilot = read(OUT / "pilot-status.json")
protocol = read(OUT / "protocol/summary.json")
compat = read(OUT / "protocol/compat-state.json")
lock = read(ROOT / "vendor/lexmcp-source-lock.json")
summary = {
    "at": datetime.now(timezone.utc).isoformat(),
    "status": "blocked_on_lexml_challenge" if backend["search"]["status"] == "challenge" else "see_backend_report",
    "provider": "ehrodan/lexmcp", "revision": lock["revision"],
    "openRouterRequests": len(starts), "responses200": sum(r["status"] == 200 for r in responses),
    "errors": errors,
    "usage": {"responses": len(usages), "promptTokens": sum(r.get("prompt_tokens", 0) for r in usages),
              "completionTokens": sum(r.get("completion_tokens", 0) for r in usages),
              "reportedCost": sum(r.get("cost", 0) or 0 for r in usages)},
    "protocolInitial": protocol["probes"], "protocolCompatibility": compat,
    "legalSearch": backend["search"], "offlineResolution": backend["resolution"]["status"],
    "pilot": pilot,
    "localValidation": {"nodeTests": 43, "nodePassed": 43, "upstreamLexmlTests": 7, "upstreamLexmlPassed": 7, "typecheck": "passed"},
    "qualityComparisonExecuted": False,
    "files": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in [
        "src/client.ts", "src/mcp/lexmcp-server.py", "src/research/judge.ts", "src/research/session.ts",
        "src/research/checkpoint.ts", "src/validation.ts", "src/agents/juiz.v4-lexml.md", "package-lock.json",
        "vendor/lexmcp-requirements.lock", "config/lexml-pesquisa-v4.json", "config/lexml-controle-v4.json"]},
}
(OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
ids = ", ".join(pilot["ids"])
report = f"""# Execução da integração MCP — 17/10/2026

Implementação experimental concluída e diagnóstico executado. **A comparação de qualidade com dez questões não foi executada:** a busca real do LexML recebeu uma página de verificação de segurança, em vez do XML SRU. Não há resultados de precisão ou cobertura deste piloto.

## Servidor indicado e substituição

O clone e a API pública do GitHub retornaram 404 para `prof-ramos/LeXML-mcp`, embora sua documentação estivesse indexada. Evidência: `source-availability.json`.

O usuário indicou [ehrodan/lexmcp](https://github.com/ehrodan/lexmcp), que é outro projeto. A revisão baixada e fixada é `{lock['revision']}`, versão declarada 0.5.0, licença MIT. Foi criado um adaptador restrito que chama somente `pesquisar_lexml` e `resolver_urn_lexml` do código original. O arquivo `vendor/lexmcp-source-lock.json` registra {len(lock['files'])} arquivos e o lock das dependências Python.

O adaptador foi iniciado via stdio e anunciou as duas ferramentas. A pesquisa externa falhou por desafio HTML. A validação offline de URN funcionou; ela somente monta um link e não comprova disponibilidade, teor ou vigência da norma. O backend detalhado está em `backend.json`.

## Protocolo dos modelos no OpenRouter

| Modelo | Resultado real |
| --- | --- |
| Nemotron 3.5 Super VL gratuito | Ferramenta solicitada, resultado recebido e JSON final correto em duas requisições. |
| Nemotron 3 Super gratuito | Solicitou ferramenta; primeira continuação falhou com HTTP 404 por `tool_choice=none`. Continuação adicional com `auto` e JSON Schema foi concluída corretamente. |

O erro retornado foi: `No endpoints found that support the provided 'tool_choice' value.` A falha original e o diagnóstico adicional foram preservados em `protocol/` e `protocol/compat/`.

As configurações experimentais usam `finalToolChoice=auto`, mantêm as definições na conversa e aplicam JSON Schema na fase final. O transporte rejeita pedidos de nova ferramenta nessa fase, inclusive na última inferência disponível.

Esses testes usaram uma **função local de verificação**, não documentos jurídicos nem a busca LexML. Eles demonstram o ciclo do protocolo, não melhoria da classificação.

## Chamadas e validações

- {len(starts)} envios OpenRouter: quatro do teste inicial e um diagnóstico adicional.
- {summary['responses200']} respostas HTTP 200 e {len(errors)} HTTP 404.
- Uso informado em {len(usages)} respostas: {summary['usage']['promptTokens']} tokens de entrada e {summary['usage']['completionTokens']} de saída; custo reportado nessas respostas: {summary['usage']['reportedCost']}. O erro HTTP 404 não informou uso.
- Nenhuma chamada de modelo para o piloto de classificação/julgamento das dez questões.
- 43 testes Node aprovados e verificação de tipos aprovada.
- 7 testes locais do módulo LexML original aprovados, incluindo parsing, filtros, URN e detecção de HTML. Esses testes usam HTTP simulado.
- A consulta de rede real foi repetida fora do sandbox após erro local de conexão. Fora do sandbox, a falha foi o desafio de segurança do portal.

## Piloto preservado

Os IDs congelados são: {ids}.

As propostas foram validadas e sua importação é rastreável ao experimento `individual-v3-invertido-50`. A seleção usa ordenação por hash, sem ler a referência. O mesmo prompt v4, modelos, raciocínio e regras seriam usados nos dois braços. Trata-se de desenvolvimento com questões já expostas; não demonstra precisão de 95%.

`mcp:pilot` verificou o bloqueio antes de executar qualquer braço. Não foram criadas métricas de qualidade a partir de buscas vazias, simuladas ou indisponíveis. O estado está em `pilot-status.json` e a seleção em `cohort.json`.

## O que ficou implementado

Transporte de ferramentas e continuação, adaptador MCP restrito, validação de argumentos, proveniência separada das evidências da questão, fontes com IDs verificáveis, snapshots, cache apenas de sucessos, retomada persistente, até cinco envios de modelo por etapa, duas operações MCP e no máximo dois envios por operação. Toda inferência mantém o controlador compartilhado de taxa.

O padrão do projeto continua com prompts v3 e sem pesquisa. O motor `decide` foi preservado. Na configuração com pesquisa, o grafo só decide após a pesquisa obrigatória e o parecer válido.

## Como retomar

Em uma próxima tentativa manual, execute `npm run mcp:check`. Se a busca real retornar os documentos esperados, execute `npm run mcp:pilot`; o verificador precisa ter sido aprovado nos últimos trinta minutos. O piloto reaproveitará a coorte congelada e as propostas de origem.

Não há repetição automática do desafio HTML. O próximo passo depende de disponibilidade do portal, e não de aumentar a cota OpenRouter. Uma fonte alternativa de texto oficial seria outra condição experimental e exigiria adaptação explícita.

Documentação dos módulos e parâmetros: [docs/integracao-lexml-mcp.md](../../../docs/integracao-lexml-mcp.md).
"""
(OUT / "relatorio.md").write_text(report)
print(json.dumps({"report": str(OUT / "relatorio.md"), "openRouterRequests": len(starts), "pilotStatus": pilot["status"], "nodeTests": 43, "upstreamTests": 7}, ensure_ascii=False))
