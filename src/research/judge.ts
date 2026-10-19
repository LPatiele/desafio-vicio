import type { z } from "zod";
import { RetryableCallError, type Message } from "../client.js";
import type { Dependencies } from "../nodes/especialista.js";
import type { RecordState } from "../types.js";
import { VerdictSchema } from "../types.js";
import { indexThemes } from "../data.js";
import { validateVerdict } from "../validation.js";
import { now, parseBatch, sleep } from "../utils.js";
import { citedSources } from "./evidence.js";

export async function runResearchJudge(deps: Dependencies, records: Record<string, RecordState>, id: string, initial: Message[], schema: z.ZodType) {
  const session = deps.research;
  if (!session || !deps.caller.turn) throw new Error("Pesquisa requer sessão MCP e transporte com tool calling.");
  const record = records[id]!;
  record.research ??= { status: "running", messages: initial, operations: [], sourcesUsed: [] };
  const state = record.research;
  const save = () => deps.save(records);
  if (["unavailable", "exhausted"].includes(state.status)) return { records };
  const themes = indexThemes(deps.data.themes);
  while ((record.attempts?.judge ?? 0) < deps.config.maxAttemptsPerStage) {
    await session.completePending(state, save);
    const searched = session.successfulSearch(state);
    if (!searched && state.operations.some(o => o.name === session.backend.registry.searchName && o.state === "complete" && o.result?.status !== "invalid")) {
      state.status = "unavailable";
      record.errors.push({ stage: "research", message: "Pesquisa obrigatória indisponível; sem parecer ou publicação automática.", at: now() });
      await save(); return { records };
    }
    const remaining = deps.config.maxAttemptsPerStage - (record.attempts?.judge ?? 0);
    const canSearch = !searched && state.operations.length < session.config.maxToolCalls && remaining > 1;
    const needsResolve = searched && state.operations.length < session.config.maxToolCalls && remaining > 1 && session.backend.registry.definitions.some(t => t.function.name === session.backend.registry.resolveName) && state.operations.flatMap(o => o.result?.sources ?? []).some(s => s.urn && !s.url);
    const selected = canSearch ? session.backend.registry.searchName : needsResolve ? session.backend.registry.resolveName : null;
    try {
      const result = await deps.caller.turn("judge", deps.config.judgeModel, state.messages, schema, [id], async requestId => {
        record.attempts ??= {};
        record.attempts.judge = (record.attempts.judge ?? 0) + 1;
        await save();
        await deps.logger.event("stage_attempt", { requestId, id, role: "judge", attempt: record.attempts.judge, limit: deps.config.maxAttemptsPerStage, phase: selected ? "tool_selection" : "final" });
      }, { tools: session.backend.registry.definitions, choice: selected ? { type: "function", function: { name: selected } } : session.config.finalToolChoice, final: !selected });
      if (result.kind === "tools") {
        const calls = result.message.tool_calls;
        if (state.operations.length + calls.length > session.config.maxToolCalls) throw new RetryableCallError("Solicitação excede o orçamento total de ferramentas.");
        if (calls.some(c => state.operations.some(o => o.toolCallId === c.id))) throw new RetryableCallError("Modelo reutilizou ID de ferramenta.");
        state.messages.push(result.message);
        for (const call of calls) {
          const allowed = call.function.name === selected && state.operations.length < session.config.maxToolCalls;
          state.operations.push({ toolCallId: call.id, name: call.function.name, rawArguments: call.function.arguments, attempts: 0, state: allowed ? "pending" : "complete", ...(!allowed ? { result: { status: "invalid" as const, payload: { error: "Ferramenta fora da fase ou orçamento." }, sources: [], retryable: false } } : {}) });
        }
        await save();
        await deps.logger.event("tool_selection", { id, toolCallIds: calls.map(c => c.id) });
        continue;
      }
      if (session.config.requiredSearch && !searched) throw new RetryableCallError("Parecer recebido sem busca obrigatória concluída.");
      const parsed = parseBatch(result.content, VerdictSchema, [id]);
      if (parsed.unexpected.length || parsed.errors[id] || !parsed.valid.length) throw new RetryableCallError(parsed.errors[id] ?? "IDs inesperados no parecer.");
      const verdict = parsed.valid[0]!;
      const errors = validateVerdict(verdict, record.proposal!, themes);
      if (errors.length) throw new RetryableCallError(errors.join("; "));
      try { state.sourcesUsed = citedSources(result.content, state.operations); }
      catch (error) { throw new RetryableCallError((error as Error).message); }
      record.verdict = verdict;
      state.messages.push(result.message);
      state.status = "complete";
      await save();
      await deps.logger.event("validation", { role: "judge", ids: [id], errors: {}, sourcesUsed: state.sourcesUsed });
      return { records };
    } catch (error) {
      if (!(error instanceof RetryableCallError)) throw error;
      record.errors.push({ stage: "judge", message: error.message, at: now() });
      state.messages.push({ role: "user", content: JSON.stringify({ falha_tecnica: error.message, instrucao: "Corrija formato e coerência sem inventar fontes nem mudar tema para satisfazer validação." }) });
      await save();
      if ((record.attempts?.judge ?? 0) < deps.config.maxAttemptsPerStage) await sleep(Math.max(error.retryAfterMs, deps.config.retryBaseDelayMs));
    }
  }
  state.status = "exhausted";
  await save();
  return { records };
}
