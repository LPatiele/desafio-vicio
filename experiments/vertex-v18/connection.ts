import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { z } from "zod";

const Price = z.object({
  inputUsdPerMillion: z.number().finite().nonnegative(),
  cachedInputUsdPerMillion: z.number().finite().nonnegative(),
  outputUsdPerMillion: z.number().finite().nonnegative(),
  source: z.string().url(),
  verifiedAt: z.string().datetime(),
  note: z.string().optional(),
}).strict();
export const VertexSettingsSchema = z.object({
  project: z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/),
  location: z.string().regex(/^(global|[a-z]+(?:-[a-z]+)+[0-9])$/),
  apiVersion: z.literal("v1"),
  classifierModel: z.string().regex(/^gemini-[a-zA-Z0-9.-]+$/),
  judgeModel: z.string().regex(/^gemini-[a-zA-Z0-9.-]+$/),
  creditName: z.string().min(1).nullable(),
  creditEligibilityVerified: z.boolean(),
  billingAccountDisplayName: z.string().optional(),
  creditEvidence: z.object({
    basis: z.literal("user_credit_id_and_official_policy"),
    sourceUrls: z.array(z.string().url()).min(1),
    billingLinkVerified: z.boolean(),
    creditBalanceVerified: z.boolean(),
    creditApplicationVerified: z.boolean(),
    note: z.string(),
  }).strict().optional(),
  pricing: z.object({ classifier: Price, judge: Price }).strict().nullable(),
}).strict().refine(s => s.classifierModel !== s.judgeModel, "Use modelos distintos.");
export type VertexSettings = z.infer<typeof VertexSettingsSchema>;
export const vertexHost = (settings: VertexSettings) => settings.location === "global" ? "aiplatform.googleapis.com" : `${settings.location}-aiplatform.googleapis.com`;
export function vertexEndpoint(settings: VertexSettings, model: string) {
  if (![settings.classifierModel, settings.judgeModel].includes(model)) throw new Error("Modelo fora da configuração Vertex.");
  return `https://${vertexHost(settings)}/${settings.apiVersion}/projects/${settings.project}/locations/${settings.location}/publishers/google/models/${model}:generateContent`;
}

/** Independent guard even if SDK defaults, environment, or endpoint construction
 * change. Never log credentials, authorization headers or OAuth tokens. */
export function guardedVertexFetch(settings: VertexSettings, transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const prefix = `/${settings.apiVersion}/projects/${settings.project}/locations/${settings.location}/publishers/google/models/`;
    const publisherMetadata = `/${settings.apiVersion}/publishers/google/models/`;
    if (url.protocol !== "https:" || url.hostname !== vertexHost(settings) || url.port || url.username || url.password || (!url.pathname.startsWith(prefix) && !url.pathname.startsWith(publisherMetadata)) || url.searchParams.has("key")) throw new Error("Requisição fora do endpoint Vertex autorizado.");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.has("x-goog-api-key") || !/^Bearer \S+$/.test(headers.get("authorization") ?? "")) throw new Error("Vertex exige ADC com token OAuth; chave de API recusada.");
    if (headers.get("x-goog-user-project") !== settings.project) throw new Error("Projeto de cota Vertex difere da configuração.");
    return transport(input, { ...init, redirect: "error" });
  };
}

export function createVertexSdk(settings: VertexSettings, timeout: number, transport: typeof fetch = fetch, authClient?: any) {
  return new GoogleGenAI({
    enterprise: true, project: settings.project, location: settings.location,
    // Explicit project/location make the SDK ignore Gemini API keys in .env.
    googleAuthOptions: { scopes: ["https://www.googleapis.com/auth/cloud-platform"], clientOptions: { quotaProjectId: settings.project }, ...(authClient ? { authClient } : {}) },
    httpOptions: { apiVersion: settings.apiVersion, baseUrl: `https://${vertexHost(settings)}`, headers: { "x-goog-user-project": settings.project }, timeout, retryOptions: { attempts: 1 }, fetch: guardedVertexFetch(settings, transport) },
  });
}

/** Preserve native Gemini contents, including opaque thought signatures. */
export function vertexParameters(model: string, body: Record<string, any>): GenerateContentParameters {
  return { model, contents: structuredClone(body.contents), config: {
    ...structuredClone(body.generationConfig),
    systemInstruction: structuredClone(body.systemInstruction),
    ...(body.tools ? { tools: structuredClone(body.tools) } : {}),
    ...(body.toolConfig ? { toolConfig: structuredClone(body.toolConfig) } : {}),
  } };
}

export function vertexError(error: unknown): { status: number | null; raw: any } {
  const e = error as { status?: number; message?: string };
  const status = Number.isInteger(e?.status) && e.status! >= 400 && e.status! <= 599 ? e.status! : null;
  if (status === null) return { status: null, raw: null };
  let raw;
  try { raw = JSON.parse(e.message ?? ""); } catch { /* SDK may return a plain error message. */ }
  return { status, raw: raw?.error ? raw : { error: { code: status, message: e.message ?? "Erro Vertex." } } };
}
