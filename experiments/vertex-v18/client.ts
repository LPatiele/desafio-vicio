import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Config } from "../../src/types.js";
import type { Message, TurnOptions, TurnResult } from "../../src/client.js";
import { StopRun, RetryableCallError } from "../../src/client.js";
import { geminiBody, normalizeUsage, permanentQuotaFailure } from "../../src/providers/direct.js";
import { withInferenceLock } from "../../src/providers/serial.js";
import { atomicJson, exists, readJson, sleep } from "../../src/utils.js";
import { Logger } from "../../src/logger.js";
import { ReactiveClient, SuiteBudget, batchWireBody, decodeBatchTurn } from "../paid-v17/client.js";
import { createVertexSdk, vertexEndpoint, vertexError, vertexParameters, type VertexSettings } from "./connection.js";

/** Same stage/validation contract as v17, but an independent billing channel,
 * authenticated through ADC. No transport retries hidden from stage counters. */
export class VertexClient extends ReactiveClient {
  readonly sdk: ReturnType<typeof createVertexSdk>;
  constructor(config: Config, logger: Logger, budget: SuiteBudget, cooldownDirectory: string, stopReason: { message?: string }, readonly vertex: VertexSettings, sdk?: ReturnType<typeof createVertexSdk>) {
    super(config, logger, budget, cooldownDirectory, stopReason);
    this.sdk = sdk ?? createVertexSdk(vertex, config.timeoutMs);
  }
  override async turn(role: "classifier" | "judge", messages: Message[], schema: z.ZodType, ids: string[], beforeSend: (id: string) => Promise<void>, options?: TurnOptions): Promise<TurnResult> {
    if (this.stopReason.message) throw new StopRun(this.stopReason.message);
    const profile = this.config.direct![role];
    const model = role === "classifier" ? this.config.classifierModel : this.config.judgeModel;
    const endpoint = vertexEndpoint(this.vertex, model);
    if (profile.provider !== "gemini") throw new StopRun("Vertex só aceita os modelos Gemini configurados.");
    const cooldown = `${this.cooldownDirectory}/${model}.json`;
    while (await exists(cooldown)) {
      const state = await readJson<{ until: number }>(cooldown);
      if (!Number.isFinite(state.until)) throw new StopRun("Cooldown Vertex inválido.");
      const wait = state.until - Date.now();
      if (wait <= 0) break;
      await sleep(Math.min(wait, 60000));
      if (this.stopReason.message) throw new StopRun(this.stopReason.message);
    }
    const body = batchWireBody(geminiBody(model, profile, messages, schema, options), this.config.batchSize);
    const text = JSON.stringify(body);
    if (text.length > this.config.maxRequestCharacters) throw new StopRun("Lote excede o limite de tamanho; não foi dividido silenciosamente.");
    const requestId = randomUUID();
    await this.budget.transaction(b => b.reserve(requestId, role, model, profile, Buffer.byteLength(text, "utf8") + 4096, this.config.direct!.quotaScope));
    try { await beforeSend(requestId); }
    catch (error) { await this.budget.transaction(b => b.settle(requestId, profile, null, true)); throw error; }
    await this.logger.request({ phase: "start", requestId, provider: "gemini", channel: "vertex", project: this.vertex.project, location: this.vertex.location, endpoint, model, role, ids, body });
    this.calls++;
    this.logger.info(`${role}: ${ids.join(",")}; Vertex ADC; envio ${this.calls}.`);
    const at = Date.now();
    let raw: any, status = 200;
    try {
      const response = await this.sdk.models.generateContent(vertexParameters(model, body));
      raw = JSON.parse(JSON.stringify(response));
      delete raw.sdkHttpResponse;
    } catch (error) {
      const failure = vertexError(error);
      if (failure.status === null) {
        await this.budget.transaction(b => b.settle(requestId, profile, null));
        await this.logger.request({ phase: "network_error", requestId, channel: "vertex", durationMs: Date.now() - at, error: (error as Error).name });
        if (/default credentials|invalid_grant|reauth|authentication|endpoint Vertex|ADC|chave de API/i.test((error as Error).message)) {
          this.stopReason.message = "Autenticação ADC ou destino Vertex inválido. Refaça o login; estado salvo.";
          throw new StopRun(this.stopReason.message);
        }
        throw new RetryableCallError("Falha de rede Vertex; custo desconhecido preservado no orçamento.");
      }
      status = failure.status; raw = failure.raw;
    }
    await this.logger.request({ phase: "response", requestId, channel: "vertex", status, durationMs: Date.now() - at, body: JSON.stringify(raw) });
    await this.budget.transaction(b => b.settle(requestId, profile, normalizeUsage("gemini", raw?.usageMetadata)));
    await this.logger.event("usage", { requestId, role, ids, channel: "vertex", project: this.vertex.project, usage: raw?.usageMetadata ?? null, budget: await this.budget.summary() });
    if (status >= 400) {
      const financial = /monthly spending cap|prepayment|credits.*depleted|billing|spending limit/i.test(raw?.error?.message ?? "");
      const fatal = permanentQuotaFailure("gemini", raw?.error);
      if (financial || fatal || [400, 401, 402, 403, 404].includes(status)) {
        this.stopReason.message = fatal ?? `Vertex HTTP ${status}: ${raw?.error?.message ?? "Verifique projeto, modelo, região, acesso e faturamento."}`;
        throw new StopRun(this.stopReason.message);
      }
      if ([408, 429, 500, 502, 503, 504].includes(status)) {
        const delays = (raw?.error?.details ?? []).map((d: any) => /^\d+(?:\.\d+)?s$/.test(d.retryDelay ?? "") ? Number(d.retryDelay.slice(0, -1)) * 1000 : 0);
        const wait = Math.max(status === 429 ? 60000 : 2000, ...delays);
        if (status === 429) await withInferenceLock(`${cooldown}.lock`, async () => {
          const previous = await exists(cooldown) ? await readJson<{ until: number }>(cooldown) : { until: 0 };
          await atomicJson(cooldown, { until: Math.max(previous.until, Date.now() + wait) });
        }, 30000);
        await this.logger.event("provider_retry", { status, waitMs: wait, requestId, channel: "vertex" });
        if (wait > this.config.timeoutMs) throw new StopRun("Vertex exige espera longa; checkpoint salvo.");
        throw new RetryableCallError(`Vertex HTTP ${status}`, wait);
      }
      throw new StopRun(`Vertex HTTP ${status}; checkpoint salvo.`);
    }
    return decodeBatchTurn(model, raw, requestId, ids, options);
  }
}
