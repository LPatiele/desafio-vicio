import "dotenv/config";
import { parseArgs } from "node:util";
import { getConfig } from "./config.js";
import { loadData, prepareData } from "./data.js";
import { preflight } from "./client.js";
import { runExperiment } from "./runner.js";
import { calibrate, createSplit, evaluate, loadExperiment, loadSplit, metrics } from "./evaluation.js";
import { exportDelivery } from "./export.js";
import { atomicJson, now, redact, resolveRoot } from "./utils.js";
import type { Prepared } from "./types.js";
import { directQuotaStatus } from "./providers/direct.js";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  config: { type: "string" }, experiment: { type: "string", default: "pagos-v10-gemini-openai" },
  swap: { type: "boolean", default: false }, limit: { type: "string" }, ids: { type: "string" },
  subset: { type: "string", default: "exploratorio" }, "max-calls": { type: "string" },
  "dry-run": { type: "boolean", default: false }, "development-count": { type: "string", default: "60" },
  seed: { type: "string", default: "case-v1" }, confidence: { type: "string", default: "calibrated" },
  forecast: { type: "string" }, left: { type: "string" }, right: { type: "string" },
  "proposals-from": { type: "string" },
  "budget-usd": { type: "string" },
  reference: { type: "string" },
} });
function integer(value: string | undefined, fallback: number, minimum = 0) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < minimum) throw new Error(`Número inteiro inválido: ${value}`);
  return n;
}
async function select(data: Prepared) {
  const subset = values.subset!;
  if (!["exploratorio", "development", "evaluation"].includes(subset)) throw new Error("subset: exploratorio, development ou evaluation.");
  const split = subset === "exploratorio" ? null : await loadSplit(data);
  if (subset !== "exploratorio" && !split) throw new Error("Crie a divisão com split:data antes de escolher o subconjunto.");
  let ids = split ? split[subset as "development" | "evaluation"] : data.questions.map(q => q.id);
  if (values.ids) {
    const requested = values.ids.split(",").map(s => s.trim());
    if (new Set(requested).size !== requested.length || requested.some(id => !ids.includes(id))) throw new Error("IDs ausentes, duplicados ou fora do subconjunto.");
    ids = requested;
  }
  if (values.limit) ids = ids.slice(0, integer(values.limit, ids.length, 1));
  return ids;
}
async function main() {
  const command = positionals[0];
  if (command === "prepare") {
    const data = await prepareData();
    return { questions: data.questions.length, activeThemes: data.themes.filter(t => t.status === "active").length,
      largestCleaningReductions: [...data.cleaning].sort((a, b) => (b.before - b.after) - (a.before - a.after)).slice(0, 5) };
  }
  const config = await getConfig(values.config ?? resolveRoot("config/individual-v10-gemini-openai.json"), values.swap);
  const referenceVersion = values.reference ?? (config.direct ? "analise-propria-v2" : "analise-propria-v1");
  if (values["budget-usd"] !== undefined) {
    const amount = Number(values["budget-usd"]);
    if (!config.direct || !Number.isFinite(amount) || amount <= 0) throw new Error("--budget-usd exige configuração direta e valor positivo.");
    config.direct.budgetUsd = amount;
  }
  if (command === "preflight") return preflight(config);
  if (command === "limits") return directQuotaStatus(config);
  const data = await loadData();
  if (command === "split") return createSplit(data, integer(values["development-count"], 60, 1), values.seed!);
  const ids = await select(data);
  if (command === "run") {
    config.maxCalls = integer(values["max-calls"], config.maxCalls);
    const result = await runExperiment(values.experiment!, data, config, ids, values.subset!, values["dry-run"], values["proposals-from"]);
    if ("pending" in result && result.pending.length) process.exitCode = 2;
    return result;
  }
  if (command === "evaluate") {
    const report = await evaluate(values.experiment!, data, ids, values.subset!, referenceVersion);
    return { ...report, rows: undefined };
  }
  if (command === "calibrate") return calibrate(values.experiment!, data);
  if (command === "export") return exportDelivery(values.experiment!, data, values.confidence!, values.forecast);
  if (command === "compare") {
    if (!values.left || !values.right) throw new Error("Informe --left e --right.");
    const [left, right] = await Promise.all([evaluate(values.left, data, ids, values.subset!, referenceVersion), evaluate(values.right, data, ids, values.subset!, referenceVersion)]);
    const [l, r] = await Promise.all([loadExperiment(values.left, data), loadExperiment(values.right, data)]);
    const leftCompleted = left.rows.filter(row => row.decisao).map(row => row.id).sort();
    const rightCompleted = right.rows.filter(row => row.decisao).map(row => row.id).sort();
    const common = new Set(leftCompleted.filter(id => rightCompleted.includes(id)));
    const key = (name: "left" | "right", id: string) => {
      const decision = (name === "left" ? l : r).records[id]?.decision;
      return JSON.stringify([decision?.decisao, decision?.tema_central_id, decision?.extras_ids]);
    };
    const report = {
      at: now(), referenceVersion, referenceHash: left.referenceHash, subset: values.subset, selected: ids.length, commonCompleted: common.size,
      sameCompletedIds: JSON.stringify(leftCompleted) === JSON.stringify(rightCompleted),
      models: { left: l.manifest.config, right: r.manifest.config },
      left: left.overall, right: right.overall,
      pairedMetrics: { left: metrics(left.rows.filter(row => common.has(row.id)), data.questions.length), right: metrics(right.rows.filter(row => common.has(row.id)), data.questions.length) },
      disagreements: ids.filter(id => common.has(id) && key("left", id) !== key("right", id)),
      paired: [...common].map(id => ({ id, left: left.rows.find(row => row.id === id), right: right.rows.find(row => row.id === id) })),
      caution: "Compare qualidade e cobertura nos mesmos IDs. Se os conjuntos concluídos diferem, as métricas gerais não são uma comparação pareada. Discordância não prova erro da referência.",
    };
    await atomicJson(resolveRoot("output/comparisons", `${values.left}-${values.right}-${values.subset}${referenceVersion === "analise-propria-v1" ? "" : `-${referenceVersion}`}.json`), report);
    return { ...report, paired: undefined };
  }
  throw new Error("Comandos: prepare, preflight, limits, run, split, evaluate, compare, calibrate, export. Consulte README.md.");
}
main().then(result => console.log(JSON.stringify(redact(result), null, 2))).catch(error => {
  console.error(redact({ error: (error as Error).message })); process.exitCode = 1;
});
