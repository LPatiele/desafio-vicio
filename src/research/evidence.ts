import type { Message } from "../client.js";
import { hash } from "../utils.js";

export type ResearchStatus = "ok" | "empty" | "challenge" | "error" | "invalid" | "oversized";
export type EvidenceResult = { status: ResearchStatus; payload: unknown; sources: { id: string; title: string; url: string | null; urn: string | null; kind: "metadata_only"; record: unknown }[]; retryable: boolean };
export type ResearchOperation = {
  toolCallId: string; name: string; rawArguments: string; args?: Record<string, unknown>;
  attempts: number; state: "pending" | "complete"; cacheKey?: string; result?: EvidenceResult;
  durationMs?: number; cacheHit?: boolean;
};
export type ResearchState = {
  status: "running" | "complete" | "unavailable" | "exhausted";
  messages: Message[]; operations: ResearchOperation[]; sourcesUsed: string[];
};
export function normalizeEvidence(raw: unknown, maxCharacters: number): EvidenceResult {
  const invalid = (status: ResearchStatus, payload: unknown, retryable = false): EvidenceResult => ({ status, payload, sources: [], retryable });
  const serialized = JSON.stringify(raw);
  if (typeof serialized !== "string") return invalid("invalid", { error: "Resposta MCP ausente." });
  // MCP can duplicate the same payload in structuredContent and text content.
  if (serialized.length > maxCharacters * 3) return invalid("oversized", { error: "Envelope excede limite de conteúdo." });
  if (!raw || typeof raw !== "object") return invalid("invalid", { error: "Resposta MCP sem objeto." });
  const envelope = raw as { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
  let payload = envelope.structuredContent ?? raw;
  if (!envelope.structuredContent && Array.isArray(envelope.content)) {
    const texts = envelope.content.filter(c => c.type === "text" && typeof c.text === "string").map(c => c.text!).join("\n");
    try { payload = JSON.parse(texts); } catch { return invalid("invalid", { error: "Resposta textual MCP não contém JSON." }); }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return invalid("invalid", { error: "Payload MCP inválido." });
  if (JSON.stringify(payload).length > maxCharacters) return invalid("oversized", { error: "Resultado excede limite de conteúdo." });
  let p = payload as Record<string, unknown>;
  if (p.is_challenge_like === true || (p.error && typeof p.error === "object" && (p.error as Record<string, unknown>).is_challenge_like === true)) return invalid("challenge", payload);
  if (envelope.isError || p.error || p.error_type || p.success === false) {
    const errorType = JSON.stringify(p.error ?? p.error_type ?? p);
    return invalid("error", payload, /timeout|network_error|HTTP 50[234]/i.test(errorType));
  }
  // Refuse arbitrary objects/HTML as successful search responses.
  if (!p.provenance || typeof p.provenance !== "object") return invalid("invalid", { error: "Proveniência ausente.", response: payload });
  if (Array.isArray(p.documentos)) {
    p = { ...p, records: p.documentos, number_of_records: p.total_resultados };
    delete p.documentos; delete p.total_resultados;
    payload = p;
  }
  if (p.valida === true && typeof p.url_resolvedor === "string" && p.resolution_verified === false) return { status: "ok", payload, sources: [{ id: `S-${hash(JSON.stringify(p)).slice(0, 12)}`, title: "URN validada offline; URL não verificada", url: p.url_resolvedor, urn: typeof p.urn === "string" ? p.urn : null, kind: "metadata_only", record: p }], retryable: false };
  if (p.public_url && typeof p.public_url === "string") {
    if (typeof p.status_code !== "number" || p.status_code < 200 || p.status_code >= 400) return invalid("invalid", { error: "Resolução de URN não verificada.", response: payload });
    return { status: "ok", payload, sources: [{ id: `S-${hash(JSON.stringify(p)).slice(0, 12)}`, title: "Resolução de URN", url: p.public_url, urn: null, kind: "metadata_only", record: p }], retryable: false };
  }
  if (!Array.isArray(p.records) || p.records.length > 5 || !Number.isInteger(p.number_of_records) || Number(p.number_of_records) < p.records.length || p.records.some(r => !r || typeof r !== "object" || Array.isArray(r))) return invalid("invalid", { error: "Contrato de busca desconhecido.", response: payload });
  if (!p.records.length) return p.number_of_records === 0 ? invalid("empty", payload) : invalid("invalid", { error: "Busca não vazia sem registros.", response: payload });
  const sources = p.records.map(record => {
    const r = record && typeof record === "object" ? record as Record<string, unknown> : {};
    const text = JSON.stringify(record);
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : typeof value === "string" ? [value] : [];
    const values = strings(r);
    const url = values.find(v => /^https:\/\//.test(v)) ?? null;
    const urn = values.find(v => v.startsWith("urn:lex:")) ?? null;
    return { id: `S-${hash(text).slice(0, 12)}`, title: strings(r.title ?? r["dc:title"] ?? r.titulo)[0] ?? "Registro LexML", url, urn, kind: "metadata_only" as const, record };
  });
  return { status: "ok", payload, sources, retryable: false };
}
export function citedSources(raw: string, operations: ResearchOperation[]): string[] {
  const cited = [...new Set(raw.match(/S-[a-f0-9]{12}/g) ?? [])];
  const known = new Set(operations.flatMap(o => o.result?.sources.map(s => s.id) ?? []));
  if (cited.some(id => !known.has(id))) throw new Error("Parecer cita ID de fonte externa não recuperada.");
  return cited;
}
