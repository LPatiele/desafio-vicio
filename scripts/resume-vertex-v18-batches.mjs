import { spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile, rename, unlink, access } from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "..");
const root = path.join(workspace, "output/vertex-v18/vertex-v18-359");
const parent = path.join(workspace, "output/paid-v17/paid-v17-359");
const order = ["b20", "b10"];
const read = async file => JSON.parse(await readFile(file, "utf8"));
const exists = async file => { try { await access(file); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; } };
const atomic = async (file, value) => { const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2) + "\n"); await rename(temp, file); };
const now = () => new Date().toISOString();

const authorization = await read(path.join(parent, "authorization.json"));
if (authorization.totalBudgetUsd !== 30 || order.some(c => !authorization.allowedConditions.includes(c))) throw new Error("A autorização compartilhada não permite essa sequência com teto de US$ 30.");
for (const file of [path.join(parent, "sequence.lock"), path.join(parent, "resume-chain.lock")]) if (await exists(file)) throw new Error(`Uma execução anterior tem uma trava ativa: ${file}`);
await mkdir(root, { recursive: true });
const lockFile = path.join(root, "resume-chain.lock"), lock = await open(lockFile, "wx");
const log = await open(path.join(root, "execution.log"), "a");
let child, interrupted = false;
const forward = signal => { interrupted = true; child?.kill(signal); };
const onInt = () => forward("SIGINT"), onTerm = () => forward("SIGTERM");
process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
const status = { at: now(), startedAt: now(), channel: "vertex", project: "gen-lang-client-0789985100", order, questionsPerCondition: 359, concurrency: 1, sharedBudgetSuite: "paid-v17-359", sharedBudgetLimitUsd: 30, b30Preserved: true, b1Included: false, importsPreviousCheckpoints: false, previousResultsPreserved: true, conditions: [], active: null, queued: [...order], stopped: null };
const save = async () => { status.at = now(); await atomic(path.join(root, "sequence-status.json"), status); };
try {
  await lock.writeFile(JSON.stringify({ pid: process.pid, at: now() }));
  await save();
  for (const condition of order) {
    if (interrupted) { status.stopped = "Interrupção recebida."; break; }
    status.active = condition; status.queued = order.slice(order.indexOf(condition) + 1);
    await save();
    const startedAt = now();
    console.log(`[${startedAt}] Iniciando/retomando ${condition}: 359 questões, Vertex ADC, teto compartilhado US$ 30.`);
    const exit = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, ["--import", "tsx", "experiments/vertex-v18/cli.ts", "--run", "--suite", "vertex-v18-359", "--condition", condition, "--limit", "359", "--budget-usd", "30", "--shared-budget-suite", "paid-v17-359"], { cwd: workspace, stdio: ["ignore", log.fd, log.fd] });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child = undefined;
    let result = null;
    const lastRun = path.join(root, condition, "last-run.json");
    if (await exists(lastRun)) result = await read(lastRun);
    status.conditions.push({ condition, startedAt, finishedAt: now(), ...exit, result });
    console.log(`[${now()}] ${condition}: ${result?.completed ?? 0} decisões; saída ${exit.code ?? exit.signal}.`);
    if (interrupted || exit.code !== 0 || result?.stopped) {
      status.stopped = result?.stopped ?? `CLI interrompida: ${exit.signal ?? exit.code}; consulte execution.log.`;
      break;
    }
    await save();
  }
  status.active = null;
  status.finishedAt = now();
  await save();
  if (status.stopped) process.exitCode = 2;
} catch (error) {
  status.active = null; status.stopped = error.message; status.finishedAt = now();
  await save(); throw error;
} finally {
  process.off("SIGINT", onInt); process.off("SIGTERM", onTerm);
  await log.close(); await lock.close(); await unlink(lockFile);
}
