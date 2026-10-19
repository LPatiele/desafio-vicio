import { z } from "zod";

export const DirectProfileSchema = z.object({
  provider: z.enum(["gemini", "openai"]),
  reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh"]),
  maxOutputTokens: z.number().int().min(1024).max(65536),
  requestsPerMinute: z.number().int().min(1).max(10000),
  minIntervalMs: z.number().int().nonnegative().optional(),
  tokensPerMinute: z.number().int().positive(),
  requestsPerDay: z.number().int().positive().optional(),
  dailyResetTimeZone: z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Fuso diário inválido").optional(),
  inputUsdPerMillion: z.number().nonnegative(),
  cachedInputUsdPerMillion: z.number().nonnegative(),
  outputUsdPerMillion: z.number().nonnegative(),
  longContext: z.object({ threshold: z.number().int().positive(), inputUsdPerMillion: z.number().nonnegative(), cachedInputUsdPerMillion: z.number().nonnegative(), outputUsdPerMillion: z.number().nonnegative() }).strict().optional(),
}).strict();
export type DirectProfile = z.infer<typeof DirectProfileSchema>;

export const ConfigSchema = z.object({
  classifierModel: z.string().min(1),
  judgeModel: z.string().min(1),
  direct: z.object({ version: z.literal(1), budgetUsd: z.number().positive(), quotaScope: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(), pricingCheckedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), classifier: DirectProfileSchema, judge: DirectProfileSchema }).strict().optional(),
  classifierPrompt: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/).default("classificador.v3.md"),
  judgePrompt: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/).default("juiz.v3.md"),
  batchSize: z.number().int().min(1).max(30),
  maxRequestCharacters: z.number().int().min(1000),
  maxOutputTokens: z.number().int().positive(),
  maxCalls: z.number().int().nonnegative(),
  maxRetries: z.number().int().min(0).max(3),
  maxAttemptsPerStage: z.number().int().min(1).max(5).default(1),
  retryBaseDelayMs: z.number().int().min(0).max(30000).default(2000),
  minIntervalMs: z.number().int().min(0),
  requestsPerMinute: z.number().int().min(1).max(20).default(18),
  timeoutMs: z.number().int().positive(),
  reasoningByModel: z.record(z.string(), z.union([
    z.object({ effort: z.enum(["minimal", "low", "medium", "high"]) }).strict(),
    z.object({ enabled: z.boolean() }).strict(),
  ])).default({}),
  responseFormat: z.enum(["json_schema", "json_object"]),
  allowRootPublication: z.boolean(),
  legalCutoff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  knowledge: z.object({
    enabled: z.boolean(), snapshot: z.string().regex(/^output\/knowledge\/snapshots\/[a-z0-9-]+\/manifest\.json$/),
    mode: z.enum(["automatic", "judge_tools"]).optional(),
    classifierMode: z.enum(["none", "tools"]).optional(),
    maxToolCalls: z.number().int().min(1).max(4).optional(),
    maxToolRounds: z.number().int().min(1).max(2).optional(),
    maxDocuments: z.number().int().min(1).max(10).default(6),
    maxContextCharacters: z.number().int().min(4000).max(32000).default(16000),
    // Historical configuration field, retained for loading old manifests.
    // Local coverage no longer vetoes publication independently of the verdict.
    requireContextForPublication: z.boolean().default(false),
  }).strict().optional(),
  retrieval: z.object({
    enabled: z.boolean(), labelSource: z.literal("original"),
    maximumRecords: z.number().int().min(1).max(5).default(5),
    maxAttemptsPerQuery: z.number().int().min(1).max(2).default(2),
    maxRequestsPerQuestion: z.number().int().min(2).max(5).default(4),
    timeoutMs: z.number().int().min(100).max(30000).default(15000),
    maxResponseBytes: z.number().int().min(1000).max(1_000_000).default(256000),
    maxContextCharacters: z.number().int().min(4000).max(32000).default(16000),
    cacheTtlMs: z.number().int().nonnegative().default(86400000),
    requireApiSuccessForPublication: z.boolean().default(true),
  }).strict().optional(),
  research: z.object({
    enabled: z.boolean(),
    provider: z.enum(["prof-ramos/LeXML-mcp", "ehrodan/lexmcp"]).default("prof-ramos/LeXML-mcp"),
    environmentLock: z.string().optional(),
    command: z.string().min(1), args: z.array(z.string()), cwd: z.string().optional(),
    sourceLock: z.string().min(1),
    requiredSearch: z.literal(true).default(true),
    finalToolChoice: z.enum(["none", "auto"]).default("auto"),
    maxToolCalls: z.number().int().min(1).max(2).default(2),
    toolTimeoutMs: z.number().int().min(100).max(30000).default(15000),
    maxToolAttempts: z.number().int().min(1).max(2).default(2),
    maxResultCharacters: z.number().int().min(1000).max(16000).default(12000),
    maxQuestionCharacters: z.number().int().min(1000).max(32000).default(24000),
  }).strict().optional(),
}).strict().superRefine((config, context) => {
  if (!config.direct && (!config.classifierModel.endsWith(":free") || !config.judgeModel.endsWith(":free"))) context.addIssue({ code: "custom", message: "Configuração legada exige modelos :free; APIs pagas exigem configuração direct explícita." });
  if (config.direct) {
    if (config.batchSize !== 1 || config.maxRetries !== 0 || config.maxAttemptsPerStage !== 5 || config.responseFormat !== "json_schema" || Object.keys(config.reasoningByModel).length) context.addIssue({ code: "custom", message: "APIs diretas exigem batchSize=1, maxRetries=0, cinco tentativas por etapa, json_schema e raciocínio nos perfis direct." });
    for (const role of ["classifier", "judge"] as const) {
      const model = role === "classifier" ? config.classifierModel : config.judgeModel;
      const profile = config.direct[role];
      const valid = profile.provider === "gemini" ? ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"].includes(model) && ["low", "medium", "high"].includes(profile.reasoningEffort) : ["gpt-5.2", "gpt-5.2-2025-12-11"].includes(model);
      if (!valid) context.addIssue({ code: "custom", message: `Modelo/parâmetros incompatíveis no perfil direto ${role}.` });
    }
  }
  if (config.maxAttemptsPerStage > 1 && (config.batchSize !== 1 || config.maxRetries !== 0)) {
    context.addIssue({ code: "custom", message: "Retentativas por etapa exigem batchSize=1 e maxRetries=0 para não multiplicar as tentativas." });
  }
  if (config.research?.enabled && (config.batchSize !== 1 || config.maxRetries !== 0 || config.maxAttemptsPerStage < 2)) context.addIssue({ code: "custom", message: "Pesquisa exige batchSize=1, maxRetries=0 e ao menos duas chamadas por etapa." });
  if (config.retrieval?.enabled && (config.batchSize !== 1 || config.maxRetries !== 0 || config.research?.enabled)) context.addIssue({ code: "custom", message: "Contexto direto exige batchSize=1, maxRetries=0 e pesquisa MCP desabilitada." });
  if (config.knowledge?.enabled && (config.batchSize !== 1 || config.retrieval?.enabled || config.research?.enabled)) context.addIssue({ code: "custom", message: "RAG local exige uma questão por chamada e outros provedores de contexto desabilitados." });
  if (config.knowledge?.enabled && (config.knowledge.mode === "judge_tools" || config.knowledge.classifierMode === "tools") && (config.maxRetries !== 0 || config.maxAttemptsPerStage < 2)) context.addIssue({ code: "custom", message: "Consultas pelos agentes exigem transporte sem retentativas internas e ao menos duas chamadas por etapa." });
});
export type Config = z.infer<typeof ConfigSchema>;
export type Question = {
  id: string; enunciado: string; comando: string;
  alternativas: Record<string, string>; avisos: string[];
};
export type Theme = {
  tema_id: string; parent_id: string; disciplina: string; nivel: number;
  titulo: string; caminho: string; descricao: string; status: string;
};
export type Prepared = {
  version: 1; inputHashes: Record<string, string>; questions: Question[]; themes: Theme[];
  cleaning: { id: string; before: number; after: number; warnings: string[] }[];
};
export const EvidenceSchema = z.object({ campo: z.string().min(1), trecho: z.string().min(8) }).strict();
export const ProposalSchema = z.object({
  id: z.string().regex(/^Q\d{4}$/),
  tema_central_id: z.string().nullable(),
  fora: z.boolean(),
  extras_ids: z.array(z.string()).max(5),
  concorrentes_ids: z.array(z.string()).max(5),
  evidencias: z.array(EvidenceSchema).min(1).max(5),
  justificativa: z.string().min(15),
  incertezas: z.array(z.string()).max(8),
  confianca_declarada: z.number().min(0).max(1),
}).strict();
export type Proposal = z.infer<typeof ProposalSchema>;
export const RubricSchema = z.object({
  avaliacao: z.enum(["sustentado", "incerto", "inadequado"]),
  justificativa: z.string().min(10),
}).strict();
export const VerdictSchema = z.object({
  id: z.string().regex(/^Q\d{4}$/),
  tema_central: RubricSchema,
  evidencia_textual: RubricSchema,
  distincao_de_concorrentes: RubricSchema,
  tema_alternativo_id: z.string().nullable(),
  fora_sustentado: z.boolean(),
  extras_sustentados_ids: z.array(z.string()).max(5),
  alertas: z.array(z.string()).max(8),
}).strict();
export type Verdict = z.infer<typeof VerdictSchema>;
export type Decision = {
  id: string; decisao: "publicar" | "revisar" | "fora";
  tema_central_id: string | null; extras_ids: string[];
  confianca_declarada: number; motivo: string;
};
export type RecordState = {
  id: string; proposal?: Proposal; verdict?: Verdict; decision?: Decision;
  attempts?: { classifier?: number; judge?: number };
  research?: import("./research/evidence.js").ResearchState;
  retrieval?: import("./retrieval/types.js").RetrievalContext;
  knowledge?: import("./knowledge/types.js").LocalContext;
  knowledgeAgent?: import("./knowledge/agent-types.js").LocalAgentState;
  classifierKnowledge?: import("./knowledge/types.js").LocalContext;
  classifierKnowledgeAgent?: import("./knowledge/agent-types.js").LocalAgentState;
  errors: { stage: string; message: string; at: string }[];
};
export type Reference = {
  id: string;
  classificacao: { tema_id: string | null; fora_da_taxonomia: boolean; nivel: number; limite_especifico: string | null };
  conferencia: { possui_ressalva: boolean; fontes_pendentes: string[]; situacao: string };
  exposicao_previa_a_rotulos_ou_pilotos: boolean;
};
export type Split = {
  seed: string; inputHash: string; development: string[]; evaluation: string[];
};
