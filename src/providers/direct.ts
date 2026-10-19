import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StopRun, RetryableCallError, type AssistantMessage, type Message, type ModelCaller, type Preflight, type ToolCall, type TurnOptions, type TurnResult } from "../client.js";
import type { Config, DirectProfile } from "../types.js";
import { Logger } from "../logger.js";
import { SharedRateLimiter, nextQuotaReset, retryHintMs, type RequestLimiter, type QuotaPermit } from "../rate-limit.js";
import { hash, now, resolveRoot } from "../utils.js";
import { SpendBudget, knownDirectStarts, usageCost, type TokenUsage } from "./budget.js";
import { withInferenceLock } from "./serial.js";

type Role = "classifier" | "judge";
type Json = Record<string, any>;
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI = "https://api.openai.com/v1";
const keyFor = (provider: DirectProfile["provider"]) => {
  const name = provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
  const key = (process.env[name] || (provider === "gemini" ? process.env.GOOGLE_API_KEY : undefined))?.trim();
  if (!key) throw new StopRun(`${name} ausente. Configure o .env local.`);
  return key;
};
const auth = (provider: DirectProfile["provider"], key: string): Record<string, string> => provider === "gemini" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` };
export const directQuotaBucket = (provider: DirectProfile["provider"], model: string, scope = "workspace") => `${provider}-${hash(`project:${scope}:${model}`).slice(0, 20)}`;
function configuredLimiter(config: Config, model: string, profile: DirectProfile) {
  const bucket = directQuotaBucket(profile.provider, model, config.direct!.quotaScope);
  return new SharedRateLimiter(resolveRoot("output/rate-limit", `${bucket}.json`), {
    requestsPerMinute: profile.requestsPerMinute, tokensPerMinute: profile.tokensPerMinute,
    requestsPerDay: profile.requestsPerDay, dailyResetTimeZone: profile.dailyResetTimeZone ?? (profile.provider === "gemini" ? "America/Los_Angeles" : "UTC"),
    minIntervalMs: profile.minIntervalMs ?? config.minIntervalMs, seedDailyStarts: () => knownDirectStarts(resolveRoot("output/experiments"), profile.provider, model, config.direct!.quotaScope),
  });
}
export async function directQuotaStatus(config: Config) {
  if (!config.direct) throw new Error("limits exige configuração de APIs diretas.");
  const roles = await Promise.all((["classifier", "judge"] as const).map(async role => {
    const model = role === "classifier" ? config.classifierModel : config.judgeModel;
    return { role, model, ...await configuredLimiter(config, model, config.direct![role]).status() };
  }));
  return { scope: config.direct.quotaScope ?? "workspace", providerLimitsVerified: false,
    note: "Contagem local dos envios conhecidos neste workspace, compartilhada por modelo e escopo de projeto. Não consulta o saldo real da Google nem observa outros programas.", roles };
}

export function permanentQuotaFailure(provider: DirectProfile["provider"], error: Json | undefined): string | null {
  if (!error) return null;
  const details: Json[] = Array.isArray(error.details) ? error.details.filter((item: unknown) => item && typeof item === "object") : [];
  if (provider === "openai" && (error.type === "insufficient_quota" || ["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded", "usage_limit_exceeded", "billing_hard_limit_reached", "billing_not_active"].includes(error.code))) return `OpenAI bloqueou a inferência por saldo ou limite de faturamento (${error.code ?? error.type}). Atualize créditos/limites antes de retomar; repetir a chamada não libera acesso.`;
  const violations = details.flatMap(detail => Array.isArray(detail.violations) ? detail.violations : []);
  if (provider === "gemini" && violations.some(item => /free_tier|FreeTier/.test(`${item.quotaMetric ?? ""} ${item.quotaId ?? ""}`)) && /limit:\s*0\b/.test(String(error.message))) return "Google informou Free Tier com cota zero para o modelo. Ative faturamento no projeto dessa chave antes de retomar.";
  if (provider === "gemini" && violations.some(item => /PerDay|per_day/.test(`${item.quotaId ?? ""} ${item.quotaMetric ?? ""}`))) return "Google informou cota diária esgotada. Aguarde renovação ou ajuste o limite do projeto antes de retomar.";
  if (/credit balance|no credits remaining|payment required|enable billing|billing (?:is )?(?:disabled|not enabled|inactive)/i.test(String(error.message ?? "")) || details.some(detail => ["BILLING_DISABLED", "BILLING_NOT_ACTIVE"].includes(detail.reason))) return `${provider} informou bloqueio de faturamento; verifique créditos e a conta do projeto antes de retomar.`;
  return null;
}

export async function directPreflight(config: Config): Promise<Preflight> {
  if (!config.direct) throw new Error("Configuração direct ausente.");
  // Validate all credentials before starting either lookup. No paid inference.
  const roles = (["classifier", "judge"] as const).map(role => ({ role, profile: config.direct![role], model: role === "classifier" ? config.classifierModel : config.judgeModel, key: keyFor(config.direct![role].provider) }));
  const models: Preflight["models"] = [];
  for (const { profile, model, key } of roles) {
    const base = profile.provider === "gemini" ? GOOGLE : OPENAI;
    const response = await fetch(`${base}/models/${encodeURIComponent(model)}`, { headers: auth(profile.provider, key), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new StopRun(`Verificação ${profile.provider}/${model}: HTTP ${response.status}. Verifique acesso e credenciais; nenhum modelo alternativo foi escolhido.`);
    const info = await response.json() as Json;
    if (profile.provider === "gemini" && !info.supportedGenerationMethods?.includes("generateContent")) throw new StopRun(`Google não confirma generateContent para ${model}.`);
    if (profile.provider === "openai" && info.id !== model) throw new StopRun(`Identificador OpenAI inesperado para ${model}.`);
    const entry = { id: model, context_length: info.inputTokenLimit, supported_parameters: ["structured_outputs", "tools", "reasoning"], pricing: { prompt: String(profile.inputUsdPerMillion / 1_000_000), completion: String(profile.outputUsdPerMillion / 1_000_000) }, provider: profile.provider, pricingSource: "configuração versionada; conferir faturamento do serviço", checkedModel: info.name ?? info.id };
    models.push(entry);
  }
  return { quota: null, models, checkedAt: now() };
}

function schemaJson(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { target: "draft-7" }); delete json.$schema; return json;
}

export function geminiBody(model: string, profile: DirectProfile, messages: Message[], schema: z.ZodType, options?: TurnOptions): Json {
  const contents: Json[] = [], systems: string[] = [];
  const calls = new Map<string, { name: string; nativeId?: string }>();
  const append = (role: string, parts: Json[]) => {
    if (contents.at(-1)?.role === role) contents.at(-1)!.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const message of messages) {
    if (message.role === "system") { systems.push(message.content); continue; }
    if (message.role === "assistant") {
      if (message.providerState) {
        if (message.providerState.provider !== "gemini" || message.providerState.model !== model) throw new StopRun("Histórico de ferramentas pertence a outro fornecedor/modelo.");
        const payload = message.providerState.payload as Json[];
        if (payload.length !== 1 || payload[0]?.role !== "model" || !Array.isArray(payload[0]?.parts)) throw new StopRun("Continuidade Gemini inválida.");
        const nativeCalls = payload[0]!.parts.filter((p: Json) => p.functionCall).map((p: Json) => p.functionCall);
        for (const [index, call] of (message.tool_calls ?? []).entries()) calls.set(call.id, { name: call.function.name, nativeId: nativeCalls[index]?.id });
        // Preserve every original part and opaque thoughtSignature verbatim.
        contents.push(structuredClone(payload[0]!));
      } else {
        if (message.tool_calls?.length) throw new StopRun("Histórico Gemini sem assinaturas de continuidade; use um experimento novo.");
        if (message.content) append("model", [{ text: message.content }]);
      }
    } else if (message.role === "tool") {
      const call = calls.get(message.tool_call_id);
      if (!call) throw new StopRun("Resposta de ferramenta sem chamada Gemini correspondente.");
      append("user", [{ functionResponse: { name: call.name, ...(call.nativeId ? { id: call.nativeId } : {}), response: JSON.parse(message.content) } }]);
    } else append("user", [{ text: message.content }]);
  }
  const final = !options || options.final;
  if (final) systems.push(`Etapa final: não solicite ferramentas; devolva somente JSON no contrato ${JSON.stringify(schemaJson(schema))}`);
  return {
    systemInstruction: { parts: [{ text: systems.join("\n\n") }] }, contents,
    generationConfig: { maxOutputTokens: profile.maxOutputTokens, thinkingConfig: { thinkingLevel: profile.reasoningEffort.toUpperCase() }, ...(final ? { responseMimeType: "application/json", responseJsonSchema: schemaJson(schema) } : {}) },
    ...(!final && options ? {
      tools: [{ functionDeclarations: options.tools.map(t => ({ name: t.function.name, description: t.function.description, parametersJsonSchema: t.function.parameters })) }],
      toolConfig: { functionCallingConfig: { mode: options.choice === "none" ? "NONE" : typeof options.choice === "object" ? "ANY" : "AUTO", ...(typeof options.choice === "object" ? { allowedFunctionNames: [options.choice.function.name] } : {}) } },
    } : {}),
  };
}

export function openaiBody(model: string, profile: DirectProfile, messages: Message[], schema: z.ZodType, options?: TurnOptions): Json {
  const input: Json[] = [];
  for (const message of messages) {
    if (message.role === "assistant" && message.providerState) {
      if (message.providerState.provider !== "openai" || message.providerState.model !== model) throw new StopRun("Histórico de ferramentas pertence a outro fornecedor/modelo.");
      input.push(...structuredClone(message.providerState.payload) as Json[]);
    } else if (message.role === "assistant" && message.tool_calls?.length) throw new StopRun("Histórico OpenAI sem itens nativos de continuidade.");
    else if (message.role === "tool") input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content });
    else if (message.content) input.push({ role: message.role, content: message.content });
  }
  const final = !options || options.final;
  if (final) input.push({ role: "system", content: `Etapa final: devolva somente JSON. Formato obrigatório: ${JSON.stringify(schemaJson(schema))}` });
  return { model, input, store: false, include: ["reasoning.encrypted_content"], reasoning: { effort: profile.reasoningEffort }, max_output_tokens: profile.maxOutputTokens,
    ...(final ? { text: { format: { type: "json_schema", name: "resultado", strict: true, schema: schemaJson(schema) } } } : {
      tools: options!.tools.map(t => ({ type: "function", ...t.function, strict: false })), parallel_tool_calls: false,
      tool_choice: typeof options!.choice === "object" ? { type: "function", name: options!.choice.function.name } : options!.choice,
    }),
  };
}

const validCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function normalizeUsage(provider: DirectProfile["provider"], raw: Json | undefined): TokenUsage | null {
  if (!raw) return null;
  const input = provider === "gemini" ? raw.promptTokenCount : raw.input_tokens;
  const cached = provider === "gemini" ? raw.cachedContentTokenCount ?? 0 : raw.input_tokens_details?.cached_tokens ?? 0;
  const reasoning = provider === "gemini" ? raw.thoughtsTokenCount ?? 0 : raw.output_tokens_details?.reasoning_tokens ?? 0;
  const output = provider === "gemini" ? validCount(raw.totalTokenCount) && validCount(input) ? Math.max((raw.candidatesTokenCount ?? 0) + reasoning, raw.totalTokenCount - input) : undefined : raw.output_tokens;
  if (![input, cached, output, reasoning].every(validCount) || cached > input || reasoning > output) return null;
  return { inputTokens: input, cachedInputTokens: cached, outputTokens: output!, reasoningTokens: reasoning };
}

export function decodeTurn(provider: DirectProfile["provider"], model: string, raw: Json, requestId: string, options?: TurnOptions): TurnResult {
  let calls: ToolCall[], content: string, message: AssistantMessage;
  if (provider === "gemini") {
    const candidate = raw.candidates?.[0];
    if (raw.promptFeedback?.blockReason || ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION"].includes(candidate?.finishReason)) throw new StopRun("Google bloqueou a resposta; requer análise explícita.");
    if (!candidate || candidate.finishReason !== "STOP" || !Array.isArray(candidate.content?.parts)) throw new RetryableCallError(`Resposta Gemini incompleta (${candidate?.finishReason ?? "sem candidato"}).`);
    const parts = candidate.content.parts as Json[];
    if (parts.some(part => !part || typeof part !== "object")) throw new RetryableCallError("Partes Gemini malformadas.");
    calls = parts.filter(p => p.functionCall).map((p, i) => ({ id: p.functionCall.id ?? `gemini_${requestId}_${i}`, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } }));
    content = parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
    message = { role: "assistant", content: content || null, providerState: { provider, model, payload: [candidate.content] } };
  } else {
    const output = raw.output as Json[];
    if (!Array.isArray(output) || output.some(item => !item || typeof item !== "object")) throw new RetryableCallError("OpenAI respondeu sem itens de saída válidos.");
    if (output.some(item => item.type === "message" && !Array.isArray(item.content))) throw new RetryableCallError("Mensagem OpenAI malformada.");
    if (output.some(item => item.type === "message" && item.content.some((p: Json) => p?.type === "refusal"))) throw new StopRun("OpenAI recusou a resposta; requer análise explícita.");
    if (raw.status !== "completed" || raw.error) throw new RetryableCallError(`Resposta OpenAI incompleta (${raw.incomplete_details?.reason ?? raw.status}).`);
    calls = output.filter(item => item.type === "function_call").map(item => ({ id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments } }));
    content = output.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter((p: Json) => p?.type === "output_text" && typeof p.text === "string").map((p: Json) => p.text).join("");
    message = { role: "assistant", content: content || null, providerState: { provider, model, payload: output } };
  }
  if (calls.length) {
    if (!options || options.final || options.choice === "none" || calls.length > 2 || new Set(calls.map(c => c.id)).size !== calls.length || calls.some(c => typeof c.id !== "string" || !c.id || typeof c.function.name !== "string" || typeof c.function.arguments !== "string" || c.function.arguments.length > 4000 || !options.tools.some(t => t.function.name === c.function.name) || typeof options.choice === "object" && c.function.name !== options.choice.function.name)) throw new RetryableCallError("Solicitação de ferramenta malformada, excessiva ou não autorizada.");
    return { kind: "tools", message: { ...message, tool_calls: calls } };
  }
  if (typeof content !== "string" || !content.trim()) throw new RetryableCallError("Resposta final vazia.");
  return { kind: "final", content, message };
}

// HTTP clients deliberately have no internal retries. The existing persisted
// stage loop owns all five attempts, including tool requests and final answers.
export class DirectClient implements ModelCaller {
  calls = 0;
  private limiters = new Map<string, RequestLimiter>();
  constructor(readonly config: Config, readonly logger: Logger, readonly budget: SpendBudget, private transport: typeof fetch = fetch, private makeLimiter?: (role: Role) => RequestLimiter) {
    if (!config.direct) throw new Error("Configuração direct ausente.");
  }
  async call(role: Role, model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend?: (id: string) => Promise<void>): Promise<string> {
    const result = await this.turn(role, model, messages, schema, ids, beforeSend);
    if (result.kind !== "final") throw new RetryableCallError("Ferramenta solicitada fora da etapa de consultas.");
    return result.content;
  }
  async turn(role: Role, model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend?: (id: string) => Promise<void>, options?: TurnOptions): Promise<TurnResult> {
    const provider = this.config.direct![role].provider;
    const scope = this.config.direct!.quotaScope ?? "workspace";
    const file = resolveRoot("output/rate-limit", `${provider}-${hash(`serial:${scope}`).slice(0, 20)}.inference.lock`);
    return withInferenceLock(file, () => this.serialTurn(role, model, messages, schema, ids, beforeSend, options), this.config.timeoutMs + 60000);
  }
  private async serialTurn(role: Role, model: string, messages: Message[], schema: z.ZodType, ids: string[], beforeSend?: (id: string) => Promise<void>, options?: TurnOptions): Promise<TurnResult> {
    const expected = role === "classifier" ? this.config.classifierModel : this.config.judgeModel;
    if (model !== expected) throw new StopRun("Modelo solicitado diverge da configuração do papel.");
    const profile = this.config.direct![role], provider = profile.provider, key = keyFor(provider);
    const body = provider === "gemini" ? geminiBody(model, profile, messages, schema, options) : openaiBody(model, profile, messages, schema, options);
    const bodyText = JSON.stringify(body);
    if (bodyText.length > this.config.maxRequestCharacters) throw new StopRun("Requisição direta excede o limite de tamanho configurado.");
    // UTF-8 bytes + envelope headroom is a deliberately conservative token
    // reservation, not a tokenizer estimate or a prediction of actual usage.
    const inputUpperBound = Buffer.byteLength(bodyText, "utf8") + 4096;
    // Same model/project scope shares limits across roles, keys and experiments.
    const bucket = directQuotaBucket(provider, model, this.config.direct!.quotaScope);
    let limiter = this.limiters.get(bucket);
    if (!limiter) {
      limiter = this.makeLimiter?.(role) ?? configuredLimiter(this.config, model, profile);
      this.limiters.set(bucket, limiter);
    }
    let permit: QuotaPermit | void;
    try { permit = await limiter.acquire(inputUpperBound + profile.maxOutputTokens); }
    catch (error) { throw new StopRun(`Controle de taxa direta: ${(error as Error).message}`); }
    const requestId = randomUUID();
    try { await this.budget.reserve(requestId, role, model, profile, inputUpperBound, this.config.direct!.quotaScope); }
    catch (error) { await permit?.cancel(); throw error; }
    try { await beforeSend?.(requestId); }
    catch (error) { await this.budget.settle(requestId, profile, null, true); await permit?.cancel(); throw error; }
    await this.logger.request({ requestId, phase: "start", role, model, provider, ids, attempt: 0, body });
    this.calls++;
    this.logger.info(`${role}: ${ids.join(",")}; ${provider}/${model}; chamada paga ${this.calls}.`);
    const started = Date.now();
    let response: Response, text: string;
    try {
      const url = provider === "gemini" ? `${GOOGLE}/models/${encodeURIComponent(model)}:generateContent` : `${OPENAI}/responses`;
      response = await this.transport(url, { method: "POST", headers: { ...auth(provider, key), "Content-Type": "application/json" }, body: bodyText, signal: AbortSignal.timeout(this.config.timeoutMs) });
      text = await response.text();
    } catch (error) {
      await this.budget.settle(requestId, profile, null);
      await this.logger.request({ requestId, phase: "network_error", durationMs: Date.now() - started, error: (error as Error).name });
      throw new RetryableCallError(`Chamada ${provider} interrompida (${(error as Error).name}); consumo desconhecido reservado no orçamento.`);
    }
    await this.logger.request({ requestId, phase: "response", status: response.status, durationMs: Date.now() - started, body: text });
    let raw: Json | null = null;
    try { raw = JSON.parse(text); } catch { /* Retain unknown billing for non-JSON responses. */ }
    const usage = normalizeUsage(provider, provider === "gemini" ? raw?.usageMetadata : raw?.usage);
    await this.budget.settle(requestId, profile, usage);
    await this.logger.event("usage", { requestId, role, ids, requestedModel: model, returnedModel: raw?.modelVersion ?? raw?.model ?? null, provider, usage: provider === "gemini" ? raw?.usageMetadata ?? null : raw?.usage ?? null, normalizedUsage: usage, costUsd: usage ? usageCost(profile, usage) : null, budget: this.budget.summary(), completionId: raw?.responseId ?? raw?.id, durationMs: Date.now() - started });
    if (!response.ok) {
      const details: Json[] = Array.isArray(raw?.error?.details) ? raw!.error.details.filter((detail: unknown) => detail && typeof detail === "object") : [];
      const permanent = permanentQuotaFailure(provider, raw?.error);
      if (permanent) {
        if (provider === "gemini" && details.some(detail => detail.violations?.some((v: Json) => /PerDay|per_day/.test(`${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`)))) {
          const delay = Math.max(...details.map(detail => typeof detail.retryDelay === "string" && /^\d+(?:\.\d+)?s$/.test(detail.retryDelay) ? Number(detail.retryDelay.slice(0, -1)) * 1000 : 0));
          const resetAt = delay > 0 ? Date.now() + delay : nextQuotaReset(Date.now(), profile.dailyResetTimeZone ?? "America/Los_Angeles");
          await limiter.blockDailyUntil?.(resetAt);
          await this.logger.event("daily_quota_exhausted", { role, model, resetAt: new Date(resetAt).toISOString(), details });
        }
        throw new StopRun(`${permanent} Estado salvo.`);
      }
      if ([400, 401, 402, 403, 404, 422].includes(response.status)) throw new StopRun(`${provider} respondeu HTTP ${response.status} (${raw?.error?.code ?? raw?.error?.status ?? "configuração/acesso"}); corrija acesso, faturamento ou parâmetros. Estado salvo.`);
      const providerDelay = details.map(detail => typeof detail.retryDelay === "string" && /^\d+(?:\.\d+)?s$/.test(detail.retryDelay) ? Number(detail.retryDelay.slice(0, -1)) * 1000 : 0).reduce((a, b) => Math.max(a, b), 0);
      const wait = Math.max(response.status === 429 ? 20000 : 0, providerDelay, retryHintMs(response.headers) ?? (response.status === 429 && !providerDelay ? 60000 : 10000));
      if (response.status === 429) {
        await limiter.deferUntil(Date.now() + wait);
        await this.logger.event("rate_limited", { role, model, waitMs: wait, details });
        this.logger.info(`[429] ${role}: aguardará pelo menos ${Math.ceil(wait / 1000)} segundos antes de outra tentativa.`);
      }
      if ([408, 429, 500, 502, 503, 504].includes(response.status) && wait <= this.config.timeoutMs) throw new RetryableCallError(`${provider} respondeu HTTP ${response.status}.`, wait);
      throw new StopRun(`${provider} respondeu HTTP ${response.status}. Estado salvo.`);
    }
    if (!raw) throw new RetryableCallError("Resposta HTTP não contém JSON válido.");
    return decodeTurn(provider, model, raw, requestId, options);
  }
}
