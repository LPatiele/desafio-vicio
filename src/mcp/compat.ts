import "dotenv/config";
import { z } from "zod";
import { getConfig } from "../config.js";
import { OpenRouterClient, preflight, type Message, type ToolDefinition } from "../client.js";
import { Logger } from "../logger.js";
import { atomicJson, exists, hash, now, readJson, redact, resolveRoot } from "../utils.js";

// One bounded diagnostic continuation; preserves the original four-request probe.
async function main() {
  const base = resolveRoot("output/integration/lexml-mcp/protocol");
  const file = `${base}/compat-state.json`;
  if (await exists(file)) return readJson(file); // a crash/failed attempt never grants a new call
  const original = await readJson<{ probes: { model: string; status: string; attempts: number; messages: Message[]; nonce: string }[] }>(`${base}/state.json`);
  const probe = original.probes.find(p => p.model === "nvidia/nemotron-3-super-120b-a12b:free");
  if (!probe || probe.status !== "failed" || probe.attempts !== 2 || !probe.messages.some(m => m.role === "tool")) throw new Error("Diagnóstico exige o histórico da falha original de continuação.");
  const config = { ...await getConfig(), maxCalls: 1, maxRetries: 0, maxOutputTokens: 8192 };
  const logger = new Logger(`${base}/compat`);
  const check = await preflight(config);
  await atomicJson(`${base}/compat/preflight.json`, check);
  const caller = new OpenRouterClient(config, logger, check.quota?.remaining ?? null, undefined, check.quota?.limit ?? null);
  const tools: ToolDefinition[] = [{ type: "function", function: { name: "integration_probe", description: "Verificação local sem pesquisa jurídica. Retorna um nonce a reproduzir na resposta final.", parameters: { type: "object", properties: { value: { type: "string", enum: ["check"] } }, required: ["value"], additionalProperties: false } } }];
  const summary = { at: now(), model: probe.model, status: "not_sent", attempts: 0, originalAttempts: probe.attempts, lexmlServerTested: false, finalToolChoice: "auto", error: null as string | null, transcriptHash: hash(JSON.stringify(probe.messages)) };
  try {
    const result = await caller.turn("judge", probe.model, probe.messages, z.object({ probe_result: z.string() }).strict(), ["protocol-compat"], async requestId => { summary.status = "pending"; summary.attempts = 1; await atomicJson(file, summary); await logger.event("compat_attempt", { requestId, model: probe.model }); }, { tools, choice: "auto", final: true });
    if (result.kind !== "final" || JSON.parse(result.content).probe_result !== probe.nonce) throw new Error("Continuação não reproduz o retorno da ferramenta.");
    summary.status = "complete";
  } catch (error) { summary.status = "failed"; summary.error = (error as Error).message; process.exitCode = 2; }
  await atomicJson(file, summary);
  return summary;
}
main().then(result => console.log(JSON.stringify(redact(result), null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
