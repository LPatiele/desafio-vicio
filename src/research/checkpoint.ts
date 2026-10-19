import { z } from "zod";
import type { Config, RecordState } from "../types.js";
import { ProviderStateSchema } from "../knowledge/agent-types.js";

const Result = z.object({ status: z.enum(["ok", "empty", "challenge", "error", "invalid", "oversized"]), payload: z.unknown(), sources: z.array(z.object({ id: z.string().regex(/^S-[a-f0-9]{12}$/), title: z.string(), url: z.string().nullable(), urn: z.string().nullable(), kind: z.literal("metadata_only"), record: z.unknown() })), retryable: z.boolean() });
const State = z.object({
  status: z.enum(["running", "complete", "unavailable", "exhausted"]),
  messages: z.array(z.union([
    z.object({ role: z.enum(["system", "user"]), content: z.string() }),
    z.object({ role: z.literal("tool"), content: z.string(), tool_call_id: z.string() }),
    z.object({ role: z.literal("assistant"), content: z.string().nullable(), reasoning_details: z.array(z.unknown()).optional(), reasoning: z.string().nullable().optional(), providerState: ProviderStateSchema.optional(), tool_calls: z.array(z.object({ id: z.string(), type: z.literal("function"), function: z.object({ name: z.string(), arguments: z.string() }) })).optional() }),
  ])),
  operations: z.array(z.object({ toolCallId: z.string(), name: z.string(), rawArguments: z.string().max(4000), args: z.record(z.string(), z.unknown()).optional(), attempts: z.number().int().nonnegative(), state: z.enum(["pending", "complete"]), result: Result.optional() })),
  sourcesUsed: z.array(z.string()),
});
export function validateResearchCheckpoint(record: RecordState, config: Config) {
  if (!record.research) {
    if (config.research?.enabled && record.verdict) throw new Error(`Parecer sem pesquisa: ${record.id}`);
    return;
  }
  if (!config.research?.enabled) throw new Error("Pesquisa salva em condição de controle.");
  const state = State.parse(record.research);
  if (state.operations.length > config.research.maxToolCalls || new Set(state.operations.map(o => o.toolCallId)).size !== state.operations.length || state.operations.some(o => o.attempts > config.research!.maxToolAttempts || (o.state === "complete" && !o.result))) throw new Error("Checkpoint excede limites ou contém operação inconsistente.");
  const calls = state.messages.flatMap(m => m.role === "assistant" ? m.tool_calls ?? [] : []);
  const replies = state.messages.filter(m => m.role === "tool");
  if (new Set(calls.map(c => c.id)).size !== calls.length || new Set(replies.map(r => r.tool_call_id)).size !== replies.length || calls.length !== state.operations.length || state.operations.some(o => !calls.some(c => c.id === o.toolCallId && c.function.name === o.name && c.function.arguments === o.rawArguments)) || replies.some(r => !state.operations.some(o => o.toolCallId === r.tool_call_id && o.state === "complete"))) throw new Error("Histórico MCP difere das operações salvas.");
  if (calls.length > (record.attempts?.judge ?? 0)) throw new Error("Histórico sem contabilização de inferências.");
  if (record.verdict && (state.status !== "complete" || (config.research.requiredSearch && !state.operations.some(o => ["lexml_search", "pesquisar_lexml"].includes(o.name) && ["ok", "empty"].includes(o.result?.status ?? ""))))) throw new Error("Parecer sem pesquisa obrigatória concluída.");
}
