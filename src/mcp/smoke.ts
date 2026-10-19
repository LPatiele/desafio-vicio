import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getConfig } from "../config.js";
import { OpenRouterClient, preflight, type Message, type ToolDefinition } from "../client.js";
import { Logger } from "../logger.js";
import { atomicJson, exists, now, readJson, redact, resolveRoot } from "../utils.js";

// Tests the provider protocol only. This function is local, not the LexML server.
async function main() {
  const dir = resolveRoot("output/integration/lexml-mcp/protocol");
  const file = `${dir}/state.json`;
  const config = { ...await getConfig(), maxCalls: 4, maxRetries: 0, maxOutputTokens: 8192 };
  type Probe = { model: string; attempts: number; status: "pending" | "complete" | "failed"; nonce: string; messages: Message[]; error?: string };
  const state: { startedAt: string; probes: Probe[] } = await exists(file) ? await readJson(file) : { startedAt: now(), probes: [config.classifierModel, config.judgeModel].map(model => ({ model, attempts: 0, status: "pending" as const, nonce: randomUUID(), messages: [{ role: "system" as const, content: "Teste de protocolo. Chame integration_probe com value=check. Depois devolva JSON com probe_result igual ao nonce recebido da ferramenta." }, { role: "user" as const, content: "Execute a verificação da ferramenta e devolva o nonce retornado." }] })) };
  const logger = new Logger(dir);
  const check = await preflight(config);
  await atomicJson(`${dir}/preflight.json`, check);
  const caller = new OpenRouterClient(config, logger, check.quota?.remaining ?? null, undefined, check.quota?.limit ?? null);
  const tools: ToolDefinition[] = [{ type: "function", function: { name: "integration_probe", description: "Verificação local sem pesquisa jurídica. Retorna um nonce a reproduzir na resposta final.", parameters: { type: "object", properties: { value: { type: "string", enum: ["check"] } }, required: ["value"], additionalProperties: false } } }];
  const schema = z.object({ probe_result: z.string() }).strict();
  for (const probe of state.probes) {
    if (probe.status !== "pending") continue;
    const model = check.models.find(m => m.id === probe.model);
    try {
      if (["tools", "tool_choice"].some(p => !model?.supported_parameters?.includes(p))) throw new Error("Catálogo não confirma ferramentas.");
      while (probe.attempts < 2 && probe.status === "pending") {
        const hasTool = probe.messages.some(m => m.role === "tool");
        const response = await caller.turn("judge", probe.model, probe.messages, schema, ["protocol-probe"], async requestId => { probe.attempts++; await atomicJson(file, state); await logger.event("probe_attempt", { requestId, model: probe.model, attempt: probe.attempts }); }, { tools, choice: hasTool ? "auto" : { type: "function", function: { name: "integration_probe" } }, final: hasTool });
        if (!hasTool) {
          if (response.kind !== "tools" || response.message.tool_calls.length !== 1) throw new Error("Esperava exatamente uma solicitação de ferramenta.");
          const call = response.message.tool_calls[0]!;
          if (call.function.name !== "integration_probe" || JSON.stringify(JSON.parse(call.function.arguments)) !== '{"value":"check"}') throw new Error("Nome ou argumentos inesperados.");
          probe.messages.push(response.message, { role: "tool", tool_call_id: call.id, content: JSON.stringify({ nonce: probe.nonce }) });
        } else {
          if (response.kind !== "final" || schema.parse(JSON.parse(response.content)).probe_result !== probe.nonce) throw new Error("Resposta final não reproduz o retorno da ferramenta.");
          probe.messages.push(response.message); probe.status = "complete";
        }
        await atomicJson(file, state);
      }
      if (probe.status !== "complete") throw new Error("Duas requisições esgotadas; não há novas tentativas automáticas.");
    } catch (error) { probe.status = "failed"; probe.error = (error as Error).message; await atomicJson(file, state); }
  }
  const summary = { at: now(), kind: "local_function_protocol_only", lexmlServerTested: false, callsThisInvocation: caller.calls, totalPersistedAttempts: state.probes.reduce((n, p) => n + p.attempts, 0), probes: state.probes.map(({ model, attempts, status, error }) => ({ model, attempts, status, error })) };
  await atomicJson(`${dir}/summary.json`, summary);
  if (state.probes.some(p => p.status !== "complete")) process.exitCode = 2;
  return summary;
}
main().then(result => console.log(JSON.stringify(redact(result), null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
