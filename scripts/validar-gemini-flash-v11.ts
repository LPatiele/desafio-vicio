import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadData } from "../src/data.js";
import { loadExperiment, loadReference } from "../src/evaluation.js";
import { atomicJson, hash, now, resolveRoot } from "../src/utils.js";

const directory = resolveRoot("output/migrations/gemini-flash-v11");
const data = await loadData(), experiment = await loadExperiment("gemini-flash-v11-piloto", data), reference = await loadReference(data, "analise-propria-v2");
const baseline = await loadExperiment("local-penal50-v9-classifier-tools", data);
const before: Record<string, string> = JSON.parse(await readFile(`${directory}/before/hashes.json`, "utf8"));
const protectedSources = new Set(["src/validation.ts", "src/retrieval/decision.ts", "src/data.ts", "src/graph.ts", "src/knowledge/store.ts", "src/knowledge/database.ts"]);
const protectedFiles = Object.keys(before).filter(file => file.startsWith("src/agents/") || file.startsWith("config/") || protectedSources.has(file));
const changedProtected = [];
for (const file of protectedFiles) if (hash(await readFile(resolveRoot(file), "utf8")) !== before[file]) changedProtected.push(file);
const visit = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? visit(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
const files = [...await visit(resolveRoot("src")), resolveRoot("package-lock.json")].sort();
const codeHash = hash((await Promise.all(files.map(async file => `${path.relative(resolveRoot(), file)}:${hash(await readFile(file, "utf8"))}`))).join("\n"));
const records = Object.values(experiment.records);
const requests = (await readFile(`${experiment.directory}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const events = (await readFile(`${experiment.directory}/events.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const starts = requests.filter(row => row.phase === "start"), responses = requests.filter(row => row.phase === "response");
const spend = JSON.parse(await readFile(`${experiment.directory}/spend.json`, "utf8"));
const entries = Object.values(spend.entries) as { actualUsd: number | null; reservedUsd: number }[];
const tests = await readFile(`${directory}/tests.log`, "utf8"), typecheck = await readFile(`${directory}/typecheck.log`, "utf8");
const checks = {
  completedTen: records.length === 10 && records.every(record => record.proposal && record.verdict && record.decision),
  protectedFilesUnchanged: changedProtected.length === 0,
  frozenCode: codeHash === experiment.manifest.codeHash,
  samePromptsAsV9: JSON.stringify(experiment.manifest.promptHashes) === JSON.stringify(baseline.manifest.promptHashes),
  sameDatabaseAsV9: experiment.manifest.knowledgeIdentity?.databaseHash === baseline.manifest.knowledgeIdentity?.databaseHash,
  referenceUnchanged: reference.hash === "7b69291c6a26c387a6f5606ee7b7032f2c383b8073afdab0e487ea6cac0951e8",
  withinAttemptLimits: records.every(record => Object.values(record.attempts ?? {}).every(value => value <= 5)),
  withinToolLimits: records.every(record => (record.classifierKnowledgeAgent?.operations.length ?? 0) <= 4 && (record.classifierKnowledgeAgent?.rounds ?? 0) <= 2),
  budgetSettled: entries.every(entry => entry.actualUsd !== null),
  withinBudget: entries.reduce((sum, entry) => sum + (entry.actualUsd ?? entry.reservedUsd), 0) <= experiment.manifest.config.direct!.budgetUsd,
  allCallsAccounted: starts.length === responses.length && starts.length === entries.length && starts.length === records.reduce((sum, record) => sum + (record.attempts?.classifier ?? 0) + (record.attempts?.judge ?? 0), 0),
  allHttp200: responses.every(response => response.status === 200),
  typecheckPassed: !typecheck.trim(),
  testsPassed: Number(tests.match(/fail (\d+)/)?.[1]) === 0,
};
const report = { at: now(), checks, protectedFiles: protectedFiles.length, changedProtected, codeHash, testsPassed: Number(tests.match(/pass (\d+)/)?.[1]), calls: { total: starts.length, classifier: starts.filter(start => start.role === "classifier").length, judge: starts.filter(start => start.role === "judge").length }, localOperations: events.filter(event => event.type === "local_tool_result").length, repairedErrors: records.flatMap(record => record.errors.map(error => ({ id: record.id, ...error }))), returnedModels: [...new Set(events.filter(event => event.type === "usage").map(event => event.data.returnedModel))], costAtPaidListPricesUsd: entries.reduce((sum, entry) => sum + (entry.actualUsd ?? 0), 0) };
await atomicJson(`${directory}/validacao.json`, report);
if (Object.values(checks).some(value => !value)) throw new Error("Validação falhou; consulte validacao.json.");
console.log(JSON.stringify(report, null, 2));
