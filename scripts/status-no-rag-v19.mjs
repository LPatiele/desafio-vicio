import { readFile } from "node:fs/promises";

const root = "output/no-rag-v19/model-only-v19-359";
const read = async file => JSON.parse(await readFile(file, "utf8"));
const status = await read(`${root}/status.json`);
const records = Object.values(await read(`${root}/records.json`));
const requests = (await readFile(`${root}/requests.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
const starts = requests.filter(r => r.phase === "start");
const ids = new Set(starts.map(r => r.requestId));
const ledger = await read("output/paid-v17/paid-v17-359/spend.json");
const entries = Object.entries(ledger.entries);
const own = entries.filter(([id]) => ids.has(id)).map(([, entry]) => entry);
const charged = entries.reduce((sum, [, entry]) => sum + (entry.actualUsd ?? entry.reservedUsd), 0);
let final = null;
try { final = await read(`${root}/last-run.json`); } catch (error) { if (error.code !== "ENOENT") throw error; }
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), state: final?.stopped ? "stopped" : final ? "finished" : "running",
  completed: status.completed, total: status.total, proposals: status.proposals,
  published: records.filter(r => r.decision?.decisao === "publicar").length,
  reviewed: records.filter(r => r.decision?.decisao === "revisar").length,
  outside: records.filter(r => r.decision?.decisao === "fora").length,
  exhaustedClassifier: status.exhaustedClassifier, exhaustedJudge: status.exhaustedJudge,
  activeBatch: status.currentBatch, calls: starts.length,
  httpErrors: requests.filter(r => r.phase === "response" && r.status >= 400).map(r => ({ at: r.at, status: r.status })),
  networkErrors: requests.filter(r => r.phase === "network_error").length,
  requestsWithTools: starts.filter(r => r.body.tools || r.body.toolConfig).length,
  lastRequest: starts.at(-1) ? { at: starts.at(-1).at, role: starts.at(-1).role } : null,
  ownKnownCostUsd: own.reduce((sum, entry) => sum + (entry.actualUsd ?? 0), 0),
  ownChargedOrReservedUsd: own.reduce((sum, entry) => sum + (entry.actualUsd ?? entry.reservedUsd), 0),
  sharedRemainingUsd: 30 - charged, stopped: final?.stopped ?? null,
}, null, 2));
