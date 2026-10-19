import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { exists, readJson, resolveRoot } from "../src/utils.js";
import { finalize } from "./finalize.js";

export type PipelineOptions = { suite: string; name: string; limit: number; dryRun: boolean };
type Dependencies = {
  completed: () => Promise<boolean>;
  execute: () => Promise<number>;
  deliver: () => Promise<unknown>;
};
/** One entry point for inference, evaluation and CSV, keeping the frozen v19 executor intact. */
export async function runPipeline(options: PipelineOptions, dependencies: Dependencies) {
  const reused = !options.dryRun && options.limit === 359 && await dependencies.completed();
  const exitCode = reused ? 0 : await dependencies.execute();
  if (exitCode !== 0) return { exitCode, delivery: null, reason: "Execução incompleta ou interrompida; CSV integral não gerado." };
  if (options.dryRun || options.limit !== 359) return { exitCode: 0, delivery: null, reason: "Planejamento ou recorte parcial; CSV integral não gerado." };
  if (!await dependencies.completed()) throw new Error("Execução terminou sem concluir as 359 questões. CSV não gerado.");
  return { exitCode: 0, reusedCompletedExperiment: reused, delivery: await dependencies.deliver() };
}

async function completed(suite: string) {
  const directory = resolveRoot("output/no-rag-v19", suite);
  if (await exists(`${directory}/run.lock`) || !await exists(`${directory}/checkpoint.json`)) return false;
  const cp = await readJson<{ records: Record<string, { decision?: unknown }> }>(`${directory}/checkpoint.json`);
  return Object.keys(cp.records).length === 359 && Object.values(cp.records).every(r => !!r.decision);
}
function execute(args: string[]) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "experiments/no-rag-v19/cli.ts", ...args], { cwd: resolveRoot(), stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    const cleanup = () => { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); };
    child.once("error", error => { cleanup(); reject(error); });
    child.once("exit", (code, signal) => { cleanup(); resolve(code ?? (signal ? 2 : 1)); });
  });
}
async function main() {
  const { values } = parseArgs({ options: {
    suite: { type: "string", default: "model-only-v19-359" }, name: { type: "string" },
    limit: { type: "string", default: "359" }, run: { type: "boolean" }, "dry-run": { type: "boolean" },
  } });
  if (Boolean(values.run) === Boolean(values["dry-run"])) throw new Error("Escolha --run ou --dry-run.");
  const options: PipelineOptions = { suite: values.suite!, name: values.name ?? values.suite!, limit: Number(values.limit), dryRun: !!values["dry-run"] };
  if (![options.suite, options.name].every(s => /^[a-z0-9-]{1,60}$/.test(s)) || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 359) throw new Error("Nome ou limite inválido.");
  const result = await runPipeline(options, {
    completed: () => completed(options.suite),
    execute: () => execute(["--suite", options.suite, "--limit", String(options.limit), options.dryRun ? "--dry-run" : "--run"]),
    deliver: () => finalize(options.suite, options.name),
  });
  process.exitCode = result.exitCode;
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(JSON.stringify({ error: (error as Error).message })); process.exitCode = 1;
});
