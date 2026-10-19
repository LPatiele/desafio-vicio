import { XMLParser, XMLValidator } from "fast-xml-parser";
import { atomicJson, exists, hash, now, readJson, resolveRoot } from "../utils.js";
import { SharedRateLimiter, retryHintMs, type RequestLimiter } from "../rate-limit.js";
import { ApiResultSchema, type ApiResult, type LegalDocument } from "./types.js";
import type { Config } from "../types.js";

export const LEXML_ENDPOINT = "https://www.lexml.gov.br/busca/SRU";
export function cqlQuery(terms: string): string {
  const text = terms.replace(/\s+/g, " ").trim();
  if (!text || text.length > 500 || /[\u0000-\u001f]/.test(text)) throw new Error("Termos de pesquisa inválidos.");
  return `cql.serverChoice all "${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
export function searchUrl(terms: string, maximumRecords: number): string {
  if (!Number.isInteger(maximumRecords) || maximumRecords < 1 || maximumRecords > 5) throw new Error("Busca limitada a cinco documentos.");
  const url = new URL(LEXML_ENDPOINT);
  url.search = new URLSearchParams({ operation: "searchRetrieve", version: "1.1", recordSchema: "dc", query: cqlQuery(terms), startRecord: "1", maximumRecords: String(maximumRecords) }).toString();
  return url.href;
}
const array = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function texts(value: unknown): string[] {
  return array(value).flatMap(v => typeof v === "string" ? [v.trim()] : typeof v === "number" ? [String(v)] : v && typeof v === "object" && "#text" in v ? texts((v as Record<string, unknown>)["#text"]) : []).filter(Boolean);
}
export function parseSru(xml: string, maximumRecords: number): Pick<ApiResult, "total" | "documents"> {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DTD/entidades externas não são aceitas.");
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`XML inválido: ${validation.err.msg}`);
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, trimValues: true }).parse(xml) as Record<string, unknown>;
  const root = parsed.searchRetrieveResponse as Record<string, unknown> | undefined;
  if (!root || typeof root !== "object") throw new Error("Resposta não é searchRetrieveResponse SRU.");
  if (root.diagnostics) throw new Error(`Diagnóstico SRU: ${JSON.stringify(root.diagnostics).slice(0, 500)}`);
  const count = texts(root.numberOfRecords)[0];
  if (!count || !/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) throw new Error("numberOfRecords ausente ou inválido.");
  const records = array((root.records as Record<string, unknown> | undefined)?.record);
  if (records.length > maximumRecords) throw new Error("API excedeu o número de registros solicitado.");
  const documents: LegalDocument[] = records.flatMap(record => {
    const rd = (record as Record<string, unknown>)?.recordData as Record<string, unknown> | undefined;
    const dc = (rd?.dc ?? rd) as Record<string, unknown> | undefined;
    if (!dc || typeof dc !== "object") return [];
    const urn = texts(dc.urn)[0] ?? texts(dc.identifier).find(v => v.startsWith("urn:lex:"));
    if (!urn || !/^urn:lex:[a-zA-Z0-9:;._~%+@!/-]+$/.test(urn)) return [];
    return [{ urn, title: texts(dc.title).join("; "), summary: texts(dc.description).join("\n"), subjects: texts(dc.subject), date: texts(dc.date)[0] ?? null, url: `https://www.lexml.gov.br/urn/${encodeURI(urn)}` }];
  });
  const total = Number(count);
  if ((total > 0 && !documents.length) || total < documents.length) throw new Error("Totais e documentos identificáveis são inconsistentes.");
  return { total, documents };
}
export function failedResult(terms: string, limit: number, status: ApiResult["status"], error: string): ApiResult {
  return { status, query: cqlQuery(terms), sourceUrl: searchUrl(terms, limit), retrievedAt: now(), httpStatus: null, contentType: null, total: null, documents: [], bodyHash: null, error, retryable: false, retryAfterMs: 0, cacheHit: false };
}
export type ApiSearch = { search(terms: string, beforeNetwork: () => Promise<void>): Promise<ApiResult> };
export class LexmlApi implements ApiSearch {
  calls = 0;
  constructor(readonly config: NonNullable<Config["retrieval"]>, readonly cacheDirectory = resolveRoot("output/retrieval-cache/lexml"),
    readonly limiter: RequestLimiter = new SharedRateLimiter(resolveRoot("output/rate-limit/lexml-api.json"), { requestsPerMinute: 18, minIntervalMs: 2000 }), readonly request: typeof fetch = fetch) {}
  async search(terms: string, beforeNetwork: () => Promise<void>): Promise<ApiResult> {
    const url = searchUrl(terms, this.config.maximumRecords);
    const file = `${this.cacheDirectory}/${hash(`lexml-direct-v1:${url}`)}.json`;
    if (await exists(file)) {
      const cached = await readJson<{ result: ApiResult; rawXml: string; rawHash: string }>(file);
      const result = ApiResultSchema.parse(cached.result);
      const age = Date.now() - Date.parse(result.retrievedAt);
      if (!["ok", "empty"].includes(result.status) || result.sourceUrl !== url || result.bodyHash !== cached.rawHash || hash(cached.rawXml) !== cached.rawHash || !Number.isFinite(age)) throw new Error("Cache LexML inválido ou alterado.");
      const parsed = parseSru(cached.rawXml, this.config.maximumRecords);
      if (JSON.stringify(parsed.documents) !== JSON.stringify(result.documents) || parsed.total !== result.total || result.status !== (parsed.documents.length ? "ok" : "empty")) throw new Error("Metadados do cache divergem do XML original.");
      if (age >= 0 && age <= this.config.cacheTtlMs) return { ...result, cacheHit: true };
    }
    await this.limiter.acquire();
    await beforeNetwork(); // reserve durably after waiting, immediately before fetch
    this.calls++;
    let response: Response, raw: string;
    const base = failedResult(terms, this.config.maximumRecords, "network_error", "Falha de rede.");
    try {
      response = await this.request(url, { headers: { Accept: "application/xml, text/xml;q=0.9", "User-Agent": "classificacao-topicos-juridicos/0.1 (LexML SRU client)" }, signal: AbortSignal.timeout(this.config.timeoutMs), redirect: "manual" });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > this.config.maxResponseBytes) { await reader.cancel(); return { ...base, status: "oversized", error: "Resposta excede limite de bytes.", httpStatus: response.status, contentType: response.headers.get("content-type") }; }
        chunks.push(value);
      }
      raw = Buffer.concat(chunks).toString("utf8");
    } catch (error) { return { ...base, error: `Falha de rede: ${(error as Error).name}.`, retryable: true }; }
    const result = { ...base, retrievedAt: now(), httpStatus: response.status, contentType: response.headers.get("content-type"), bodyHash: hash(raw) };
    if (!response.ok) {
      const wait = retryHintMs(response.headers) ?? (response.status === 429 ? 60000 : 2000);
      if (response.status === 429) await this.limiter.deferUntil(Date.now() + wait);
      return { ...result, status: "http_error", error: `LexML respondeu HTTP ${response.status}.`, retryable: [408, 429, 500, 502, 503, 504].includes(response.status), retryAfterMs: wait };
    }
    if (/text\/html/i.test(result.contentType ?? "") || /<html\b|<!doctype\s+html/i.test(raw.slice(0, 12000))) return { ...result, status: "challenge", error: "LexML devolveu HTML, possivelmente de verificação, não resultados XML." };
    let parsed;
    try { parsed = parseSru(raw, this.config.maximumRecords); }
    catch (error) { return { ...result, status: "invalid", error: (error as Error).message }; }
    const success: ApiResult = { ...result, ...parsed, status: parsed.documents.length ? "ok" : "empty", error: null };
    await atomicJson(file, { result: success, rawXml: raw, rawHash: hash(raw) });
    return success;
  }
}
