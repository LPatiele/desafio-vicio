import { z } from "zod";
import { RetryableCallError, type Message, type AssistantMessage } from "../client.js";
import type { Dependencies } from "../nodes/especialista.js";
import type { RecordState } from "../types.js";
import { VerdictSchema, ProposalSchema } from "../types.js";
import { indexThemes } from "../data.js";
import { validateVerdict, validateProposal } from "../validation.js";
import { now, parseBatch, sleep } from "../utils.js";
import { executeLocalTool, localTools } from "./tools.js";
import { localCitations } from "./store.js";

function assistant(message: AssistantMessage): AssistantMessage {
  return { role: "assistant", content: message.content, ...(message.tool_calls ? { tool_calls: message.tool_calls.map(c => ({ id: c.id, type: c.type, function: { name: c.function.name, arguments: c.function.arguments } })) } : {}), ...(message.reasoning_details ? { reasoning_details: message.reasoning_details } : {}), ...(message.reasoning !== undefined ? { reasoning: message.reasoning } : {}), ...(message.providerState ? { providerState: structuredClone(message.providerState) } : {}) };
}
export async function runLocalAgent(role: "classifier" | "judge", deps: Dependencies, records: Record<string, RecordState>, id: string, initial: Message[], schema: z.ZodType) {
  const service = deps.localKnowledge;
  if (!service || !deps.caller.turn) throw new Error("Juiz com consultas requer base local e transporte de ferramentas.");
  const contextKey = role === "judge" ? "knowledge" : "classifierKnowledge";
  const agentKey = role === "judge" ? "knowledgeAgent" : "classifierKnowledgeAgent";
  const record = records[id]!, question = deps.data.questions.find(q => q.id === id)!;
  const outputName = role === "judge" ? "parecer" : "proposta";
  const contract = z.toJSONSchema(schema, { target: "draft-7" }); delete contract.$schema;
  if (!record[agentKey]) {
    const messages = structuredClone(initial);
    messages[0]!.content += `\nContrato da saída final — ${outputName} (JSON, após consultar a base): ${JSON.stringify(contract)}`;
    record[agentKey] = { version: deps.config.direct ? 2 : 1, snapshotHash: service.store.manifestHash, status: "running", messages, rounds: 0, operations: [] };
    await deps.save(records);
  }
  const state = record[agentKey], options = deps.config.knowledge!;
  const save = () => deps.save(records);
  if (state.status !== "running") return { records };
  const themes = indexThemes(deps.data.themes);
  // Results and messages are committed together. A crash before this save simply
  // replays a deterministic, read-only SQLite operation, with no model call.
  const completePending = async () => {
    for (const operation of state.operations.filter(o => o.state === "pending")) {
      const used = state.operations.reduce((n, o) => n + (o.result?.length ?? 0), 0);
      const result = executeLocalTool(service, question, role === "judge" ? record.proposal! : null, record[contextKey]!, operation, used, role);
      record[contextKey] = result.context;
      operation.result = result.result; operation.state = "complete";
      state.messages.push({ role: "tool", tool_call_id: operation.toolCallId, content: result.result });
      await save();
      await deps.logger.event("local_tool_result", { id, role, toolCallId: operation.toolCallId, name: operation.name, arguments: operation.rawArguments, resultCharacters: result.result.length, deliveredSources: record[contextKey].chunks.map(c => c.id) });
    }
  };
  await completePending();
  while ((record.attempts?.[role] ?? 0) < deps.config.maxAttemptsPerStage) {
    const remaining = deps.config.maxAttemptsPerStage - (record.attempts?.[role] ?? 0);
    const final = state.rounds >= (options.maxToolRounds ?? 2) || state.operations.length >= (options.maxToolCalls ?? 4) || remaining <= 1;
    let sent = false;
    try {
      const result = await deps.caller.turn(role, role === "judge" ? deps.config.judgeModel : deps.config.classifierModel, state.messages, schema, [id], async requestId => {
        if (sent) throw new Error("Retentativa de transporte sobreposta ao limite por etapa.");
        sent = true; record.attempts ??= {}; record.attempts[role] = (record.attempts[role] ?? 0) + 1;
        await save();
        await deps.logger.event("stage_attempt", { requestId, id, role, attempt: record.attempts[role], limit: deps.config.maxAttemptsPerStage, phase: final ? "final" : "local_tools" });
      }, { tools: localTools, choice: state.rounds === 0 && !final ? { type: "function", function: { name: "buscar_referencias" } } : "auto", final });
      if (!sent) throw new Error("Transporte não reservou a tentativa antes do envio.");
      if (result.kind === "tools") {
        const calls = result.message.tool_calls;
        if (final || calls.length > 2 || state.operations.length + calls.length > (options.maxToolCalls ?? 4)) throw new RetryableCallError("Solicitação excede o limite de ferramentas/rodadas. Finalize o parecer.");
        if (calls.some(c => state.operations.some(o => o.toolCallId === c.id)) || new Set(calls.map(c => c.id)).size !== calls.length || calls.some(c => c.function.arguments.length > 4000)) throw new RetryableCallError("IDs/argumentos de ferramentas inválidos.");
        state.rounds++;
        state.messages.push(assistant(result.message));
        for (const call of calls) state.operations.push({ toolCallId: call.id, name: call.function.name, rawArguments: call.function.arguments, state: "pending" });
        await save();
        await completePending();
        continue;
      }
      if (!state.operations.some(o => o.state === "complete" && ["buscar_referencias", "consultar_dispositivo"].includes(o.name) && !JSON.parse(o.result!).erro)) throw new RetryableCallError("Parecer sem consulta válida à base local.");
      const parsed = role === "judge" ? parseBatch(result.content, VerdictSchema, [id]) : parseBatch(result.content, ProposalSchema, [id]);
      if (parsed.unexpected.length || parsed.errors[id] || !parsed.valid.length) throw new RetryableCallError(parsed.errors[id] ?? "IDs inesperados no parecer.");
      let citations: string[] = [];
      if (role === "judge") {
        const verdict = VerdictSchema.parse(parsed.valid[0]);
        const failures = validateVerdict(verdict, record.proposal!, themes);
        try { citations = localCitations(verdict, record[contextKey]!); } catch (error) { failures.push((error as Error).message); }
        if (failures.length) throw new RetryableCallError(failures.join("; "));
        record.verdict = verdict; record[contextKey]!.sourcesUsed = citations;
      } else {
        const proposal = ProposalSchema.parse(parsed.valid[0]);
        const failures = validateProposal(proposal, question, themes);
        // Judge retrieval is independent: technical source IDs stay in the
        // classifier transcript; its proposal uses human-readable law/article.
        if (/S-[a-f0-9]{12}\b/.test(JSON.stringify(proposal))) failures.push("Na proposta final cite diploma/artigo, sem IDs S-. Os documentos ficam no histórico de consultas do classificador.");
        if (failures.length) throw new RetryableCallError(failures.join("; "));
        record.proposal = proposal;
      }
      state.messages.push(assistant(result.message)); state.status = "complete";
      await save();
      await deps.logger.event(`local_${role}_complete`, { id, rounds: state.rounds, operations: state.operations.length, citations });
      return { records };
    } catch (error) {
      if (!(error instanceof RetryableCallError)) throw error;
      if (!sent) throw new Error("Transporte não reservou a tentativa interrompida.");
      record.errors.push({ stage: role, message: error.message, at: now() });
      state.messages.push({ role: "user", content: JSON.stringify({ falha_tecnica: error.message.slice(0, 1800), instrucao: "Corrija formato ou coerência usando a questão e as evidências disponíveis. Respeite os limites de consultas; não troque o tema apenas para passar na validação." }) });
      await save();
      if ((record.attempts?.[role] ?? 0) < deps.config.maxAttemptsPerStage) await sleep(Math.max(error.retryAfterMs, Math.min(30000, deps.config.retryBaseDelayMs * 2 ** Math.max(0, (record.attempts?.[role] ?? 1) - 1))));
    }
  }
  state.status = "exhausted"; await save();
  await deps.logger.event("stage_exhausted", { id, role, attempts: record.attempts?.[role], limit: deps.config.maxAttemptsPerStage });
  return { records };
}

export const runLocalJudge = (deps: Dependencies, records: Record<string, RecordState>, id: string, initial: Message[], schema: z.ZodType) => runLocalAgent("judge", deps, records, id, initial, schema);
export const runLocalClassifier = (deps: Dependencies, records: Record<string, RecordState>, id: string, initial: Message[], schema: z.ZodType) => runLocalAgent("classifier", deps, records, id, initial, schema);
