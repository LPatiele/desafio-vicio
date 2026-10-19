import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { StopRun } from "../client.js";

/** Hold the gate through admission, HTTP and accounting. Unlike the short quota
 * transaction lock, this prevents overlapping inference across local processes.
 * An abandoned lock is deliberately not removed automatically. */
export async function withInferenceLock<T>(file: string, action: () => Promise<T>, timeoutMs: number): Promise<T> {
  await mkdir(path.dirname(file), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let handle;
  while (!handle) {
    try { handle = await open(file, "wx"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new StopRun(`Outra inferência mantém a trava ${file}. Confira o processo proprietário antes de remover uma trava abandonada.`);
      await sleep(100);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return await action();
  } finally {
    await handle.close();
    await unlink(file);
  }
}
