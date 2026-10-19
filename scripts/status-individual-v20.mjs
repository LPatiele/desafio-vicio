import { readFile } from "node:fs/promises";
const source = "output/individual-v20/pro-judge-v20-359-r2";
const read = async file => JSON.parse(await readFile(file, "utf8"));
const status = await read(`${source}/status.json`);
const manifest = await read(`${source}/manifest.json`);
const ledger = await read(`${manifest.budgetDirectory}/spend.json`);
const authorization = await read(`${manifest.budgetDirectory}/authorization.json`);
const records = Object.values((await read(`${source}/checkpoint.json`)).records);
const decisions = records.reduce((counts, r) => { if (r.decision) counts[r.decision.decisao] = (counts[r.decision.decisao] ?? 0) + 1; return counts; }, {});
const requests = (await readFile(`${source}/requests.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const starts = requests.filter(r => r.phase === "start"), ids = new Set(starts.map(r => r.requestId));
const own = Object.entries(ledger.entries).filter(([id]) => ids.has(id)).map(([, e]) => e);
const entries = Object.values(ledger.entries);
const charged = entries.reduce((s, e) => s + (e.actualUsd ?? e.reservedUsd), 0);
const usage = own.filter(e => e.usage).map(e => e.usage);
let final = null;
try { final = await read(`${source}/last-run.json`); } catch (e) { if (e.code !== "ENOENT") throw e; }
let running = false;
try { await read(`${source}/run.lock`); running = true; } catch (e) { if (e.code !== "ENOENT") throw e; }
console.log(JSON.stringify({ at: new Date().toISOString(), state: running ? "running" : final?.stopped ? "stopped" : final ? "finished" : "running",
  completed: status.completed, proposals: status.proposals, exhausted: status.exhaustedClassifier + status.exhaustedJudge,
  decisions,
  active: status.currentBatch?.[0] ?? null, lastRole: starts.at(-1)?.role ?? null, calls: starts.length,
  knownCostUsd: own.reduce((s, e) => s + (e.actualUsd ?? 0), 0), totalChargedOrReservedUsd: charged, authorizedBudgetUsd: authorization.budgetUsd, budgetRemainingUsd: authorization.budgetUsd - charged,
  totalUnresolved: entries.filter(e => e.actualUsd === null).length,
  cachedFraction: usage.length ? usage.reduce((s, u) => s + u.cachedInputTokens, 0) / usage.reduce((s, u) => s + u.inputTokens, 0) : null,
  httpErrors: requests.filter(r => r.phase === "response" && r.status >= 400).map(r => r.status),
  networkErrors: requests.filter(r => r.phase === "network_error").length, stopped: running ? null : final?.stopped ?? null,
}));
