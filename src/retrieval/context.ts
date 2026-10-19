import { readFile } from "node:fs/promises";
import type { Config, Prepared, Proposal, RecordState, Theme, Verdict } from "../types.js";
import { cleanHtml, indexThemes } from "../data.js";
import { hash, resolveRoot, sleep } from "../utils.js";
import { ContextSchema, type OriginLabel, type RetrievalContext } from "./types.js";
import { cqlQuery, failedResult, searchUrl, type ApiSearch } from "./lexml-api.js";

export async function loadOriginalLabels(data: Prepared): Promise<Map<string, OriginLabel>> {
  const text = await readFile(resolveRoot("anexos/questoes.jsonl"), "utf8");
  if (hash(text) !== data.inputHashes.questions) throw new Error("Rótulos originais pertencem a outra entrada.");
  const labels = new Map<string, OriginLabel>();
  const expected = new Set(data.questions.map(q => q.id));
  const clean = (value: unknown) => typeof value === "string" ? cleanHtml(value).trim() || null : null;
  for (const line of text.trim().split(/\r?\n/)) {
    const q = JSON.parse(line);
    if (labels.has(q.id) || !expected.has(q.id)) throw new Error("ID de rótulo original inesperado ou duplicado.");
    labels.set(q.id, { disciplina: clean(q.disciplina_origem), assunto: clean(q.assunto_origem) });
  }
  if (labels.size !== data.questions.length) throw new Error("Faltam rótulos originais.");
  return labels;
}
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
export function planContext(proposal: Proposal, label: OriginLabel, themes: Map<string, Theme>): RetrievalContext {
  const theme = proposal.tema_central_id ? themes.get(proposal.tema_central_id) : undefined;
  const classifierTheme = theme ? { id: theme.tema_id, title: theme.titulo, discipline: theme.disciplina } : null;
  const queries: RetrievalContext["queries"] = [];
  const notices: string[] = [];
  for (const [role, terms] of [["classificador", classifierTheme?.title], ["origem", label.assunto]] as const) {
    if (!terms) { notices.push(`Sem assunto pesquisável para ${role}.`); continue; }
    try { cqlQuery(terms); } catch { notices.push(`Assunto de ${role} excede limites da consulta.`); continue; }
    const key = hash(normalize(terms));
    const existing = queries.find(q => q.key === key);
    if (existing) existing.roles.push(role);
    else queries.push({ key, terms, roles: [role], attempts: 0 });
  }
  const originalLabel = structuredClone(label);
  const planHash = hash(JSON.stringify({ classifierTheme, originalLabel, queries, notices }));
  return { version: 1, planHash, originalLabel, classifierTheme, queries, notices, status: "running", judgeContext: null, sourcesUsed: [] };
}
export function sourceId(document: unknown): string { return `S-${hash(JSON.stringify(document)).slice(0, 12)}`; }
export function renderContext(context: RetrievalContext, maximum: number): string {
  const sources: { id: string; urn: string; [key: string]: unknown }[] = [];
  const queries = context.queries.map(q => ({ key: q.key, terms: q.terms, roles: q.roles, status: q.result?.status ?? "pending", sourceUrl: q.result?.sourceUrl, retrievedAt: q.result?.retrievedAt, bodyHash: q.result?.bodyHash, httpStatus: q.result?.httpStatus, total: q.result?.total, error: q.result?.error?.slice(0, 600) }));
  const envelope = { status: context.status, rotulo_original: context.originalLabel, tema_proposto: context.classifierTheme, avisos: context.notices, consultas: queries, fontes: sources, documentos_omitidos: 0 };
  // Interleave both searches, preserving provenance and deduplicating by URN.
  for (let i = 0; i < 5; i++) for (const query of context.queries) {
    const doc = query.result?.documents[i]; if (!doc) continue;
    const existing = sources.find(s => s.urn === doc.urn);
    if (existing) { (existing.consultas as string[]).push(query.key); continue; }
    const candidate = { id: sourceId(doc), urn: doc.urn, tipo: "metadados_somente", titulo: doc.title.slice(0, 300), resumo: doc.summary.slice(0, 1200), assuntos: doc.subjects.slice(0, 10).map(s => s.slice(0, 100)), data: doc.date?.slice(0, 100), url: doc.url, consultas: [query.key] };
    sources.push(candidate);
    if (JSON.stringify(envelope).length > maximum - 300) { sources.pop(); envelope.documentos_omitidos++; }
  }
  const result = JSON.stringify(envelope);
  if (result.length > maximum) throw new Error("Metadados das consultas excedem o orçamento de contexto.");
  return result;
}
export function citedSources(verdict: Verdict, context: RetrievalContext): string[] {
  const ids = [...new Set(JSON.stringify(verdict).match(/S-[a-f0-9]{12}\b/g) ?? [])];
  const allowed = new Set((JSON.parse(context.judgeContext ?? "{}").fontes ?? []).map((s: { id: string }) => s.id));
  if (ids.some(id => !allowed.has(id))) throw new Error("Parecer cita fonte ausente do contexto fornecido.");
  return ids;
}
export function validateContextCheckpoint(record: RecordState, config: Config, label: OriginLabel | undefined, themes: Map<string, Theme>): void {
  if (!config.retrieval?.enabled) { if (record.retrieval) throw new Error("Contexto em experimento com busca desabilitada."); return; }
  if (!record.retrieval) { if (record.verdict) throw new Error("Parecer sem contexto API registrado."); return; }
  if (!record.proposal || !label) throw new Error("Contexto sem proposta/rótulo original.");
  const context = ContextSchema.parse(record.retrieval);
  const expected = planContext(record.proposal, label, themes);
  if (context.planHash !== expected.planHash || JSON.stringify(context.originalLabel) !== JSON.stringify(label) || JSON.stringify(context.classifierTheme) !== JSON.stringify(expected.classifierTheme) || JSON.stringify(context.notices) !== JSON.stringify(expected.notices) || context.queries.length !== expected.queries.length) throw new Error("Plano de contexto alterado.");
  for (let i = 0; i < context.queries.length; i++) {
    const q = context.queries[i]!, e = expected.queries[i]!;
    if (q.key !== e.key || q.terms !== e.terms || JSON.stringify(q.roles) !== JSON.stringify(e.roles) || q.attempts > config.retrieval.maxAttemptsPerQuery) throw new Error("Consulta/contador alterado.");
    if (q.result && (q.result.query !== cqlQuery(q.terms) || q.result.sourceUrl !== searchUrl(q.terms, config.retrieval.maximumRecords))) throw new Error("Origem da resposta não corresponde à consulta.");
  }
  if (context.queries.reduce((n, q) => n + q.attempts, 0) > config.retrieval.maxRequestsPerQuestion) throw new Error("Orçamento API excedido.");
  if (context.status !== "running") {
    if (context.queries.some(q => !q.result) || context.status !== completedStatus(context)) throw new Error("Contexto terminal inconsistente.");
    if (context.judgeContext !== renderContext(context, config.retrieval.maxContextCharacters)) throw new Error("Contexto fornecido ao juiz foi alterado.");
  } else if (context.judgeContext !== null || record.verdict) throw new Error("Parecer/contexto em pesquisa ainda pendente.");
  if (JSON.stringify(record.verdict ? citedSources(record.verdict, context) : []) !== JSON.stringify(context.sourcesUsed)) throw new Error("Citações salvas divergem do parecer.");
}
function completedStatus(context: RetrievalContext): RetrievalContext["status"] {
  const success = context.queries.filter(q => ["ok", "empty"].includes(q.result?.status ?? "")).length;
  return success === context.queries.length && success > 0 ? "complete" : success > 0 ? "partial" : "unavailable";
}
export class ContextService {
  readonly themes: Map<string, Theme>;
  constructor(readonly config: Config, data: Prepared, readonly labels: Map<string, OriginLabel>, readonly api: ApiSearch, readonly wait = sleep) { this.themes = indexThemes(data.themes); }
  async collect(record: RecordState, save: () => Promise<void>): Promise<void> {
    const options = this.config.retrieval;
    if (!options?.enabled || !record.proposal) return;
    const label = this.labels.get(record.id);
    if (!label) throw new Error(`Rótulo original não carregado: ${record.id}`);
    validateContextCheckpoint(record, this.config, label, this.themes);
    const context = record.retrieval ??= planContext(record.proposal, label, this.themes);
    if (context.status !== "running") return;
    await save();
    for (const query of context.queries) {
      while (!query.result || query.result.retryable) {
        const total = context.queries.reduce((n, q) => n + q.attempts, 0);
        if (query.attempts >= options.maxAttemptsPerQuery || total >= options.maxRequestsPerQuestion) {
          query.result ??= failedResult(query.terms, options.maximumRecords, "exhausted", "Limite de tentativas HTTP atingido antes de receber uma resposta.");
          query.result.retryable = false;
          break;
        }
        if (query.result?.retryable) await this.wait(Math.min(60000, Math.max(2000, query.result.retryAfterMs)));
        let sent = false, reservationError: unknown;
        try {
          query.result = await this.api.search(query.terms, async () => {
            if (sent) throw new Error("Reserva duplicada de chamada HTTP.");
            sent = true; query.attempts++;
            try { await save(); } catch (error) { reservationError = error; throw error; }
          });
        } catch (error) {
          if (reservationError) throw reservationError;
          query.result = failedResult(query.terms, options.maximumRecords, "invalid", `Falha local na busca: ${(error as Error).message.slice(0, 300)}`);
        }
        await save();
        if (!sent && query.result.retryable) { query.result.retryable = false; break; }
      }
      await save();
    }
    context.status = completedStatus(context);
    context.judgeContext = renderContext(context, options.maxContextCharacters);
    await save();
  }
}
