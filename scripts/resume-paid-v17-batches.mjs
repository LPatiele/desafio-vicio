import { spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile, unlink, copyFile } from "node:fs/promises";
import path from "node:path";

// This wrapper deliberately lives outside the frozen experimental code. Resume
// only the unfinished conditions; preserve b30's first-pass report and attempts.
const root = path.resolve(import.meta.dirname, "..");
const suite = path.join(root, "output/paid-v17/paid-v17-359");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const history = path.join(suite, "continuations", stamp);
await mkdir(history, { recursive: true });
const lockFile = path.join(suite, "resume-chain.lock");
const lock = await open(lockFile, "wx");
try {
  await lock.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  const conditions = [];
  for (const condition of ["b20", "b10"]) {
    const startedAt = new Date().toISOString();
    const previous = path.join(suite, condition, "last-run.json");
    try { await copyFile(previous, path.join(history, `${condition}-before.json`)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    console.log(`Retomando ${condition}; teto compartilhado US$ 30; b30 e b1 não serão executados.`);
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "experiments/paid-v17/cli.ts", "--suite", "paid-v17-359", "--condition", condition, "--budget-usd", "30"], { cwd: root, stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(code ?? `signal:${signal}`));
    });
    if (exitCode !== 0) { conditions.push({ condition, startedAt, exitCode, stopped: "CLI interrompida; confira o log." }); break; }
    const result = JSON.parse(await readFile(previous, "utf8"));
    await copyFile(previous, path.join(history, `${condition}-after.json`));
    conditions.push({ condition, startedAt, ...result });
    if (result.stopped) break;
  }
  const summary = { at: new Date().toISOString(), order: ["b20", "b10"], b30Preserved: true, b1Included: false, conditions, queued: ["b20", "b10"].slice(conditions.length) };
  await writeFile(path.join(history, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  await writeFile(path.join(suite, "continuation-summary.json"), JSON.stringify(summary, null, 2) + "\n");
} finally { await lock.close(); await unlink(lockFile); }
