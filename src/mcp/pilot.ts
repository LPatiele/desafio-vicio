import "dotenv/config";
import { getConfig } from "../config.js";
import { loadData } from "../data.js";
import { evaluate } from "../evaluation.js";
import { importProposals, runExperiment } from "../runner.js";
import { atomicJson, exists, hash, now, readJson, redact, resolveRoot } from "../utils.js";
import { verifySourceLock } from "./lexml-client.js";

async function main() {
  const dir = resolveRoot("output/integration/lexml-mcp");
  const source = "individual-v3-invertido-50";
  const data = await loadData();
  const seed = "lexml-pareado-10-v1";
  const pool = Object.keys(await readJson<Record<string, unknown>>(resolveRoot("output/experiments", source, "records.json")));
  const ids = pool.sort((a, b) => hash(seed + a).localeCompare(hash(seed + b))).slice(0, 10);
  const imported = await importProposals(source, data, ids);
  const cohort = { seed, ids, source: imported.provenance, nature: "desenvolvimento, seleção por hash sem consulta à referência" };
  const cohortFile = `${dir}/cohort.json`;
  if (await exists(cohortFile)) {
    if (JSON.stringify(await readJson(cohortFile)) !== JSON.stringify(cohort)) throw new Error("Coorte ou propostas mudaram; preserve o piloto congelado.");
  } else await atomicJson(cohortFile, cohort);
  const control = await getConfig(resolveRoot("config/lexml-controle-v4.json"));
  const treatment = await getConfig(resolveRoot("config/lexml-pesquisa-v4.json"));
  try {
    await verifySourceLock(treatment.research!);
    const backend = await readJson<{ at: string; status: string; search?: { status: string } }>(`${dir}/backend.json`);
    if (backend.status !== "ready") throw new Error(`Verificação MCP indisponível (${backend.search?.status ?? backend.status}). Execute mcp:check e prossiga somente após busca real bem-sucedida.`);
    if (Date.now() - Date.parse(backend.at) > 30 * 60 * 1000 || !Number.isFinite(Date.parse(backend.at))) throw new Error("Verificação MCP tem mais de 30 minutos; execute mcp:check antes do piloto.");
  } catch (error) {
    const result = { at: now(), status: "blocked", ids, source, modelCalls: 0, reason: (error as Error).message, controlExecuted: false, treatmentExecuted: false };
    await atomicJson(`${dir}/pilot-status.json`, result);
    process.exitCode = 2;
    return result;
  }
  const protocol = await readJson<{ probes: { model: string; status: string }[] }>(`${dir}/protocol/summary.json`);
  const compat = await exists(`${dir}/protocol/compat-state.json`) ? await readJson<{ model: string; status: string }>(`${dir}/protocol/compat-state.json`) : null;
  if ([control.classifierModel, control.judgeModel].some(model => !protocol.probes.some(p => p.model === model && p.status === "complete") && !(compat?.model === model && compat.status === "complete"))) throw new Error("Conclua mcp:smoke/compat com os dois modelos antes do piloto.");
  const results = [];
  for (const [experiment, config] of [["lexml-v4-controle-10", control], ["lexml-v4-pesquisa-10", treatment]] as const) {
    const execution = await runExperiment(experiment, data, config, ids, "exploratorio", false, source);
    const evaluation = await evaluate(experiment, data, ids, "exploratorio");
    results.push({ experiment, execution, overall: evaluation.overall });
  }
  const result = { at: now(), status: "executed", ids, results, caution: "Concordância com referência provisória, amostra de desenvolvimento; não demonstra 95%." };
  await atomicJson(`${dir}/pilot-status.json`, result);
  return result;
}
main().then(result => console.log(JSON.stringify(redact(result), null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
