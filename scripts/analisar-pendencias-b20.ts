import { readFile, mkdir, writeFile } from "node:fs/promises";
import { loadData } from "../src/data.js";
import { parseModelJson, csvCell, hash } from "../src/utils.js";

const directory = "output/vertex-v18/vertex-v18-359/b20";
const destination = "output/comparisons/vertex-v18-b20-pendencias";
const checkpointText = await readFile(`${directory}/checkpoint.json`, "utf8");
const checkpoint = JSON.parse(checkpointText);
const sessions = Object.entries(checkpoint.sessions).filter(([key]) => key.endsWith("-classifier")) as [string, any][];
const requests = (await readFile(`${directory}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const starts = requests.filter(r => r.phase === "start");
const data = await loadData();
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const validSearch = (op: any) => op.result && ["buscar_referencias", "consultar_dispositivo"].includes(op.name) && !JSON.parse(op.result).erro;

const rows = Object.values(checkpoint.records).filter((r: any) => !r.decision).map((r: any) => {
  const [sessionKey, session] = sessions.find(([, s]) => s.ids.includes(r.id))!;
  const operations = session.operations.filter((op: any) => op.questionId === r.id);
  return { id: r.id, sessionKey, attempts: r.attempts.classifier, judgeAttempts: r.attempts.judge ?? 0,
    toolRoundsInBatch: session.rounds, operations: operations.length, validSearches: operations.filter(validSearch).length,
    primaryCause: operations.some(validSearch) ? "evidencia_invalida_apos_consulta" : "nenhuma_consulta_executada",
    earlierMissingSearch: r.errors.some((e: any) => e.message.includes("sem consulta válida")),
    earlierEvidenceFailure: r.errors.some((e: any) => e.message.includes("Evidência não localizada")),
    lastError: r.errors.at(-1)?.message, errors: r.errors,
  };
});

const batches = sessions.map(([key, s]) => ({ key, firstId: s.ids[0], lastId: s.ids.at(-1), questions: s.ids.length, rounds: s.rounds,
  callsPerToolRound: s.messages.filter((m: any) => m.tool_calls?.length).map((m: any) => m.tool_calls.length),
  operations: s.operations.length, queriedIds: new Set(s.operations.map((op: any) => op.questionId)).size,
  completed: s.ids.filter((id: string) => checkpoint.records[id].decision).length,
  noQuery: rows.filter(r => r.sessionKey === key && !r.validSearches).length,
  failedEvidenceAfterQuery: rows.filter(r => r.sessionKey === key && r.validSearches).length,
}));

// Read final attempted proposals for the five queried but rejected questions.
const evidenceExamples = rows.filter(r => r.validSearches).map(r => {
  const session = checkpoint.sessions[r.sessionKey];
  let proposal: any;
  for (const message of session.messages.filter((m: any) => m.role === "assistant" && m.content)) {
    try { const parsed = parseModelJson(message.content) as any; const found = parsed.resultados?.find((p: any) => p.id === r.id); if (found) proposal = found; } catch { /* Invalid earlier JSON is already logged in records. */ }
  }
  const question = data.questions.find(q => q.id === r.id)!;
  const fields: Record<string, string> = { enunciado: question.enunciado, comando: question.comando, ...Object.fromEntries(Object.entries(question.alternativas).map(([key, text]) => [`alternativa:${key}`, text])) };
  return { id: r.id, question: { enunciado: question.enunciado, comando: question.comando },
    rejectedEvidence: (proposal?.evidencias ?? []).filter((e: any) => !fields[e.campo] || !normalized(fields[e.campo]!).includes(normalized(e.trecho))).map((e: any) => ({ ...e,
      foundInOtherFields: Object.entries(fields).filter(([key, text]) => key !== e.campo && normalized(text).includes(normalized(e.trecho))).map(([key]) => key),
    })),
  };
});

const exampleBatch = checkpoint.sessions["40-classifier"];
const timeline = requests.filter(r => r.phase === "start" && r.role === "classifier" && r.ids.some((id: string) => exampleBatch.ids.includes(id))).map(request => {
  const response = requests.find(r => r.phase === "response" && r.requestId === request.requestId);
  const raw = response ? JSON.parse(response.body) : null;
  const parts = raw?.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
  return { at: request.at, requestId: request.requestId, activeIds: request.ids,
    toolsAvailable: !!request.body.tools, status: response?.status,
    type: calls.length ? "tool_calls" : "classification_json",
    queriedIds: calls.map((c: any) => c.args?.questao_id),
  };
});

const summary = {
  at: new Date().toISOString(), source: directory, fingerprint: checkpoint.fingerprint, checkpointHash: hash(checkpointText),
  total: Object.keys(checkpoint.records).length, completed: Object.values(checkpoint.records).filter((r: any) => r.decision).length,
  pending: rows.length, noQuery: rows.filter(r => !r.operations).length,
  queriedButInvalidEvidence: rows.filter(r => r.validSearches).length,
  allPendingExhaustedFiveClassifierAttempts: rows.every(r => r.attempts === 5),
  pendingWithJudgeAttempt: rows.filter(r => r.judgeAttempts).length,
  historicalErrorCounts: { missingQuery: rows.filter(r => r.earlierMissingSearch).length, evidenceNotFound: rows.filter(r => r.earlierEvidenceFailure).length },
  httpCalls: starts.length, classifierCalls: starts.filter(r => r.role === "classifier").length, judgeCalls: starts.filter(r => r.role === "judge").length,
  httpErrors: requests.filter(r => r.phase === "response" && r.status >= 400).length,
  networkErrors: requests.filter(r => r.phase === "network_error").length,
  toolResults: sessions.flatMap(([, s]) => s.operations).reduce((counts: Record<string, number>, op: any) => { const status = JSON.parse(op.result).status; counts[status] = (counts[status] ?? 0) + 1; return counts; }, {}),
  rows, batches, timelineExampleQ0041toQ0060: timeline, evidenceExamples,
};
await mkdir(destination, { recursive: true });
await writeFile(`${destination}/analysis.json`, JSON.stringify(summary, null, 2) + "\n");
const columns = ["id", "primaryCause", "attempts", "judgeAttempts", "toolRoundsInBatch", "operations", "validSearches", "lastError"] as const;
await writeFile(`${destination}/items.csv`, [columns.join(","), ...rows.map(row => columns.map(key => csvCell(row[key])).join(","))].join("\n") + "\n");
console.log(JSON.stringify({ ...summary, rows: undefined, batches: undefined, timelineExampleQ0041toQ0060: timeline, evidenceExamples: evidenceExamples.map(e => ({ id: e.id, rejectedEvidence: e.rejectedEvidence })) }, null, 2));
