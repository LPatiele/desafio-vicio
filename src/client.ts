import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "./types.js";
import { Logger } from "./logger.js";
import { now, sleep, resolveRoot } from "./utils.js";
import { SharedRateLimiter, retryHintMs, type RequestLimiter } from "./rate-limit.js";

const BASE = "https://openrouter.ai/api/v1";
export class StopRun extends Error {}
export class RetryableCallError extends StopRun {
  constructor(message: string, readonly retryAfterMs = 0) { super(message); }
}
type ModelInfo = {
  id: string; context_length?: number; supported_parameters?: string[]; pricing?: Record<string, string>;
  reasoning?: { supported_efforts?: string[] | null; mandatory?: boolean; default_enabled?: boolean; default_effort?: string; supports_max_tokens?: boolean };
};
export type Preflight = { quota: { used: number; limit: number; remaining: number } | null; models: ModelInfo[]; checkedAt: string };
export async function preflight(config: Config): Promise<Preflight> {
  if (config.direct) return (await import("./providers/direct.js")).directPreflight(config);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY ausente. Configure o arquivo .env local.");
  const get = async (endpoint: string, authenticated: boolean) => {
    const response = await fetch(`${BASE}/${endpoint}`, {
      headers: authenticated ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Consulta ${endpoint}: HTTP ${response.status}.`);
    return response.json() as Promise<{ data: unknown }>;
  };
  const [account, catalog] = await Promise.all([get("key", true), get("models", false)]);
  const all = catalog.data as ModelInfo[];
  const models = [config.classifierModel, config.judgeModel].map(id => {
    const model = all.find(m => m.id === id);
    if (!model) throw new Error(`Modelo indisponível no catálogo: ${id}`);
    if (!model.pricing || ["prompt", "completion"].some(k => model.pricing?.[k] === undefined || Number(model.pricing[k]) !== 0) || Number(model.pricing.request ?? 0) !== 0) throw new Error(`Preço diferente de zero ou desconhecido: ${id}`);
    if (config.responseFormat === "json_schema" && !model.supported_parameters?.includes("structured_outputs")) throw new Error(`Catálogo não confirma JSON Schema para ${id}; configure json_object explicitamente se necessário.`);
    if (((config.research?.enabled || config.knowledge?.enabled && config.knowledge.mode === "judge_tools") && id === config.judgeModel || config.knowledge?.enabled && config.knowledge.classifierMode === "tools" && id === config.classifierModel) && ["tools", "tool_choice"].some(p => !model.supported_parameters?.includes(p))) throw new Error(`Catálogo não confirma ferramentas para ${id}.`);
    const reasoning = config.reasoningByModel[id];
    if (reasoning && !model.supported_parameters?.includes("reasoning")) throw new Error(`Catálogo não confirma controle de raciocínio para ${id}.`);
    if (reasoning && "effort" in reasoning && !model.supported_parameters?.includes("reasoning_effort")) throw new Error(`Catálogo não confirma controle de esforço para ${id}; remova a configuração específica desse modelo.`);
    if (reasoning && "effort" in reasoning && Array.isArray(model.reasoning?.supported_efforts) && !model.reasoning.supported_efforts.includes(reasoning.effort)) throw new Error(`Esforço ${reasoning.effort} não é aceito por ${id}. Níveis anunciados: ${model.reasoning.supported_efforts.join(", ")}.`);
    if (reasoning && "enabled" in reasoning && !reasoning.enabled && model.reasoning?.mandatory) throw new Error(`Raciocínio obrigatório no modelo ${id}; não pode ser desativado.`);
    return { id: model.id, context_length: model.context_length, supported_parameters: model.supported_parameters, pricing: model.pricing, reasoning: model.reasoning };
  });
  const quota = (account.data as { free_model_daily_requests?: Preflight["quota"] }).free_model_daily_requests ?? null;
  if (quota && (!Number.isInteger(quota.remaining) || quota.remaining < 0)) throw new Error("Cota recebida em formato inválido.");
  return { models, quota, checkedAt: now() };
}

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AssistantMessage = { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown[]; reasoning?: string | null; providerState?: { provider: "gemini" | "openai"; model: string; payload: unknown[] } };
export type Message = { role: "system" | "user"; content: string } | AssistantMessage | { role: "tool"; content: string; tool_call_id: string };
export type ToolDefinition = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type TurnOptions = { tools: ToolDefinition[]; choice: "auto" | "none" | { type: "function"; function: { name: string } }; final: boolean };
export type TurnResult = { kind: "final"; content: string; message: AssistantMessage } | { kind: "tools"; message: AssistantMessage & { tool_calls: ToolCall[] } };
// beforeSend must run immediately before each outbound attempt, after budget checks.
type BeforeSend = (requestId: string) => Promise<void>;
export type ModelCaller = {
  call: (role: "classifier" | "judge", model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend?: BeforeSend) => Promise<string>;
  turn?: (role: "classifier" | "judge", model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend: BeforeSend, options: TurnOptions) => Promise<TurnResult>;
};

export class OpenRouterClient implements ModelCaller {
  calls = 0;
  constructor(readonly config: Config, readonly logger: Logger, private remaining: number | null = null,
    private limiter: RequestLimiter = new SharedRateLimiter(resolveRoot("output/rate-limit/openrouter-free.json"), { requestsPerMinute: config.requestsPerMinute, minIntervalMs: config.minIntervalMs }),
    private dailyLimit: number | null = null) {}
  async call(role: "classifier" | "judge", model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend?: (requestId: string) => Promise<void>): Promise<string> {
    const result = await this.turn(role, model, messages, schema, ids, beforeSend);
    if (result.kind !== "final") throw new RetryableCallError("Ferramenta solicitada fora de uma etapa habilitada.");
    return result.content;
  }
  async turn(role: "classifier" | "judge", model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend?: BeforeSend, options?: TurnOptions): Promise<TurnResult> {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    delete jsonSchema.$schema;
    const body = {
      model, messages: options && !options.final ? messages : [...messages, { role: "system", content: `${options?.final ? "Etapa final: não solicite ferramentas adicionais; devolva somente a resposta estruturada. " : ""}Formato obrigatório: ${JSON.stringify(jsonSchema)}` }],
      temperature: 0,
      ...(this.config.reasoningByModel[model] ? { reasoning: this.config.reasoningByModel[model] } : {}),
      max_tokens: Math.min(this.config.maxOutputTokens, Math.max(3000, Math.ceil(this.config.maxOutputTokens * ids.length / this.config.batchSize))),
      stream: false,
      provider: { require_parameters: true },
      ...(options ? { tools: options.tools, tool_choice: options.choice } : {}),
      ...(!options || options.final ? { response_format: this.config.responseFormat === "json_schema"
        ? { type: "json_schema", json_schema: { name: `${role}_batch`, strict: true, schema: jsonSchema } }
        : { type: "json_object" } } : {}),
    };
    if (JSON.stringify(body).length > this.config.maxRequestCharacters) throw new StopRun("Requisição excede o limite de tamanho; reduza o lote ou aumente o limite explicitamente.");
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (this.calls >= this.config.maxCalls) throw new StopRun("Orçamento de chamadas da execução atingido. Estado salvo para retomada.");
      if (this.remaining !== null && this.remaining <= 0) throw new StopRun("Cota diária informada pelo OpenRouter esgotada. Estado salvo.");
      const queuedAt = Date.now();
      try { await this.limiter.acquire(); }
      catch (error) { throw new StopRun(`Controle de taxa indisponível: ${(error as Error).message}`); }
      if (Date.now() - queuedAt >= 50) await this.logger.event("rate_wait", { role, ids, durationMs: Date.now() - queuedAt });
      // Another queued call can exhaust this invocation's budget while we wait.
      if (this.calls >= this.config.maxCalls) throw new StopRun("Orçamento de chamadas da execução atingido. Estado salvo para retomada.");
      if (this.remaining !== null && this.remaining <= 0) throw new StopRun("Cota diária informada pelo OpenRouter esgotada. Estado salvo.");
      const requestId = randomUUID();
      await beforeSend?.(requestId);
      this.calls++;
      if (this.remaining !== null) this.remaining--;
      // Count and log attempts BEFORE sending, so crashes never hide consumed work.
      await this.logger.request({ requestId, phase: "start", role, model, ids, attempt, body });
      this.logger.info(`${role}: ${ids.length === 1 ? ids[0] : `${ids.length} questões`}; chamada ${this.calls}/${this.config.maxCalls}.`);
      const started = Date.now();
      let response: Response;
      let responseText: string;
      try {
        response = await fetch(`${BASE}/chat/completions`, {
          method: "POST", headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Case Classificacao de Topicos" },
          body: JSON.stringify(body), signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        responseText = await response.text();
      } catch (e) {
        await this.logger.request({ requestId, phase: "network_error", durationMs: Date.now() - started, error: (e as Error).message });
        // Automatic repetition is allowed only under the persisted per-stage policy.
        throw new RetryableCallError(`Chamada interrompida (${(e as Error).name}). A tentativa pode ter consumido inferência.`);
      }
      await this.logger.request({ requestId, phase: "response", status: response.status, durationMs: Date.now() - started, body: responseText });
      if (!response.ok) {
        const wait = retryHintMs(response.headers) ?? (response.status === 429 ? 60000 : 10000 * 2 ** attempt);
        const limit = Number(response.headers.get("x-ratelimit-limit") ?? 0);
        if (response.status === 429 && limit > 20 && limit === this.dailyLimit) throw new StopRun("Limite de cota diária atingido. Retome após a renovação; consulte preflight.");
        if (response.status === 429) {
          const cooldownMs = Math.max(1000, wait);
          try { await this.limiter.deferUntil(Date.now() + cooldownMs); }
          catch (error) { throw new StopRun(`Não foi possível compartilhar a pausa HTTP 429: ${(error as Error).message}`); }
          await this.logger.event("rate_limited", { role, ids, requestId, limit: limit || null, cooldownMs });
        }
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < this.config.maxRetries && Number.isFinite(wait) && wait <= this.config.timeoutMs) {
          await sleep(wait); continue;
        }
        if ([408, 429, 500, 502, 503, 504].includes(response.status) && Number.isFinite(wait) && wait <= this.config.timeoutMs) {
          throw new RetryableCallError(`OpenRouter respondeu HTTP ${response.status}.`, wait);
        }
        throw new StopRun(`OpenRouter respondeu HTTP ${response.status}. Consulte os registros; o lote ficou pendente.`);
      }
      let result: { id?: string; model?: string; provider?: string; usage?: unknown; error?: unknown; choices?: { message?: AssistantMessage; finish_reason?: string }[] };
      try { result = JSON.parse(responseText); } catch { throw new RetryableCallError("Resposta HTTP não contém JSON válido."); }
      await this.logger.event("usage", { requestId, role, ids, requestedModel: model, returnedModel: result.model, provider: result.provider, usage: result.usage ?? null, completionId: result.id, durationMs: Date.now() - started });
      const choice = result.choices?.[0];
      if (!result.error && choice?.finish_reason === "tool_calls" && options && !options.final && options.choice !== "none") {
        const m = choice.message;
        if (!m || !Array.isArray(m.tool_calls) || !m.tool_calls.length || m.tool_calls.length > 2 || new Set(m.tool_calls.map(t => t.id)).size !== m.tool_calls.length || m.tool_calls.some(t => typeof t.id !== "string" || !t.id || t.type !== "function" || typeof t.function?.name !== "string" || typeof t.function?.arguments !== "string")) throw new RetryableCallError("Solicitação de ferramenta malformada ou excessiva.");
        return { kind: "tools", message: { ...m, role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls } };
      }
      if (result.error || !choice || choice.finish_reason !== "stop" || typeof choice.message?.content !== "string" || !choice.message.content.trim()) {
        if (choice?.finish_reason === "content_filter") throw new StopRun("Resposta bloqueada pelo provedor (content_filter); requer análise explícita.");
        throw new RetryableCallError(`Resposta incompleta ou interrompida (${choice?.finish_reason ?? "sem escolha"}).`);
      }
      return { kind: "final", content: choice.message.content, message: { ...choice.message, role: "assistant" } };
    }
    throw new StopRun("Tentativas esgotadas.");
  }
}
