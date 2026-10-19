import { parseArgs } from "node:util";
import { getConfig } from "../config.js";
import { loadData } from "../data.js";
import { importProposals } from "../runner.js";
import { atomicJson, now, redact, resolveRoot } from "../utils.js";
import { ContextService, loadOriginalLabels } from "./context.js";
import { LexmlApi } from "./lexml-api.js";

async function main() {
  const { values } = parseArgs({ options: {
    id: { type: "string", default: "Q0001" }, "proposals-from": { type: "string", default: "individual-v3-invertido-50" },
    config: { type: "string", default: resolveRoot("config/individual-v5-contexto-api.json") },
  } });
  const config = await getConfig(values.config), data = await loadData();
  if (!config.retrieval?.enabled) throw new Error("Configuração requer retrieval.enabled=true.");
  const seed = await importProposals(values["proposals-from"]!, data, [values.id!]);
  const api = new LexmlApi(config.retrieval);
  const service = new ContextService(config, data, await loadOriginalLabels(data), api);
  const directory = resolveRoot("output/integration/lexml-direct-api", now().replace(/[:.]/g, "-"));
  const save = () => atomicJson(`${directory}/records.json`, seed.records);
  await service.collect(seed.records[values.id!]!, save);
  const context = seed.records[values.id!]!.retrieval!;
  const report = { at: now(), id: values.id, importedProposals: seed.provenance, status: context.status, apiCalls: api.calls, modelCalls: 0,
    queries: context.queries.map(q => ({ terms: q.terms, roles: q.roles, status: q.result?.status, httpStatus: q.result?.httpStatus, error: q.result?.error })), directory };
  await atomicJson(`${directory}/summary.json`, report);
  if (context.status !== "complete") process.exitCode = 2;
  return report;
}
main().then(result => console.log(JSON.stringify(redact(result), null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
