"""Expose only the two LexML functions from the pinned ehrodan/lexmcp source.

This adapter does not register DataJud, DJe, document generation or corpus tools.
Provenance hashes describe returned metadata, never the text of a legal norm.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor/lexmcp/src"))

from fastmcp import FastMCP
from mcp_juridico_brasil._core import JuridicoError, configure_logging
from mcp_juridico_brasil.lexml.tools import pesquisar_lexml as search
from mcp_juridico_brasil.lexml.tools import resolver_urn_lexml as resolve

configure_logging("WARNING")
app = FastMCP("LexMCP - pesquisa de classificação")


def provenance(payload: dict, query: str | None = None) -> dict:
    source_url = "https://www.lexml.gov.br/busca/SRU"
    if query:
        source_url += "?" + urlencode({"operation": "searchRetrieve", "version": "1.1", "query": query})
    timestamp = datetime.now(timezone.utc).isoformat()
    return {**payload, "provenance": {
        "producer": "application_adapter", "backend_name": "ehrodan/lexmcp",
        "backend_version": "0.5.0", "schema_version": "lexmcp-adapter.v1",
        "source_url": source_url if query else payload.get("url_resolvedor", source_url),
        "authority": "Portal LexML Brasil", "network_retrieved": bool(query),
        **({"retrieved_at": timestamp} if query else {"generated_at": timestamp}),
        "content_hash": hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
        "hash_scope": "returned_metadata_not_legal_full_text",
    }}


@app.tool
async def pesquisar_lexml(termos: str, campo: str = "todos", tipo_documento: str | None = None,
                         localidade: str | None = None, autoridade: str | None = None,
                         ano_inicio: int | None = None, ano_fim: int | None = None,
                         pagina: int = 1, limite: int = 5) -> dict:
    """Pesquisa metadados oficiais LexML por termos; máximo cinco registros na primeira página."""
    if limite < 1 or limite > 5 or pagina != 1:
        return {"error": {"type": "invalid_arguments", "message": "Limite de cinco registros e primeira página."}}
    try:
        result = await search(termos, campo, tipo_documento, localidade, autoridade,
                              ano_inicio, ano_fim, pagina, limite)
        return provenance(result, str(result.get("consulta_cql", "")))
    except JuridicoError as exc:
        message = str(exc)
        challenge = "verificacao de seguranca" in message.lower()
        transient = any(term in message.lower() for term in ("timeout", "connecterror", "http 502", "http 503", "http 504"))
        return {"is_challenge_like": challenge, "error": {
            "type": "challenge" if challenge else "network_error" if transient else "lexml_error",
            "message": message, "detail": exc.detail,
        }}


@app.tool
async def resolver_urn_lexml(urn: str) -> dict:
    """Valida URN e monta URL oficial, offline. Não verifica rede, conteúdo nem vigência."""
    try:
        return provenance({**await resolve(urn), "resolution_verified": False})
    except JuridicoError as exc:
        return {"error": {"type": "invalid_arguments", "message": str(exc)}}


if __name__ == "__main__":
    app.run(transport="stdio")
