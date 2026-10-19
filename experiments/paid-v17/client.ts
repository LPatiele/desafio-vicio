import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "../../src/types.js";
import type { Message, TurnOptions, TurnResult } from "../../src/client.js";
import { RetryableCallError, StopRun } from "../../src/client.js";
import { geminiBody, decodeTurn, normalizeUsage, permanentQuotaFailure } from "../../src/providers/direct.js";
import { SpendBudget } from "../../src/providers/budget.js";
import { withInferenceLock } from "../../src/providers/serial.js";
import { atomicJson, exists, readJson, sleep } from "../../src/utils.js";
import { retryHintMs } from "../../src/rate-limit.js";
import { Logger } from "../../src/logger.js";

export class SuiteBudget {
  constructor(readonly file: string, readonly limit: number) {}
  async transaction<T>(fn: (budget: SpendBudget) => Promise<T>) {
    return withInferenceLock(`${this.file}.lock`, async () => fn(await SpendBudget.open(this.file, this.limit, 14360)), 30000);
  }
  summary() { return this.transaction(async budget => budget.summary()); }
}

export function batchWireBody(body: Record<string, any>, size: number) {
  const wire = structuredClone(body);
  // Google's constrained decoder rejects the complex proposal schema when
  // bounded to 30 items. Keep the complete contract in the prompt and validate
  // cardinality/IDs locally; do not weaken individual result schemas.
  if (size > 1 && wire.generationConfig?.responseJsonSchema?.properties?.resultados?.type === "array") delete wire.generationConfig.responseJsonSchema.properties.resultados.maxItems;
  return wire;
}

export function decodeBatchTurn(model: string, raw: any, requestId: string, ids: string[], options?: TurnOptions): TurnResult {
  const candidate = raw.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || !parts.some((p: any) => p?.functionCall)) return decodeTurn("gemini", model, raw, requestId, options);
  if (raw.promptFeedback?.blockReason || candidate.finishReason !== "STOP") throw new RetryableCallError("Chamada de ferramentas incompleta ou bloqueada.");
  const calls = parts.filter((p: any) => p.functionCall).map((p: any, i: number) => ({ id: p.functionCall.id ?? `gemini_${requestId}_${i}`, type: "function" as const, function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } }));
  if (!options || options.final || calls.length > 2 * ids.length || new Set(calls.map((c: any) => c.id)).size !== calls.length || calls.some((c: any) => !c.id || typeof c.function.name !== "string" || c.function.arguments.length > 4000 || !options.tools.some(t => t.function.name === c.function.name) || typeof options.choice === "object" && c.function.name !== options.choice.function.name)) throw new RetryableCallError("Ferramentas excessivas, repetidas ou não autorizadas no lote.");
  return { kind: "tools", message: { role: "assistant", content: null, tool_calls: calls, providerState: { provider: "gemini", model, payload: [structuredClone(candidate.content)] } } };
}

/** No artificial spacing, RPM/TPM admission sleep or inference mutex. Only
 * server-requested cooldowns are shared by the four experiments. */
export class ReactiveClient {
  calls = 0;
  stopReason: { message?: string };
  constructor(readonly config: Config, readonly logger: Logger, readonly budget: SuiteBudget, readonly cooldownDirectory: string, stopReason: { message?: string }, readonly transport: typeof fetch = fetch) { this.stopReason = stopReason; }
  async turn(role: "classifier" | "judge", messages: Message[], schema: z.ZodType, ids: string[], beforeSend: (id: string) => Promise<void>, options?: TurnOptions): Promise<TurnResult> {
    if (this.stopReason.message) throw new StopRun(this.stopReason.message);
    const profile = this.config.direct![role];
    if (profile.provider !== "gemini") throw new StopRun("Esta suíte suporta somente os dois modelos Gemini configurados.");
    const model = role === "classifier" ? this.config.classifierModel : this.config.judgeModel;
    const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
    if (!key) throw new StopRun("Chave Gemini ausente no .env.");
    const cooldown = `${this.cooldownDirectory}/${model}.json`;
    while (await exists(cooldown)) {
      const state = await readJson<{ until: number }>(cooldown);
      if (!Number.isFinite(state.until)) throw new StopRun("Cooldown da suíte inválido.");
      const wait = state.until - Date.now();
      if (wait <= 0) break;
      await sleep(Math.min(wait, 60000));
      if (this.stopReason.message) throw new StopRun(this.stopReason.message);
    }
    const body = batchWireBody(geminiBody(model, profile, messages, schema, options), this.config.batchSize), text = JSON.stringify(body);
    if (text.length > this.config.maxRequestCharacters) throw new StopRun("Lote excede orçamento de tamanho; não foi dividido silenciosamente.");
    const requestId = randomUUID(), upper = Buffer.byteLength(text, "utf8") + 4096;
    await this.budget.transaction(b => b.reserve(requestId, role, model, profile, upper, this.config.direct!.quotaScope));
    try { await beforeSend(requestId); }
    catch (error) { await this.budget.transaction(b => b.settle(requestId, profile, null, true)); throw error; }
    await this.logger.request({ phase: "start", requestId, provider: "gemini", model, role, ids, body });
    this.calls++;
    this.logger.info(`${role}: ${ids.join(",")}; envio ${this.calls}, sem pausa preventiva.`);
    let response: Response, responseText: string;
    const at = Date.now();
    try {
      response = await this.transport(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: text, signal: AbortSignal.timeout(this.config.timeoutMs) });
      responseText = await response.text();
    } catch (error) {
      await this.budget.transaction(b => b.settle(requestId, profile, null));
      await this.logger.request({ phase: "network_error", requestId, durationMs: Date.now() - at, error: (error as Error).name });
      throw new RetryableCallError("Falha de rede; custo desconhecido preservado no orçamento.");
    }
    await this.logger.request({ phase: "response", requestId, status: response.status, durationMs: Date.now() - at, body: responseText });
    let raw: any;
    try { raw = JSON.parse(responseText); } catch { /* Unknown usage remains reserved. */ }
    await this.budget.transaction(b => b.settle(requestId, profile, normalizeUsage("gemini", raw?.usageMetadata)));
    await this.logger.event("usage", { requestId, role, ids, usage: raw?.usageMetadata ?? null, budget: await this.budget.summary() });
    if (!response.ok) {
      const fatal = permanentQuotaFailure("gemini", raw?.error);
      if (fatal || [401, 402, 403].includes(response.status)) {
        this.stopReason.message = fatal ?? `Google respondeu HTTP ${response.status}; verifique acesso ou faturamento.`;
        throw new StopRun(this.stopReason.message);
      }
      if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
        const delays = (raw?.error?.details ?? []).map((d: any) => /^\d+(?:\.\d+)?s$/.test(d.retryDelay ?? "") ? Number(d.retryDelay.slice(0, -1)) * 1000 : 0);
        const wait = Math.max(response.status === 429 ? 20000 : 2000, retryHintMs(response.headers) ?? (response.status === 429 && !delays.some((d: number) => d > 0) ? 60000 : 0), ...delays);
        if (response.status === 429) await withInferenceLock(`${cooldown}.lock`, async () => {
          const previous = await exists(cooldown) ? await readJson<{ until: number }>(cooldown) : { until: 0 };
          await atomicJson(cooldown, { until: Math.max(previous.until, Date.now() + wait) });
        }, 30000);
        await this.logger.event("provider_retry", { status: response.status, waitMs: wait, requestId });
        if (wait > this.config.timeoutMs) throw new StopRun("Servidor exige espera longa; checkpoint salvo.");
        throw new RetryableCallError(`Google HTTP ${response.status}`, wait);
      }
      throw new StopRun(`Google HTTP ${response.status}; checkpoint salvo.`);
    }
    if (!raw) throw new RetryableCallError("Resposta não contém JSON válido.");
    return decodeBatchTurn(model, raw, requestId, ids, options);
  }
}
