import "dotenv/config";
import { getConfig } from "../config.js";
import { LexmlClient } from "./lexml-client.js";
import { normalizeEvidence } from "../research/evidence.js";
import { atomicJson, now, redact, resolveRoot } from "../utils.js";

async function main() {
  const file = resolveRoot("output/integration/lexml-mcp/backend.json");
  const config = await getConfig(resolveRoot("config/lexml-pesquisa-v4.json"));
  let client: LexmlClient | undefined;
  try {
    client = await LexmlClient.connect(config.research!);
    const explain = config.research!.provider === "prof-ramos/LeXML-mcp" ? await client.call("lexml_explain", {}) : { note: "Servidor alternativo não possui lexml_explain; capacidades verificadas via tools/list." };
    const searchName = client.registry.searchName, resolveName = client.registry.resolveName;
    const searchArgs = searchName === "pesquisar_lexml" ? { termos: "código de defesa do consumidor", campo: "titulo", limite: 5 } : { query: 'dc.title any "código de defesa do consumidor"', maximum_records: 5 };
    const search = normalizeEvidence(await client.call(searchName, client.registry.arguments(searchName, JSON.stringify(searchArgs))), config.research!.maxResultCharacters);
    const resolution = normalizeEvidence(await client.call(resolveName, client.registry.arguments(resolveName, JSON.stringify({ urn: "urn:lex:br:federal:lei:1990-09-11;8078", ...(resolveName === "lexml_resolve_urn" ? { verify: true } : {}) }))), config.research!.maxResultCharacters);
    const result = { at: now(), status: search.status === "ok" && resolution.status === "ok" ? "ready" : "blocked", identity: client.identity, explain, search, resolution };
    await atomicJson(file, result);
    if (result.status !== "ready") process.exitCode = 2;
    return { status: result.status, search: search.status, resolution: resolution.status, file };
  } catch (error) {
    await atomicJson(file, { at: now(), status: "blocked", error: (error as Error).message, modelCalls: 0 });
    process.exitCode = 2;
    return { status: "blocked", error: (error as Error).message, file };
  } finally { await client?.close(); }
}
main().then(result => console.log(JSON.stringify(redact(result), null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
