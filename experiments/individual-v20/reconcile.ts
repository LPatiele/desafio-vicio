import { readFile, writeFile, mkdir, open, unlink } from "node:fs/promises";
import { parseArgs } from "node:util";
import { atomicJson, hash, now, readJson, resolveRoot, exists } from "../../src/utils.js";
import { withInferenceLock } from "../../src/providers/serial.js";

export const POLICY = { url: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing",
  checkedAt: "2026-10-19", excerpt: "You're charged only for requests that return a 200 response code.",
  scope: "Gemini 3.x Vertex AI PayGo, HTTP 429 confirmado em log; não se aplica a falha de rede sem resposta." };

export function confirmed429(ledger: any, logs: { source: string; rows: any[] }[]) {
  const confirmed: { id: string; source: string; responseHash: string; reservedUsd: number }[] = [];
  for (const log of logs) for (const start of log.rows.filter(r => r.phase === "start")) {
    const responses = log.rows.filter(r => r.requestId === start.requestId && r.phase === "response");
    const entry = ledger.entries[start.requestId];
    if (!entry || entry.actualUsd !== null || start.channel !== "vertex" || !/^gemini-3[.-]/.test(start.model) || entry.provider !== "gemini" || entry.model !== start.model || !start.endpoint?.includes("aiplatform.googleapis.com")) continue;
    if (responses.length !== 1 || responses[0].channel !== "vertex" || responses[0].status !== 429 || log.rows.some(r => r.requestId === start.requestId && r.phase === "network_error")) continue;
    const raw = JSON.parse(responses[0].body);
    if (raw.error?.code !== 429 || raw.error?.status !== "RESOURCE_EXHAUSTED") continue;
    if (confirmed.some(c => c.id === start.requestId)) throw new Error("Requisição duplicada entre logs.");
    confirmed.push({ id: start.requestId, source: log.source, responseHash: hash(responses[0].body), reservedUsd: entry.reservedUsd });
  }
  return confirmed;
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: "boolean" } } });
  const root = resolveRoot("output/individual-v20/pro-judge-v20-359"), file = `${root}/spend.json`;
  const lock = await open(`${root}/execution.lock`, "wx");
  try {
    const logs: { source: string; rows: any[] }[] = [];
    for (const suite of ["pro-judge-v20-359-r2", "pro-judge-v20-359-repair-1"]) {
      const source = resolveRoot("output/individual-v20", suite, "requests.jsonl");
      if (await exists(source)) logs.push({ source, rows: (await readFile(source, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) });
    }
    return await withInferenceLock(`${file}.lock`, async () => {
      const original = await readFile(file, "utf8"), ledger = JSON.parse(original), adjustments = confirmed429(ledger, logs);
      if (!values.apply) return { policy: POLICY, eligible: adjustments.length, releasedReservesUsd: adjustments.reduce((n, a) => n + a.reservedUsd, 0) };
      if (!adjustments.length) return { alreadyReconciled: true };
      const directory = `${root}/reconciliations/${now().replace(/[:.]/g, "-")}`;
      await mkdir(directory, { recursive: true }); await writeFile(`${directory}/spend-before.json`, original);
      for (const a of adjustments) { ledger.entries[a.id].actualUsd = 0; ledger.entries[a.id].state = "settled"; }
      await atomicJson(`${directory}/audit.json`, { at: now(), policy: POLICY, beforeHash: hash(original), afterHash: hash(JSON.stringify(ledger, null, 2) + "\n"),
        adjustments, releasedReservesUsd: adjustments.reduce((n, a) => n + a.reservedUsd, 0),
        method: "Custo zero por política publicada para rejeição HTTP 429 comprovada; não é conferência de fatura. Preserva IDs, reservas originais, chamadas e contadores. Falhas de rede sem resposta continuam desconhecidas." });
      await atomicJson(file, ledger);
      return { directory, adjusted: adjustments.length, releasedReservesUsd: adjustments.reduce((n, a) => n + a.reservedUsd, 0) };
    }, 30000);
  } finally { await lock.close(); await unlink(`${root}/execution.lock`); }
}
if (process.argv[1]?.endsWith("/reconcile.ts")) main().then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
