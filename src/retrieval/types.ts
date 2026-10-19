import { z } from "zod";

export const OriginLabelSchema = z.object({ disciplina: z.string().nullable(), assunto: z.string().nullable() }).strict();
export type OriginLabel = z.infer<typeof OriginLabelSchema>;
export const DocumentSchema = z.object({
  urn: z.string().startsWith("urn:lex:"), title: z.string(), summary: z.string(),
  subjects: z.array(z.string()), date: z.string().nullable(), url: z.string().url(),
}).strict();
export type LegalDocument = z.infer<typeof DocumentSchema>;
export const ApiResultSchema = z.object({
  status: z.enum(["ok", "empty", "challenge", "http_error", "network_error", "invalid", "oversized", "exhausted"]),
  query: z.string(), sourceUrl: z.string().url(), retrievedAt: z.string(),
  httpStatus: z.number().int().nullable(), contentType: z.string().nullable(),
  total: z.number().int().nonnegative().nullable(), documents: z.array(DocumentSchema).max(5),
  bodyHash: z.string().nullable(), error: z.string().nullable(), retryable: z.boolean(),
  retryAfterMs: z.number().nonnegative(), cacheHit: z.boolean(),
}).strict();
export type ApiResult = z.infer<typeof ApiResultSchema>;
export const QuerySchema = z.object({
  key: z.string(), terms: z.string(), roles: z.array(z.enum(["classificador", "origem"])).min(1).max(2),
  attempts: z.number().int().nonnegative(), result: ApiResultSchema.optional(),
}).strict();
export type ContextQuery = z.infer<typeof QuerySchema>;
export const ContextSchema = z.object({
  version: z.literal(1), planHash: z.string(), originalLabel: OriginLabelSchema,
  classifierTheme: z.object({ id: z.string(), title: z.string(), discipline: z.string() }).nullable(),
  status: z.enum(["running", "complete", "partial", "unavailable"]),
  queries: z.array(QuerySchema).max(2), notices: z.array(z.string()),
  judgeContext: z.string().nullable(), sourcesUsed: z.array(z.string()),
}).strict();
export type RetrievalContext = z.infer<typeof ContextSchema>;
