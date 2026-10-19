import { readFile, mkdir, copyFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PlanSchema, type CorpusPlan, type SourceCapture, type Snapshot, type Chunk } from "./types.js";
import { normalizeNorm, normalizePrecedents, normalizeDoctrine } from "./normalize.js";
import { createDatabase } from "./database.js";
import { loadData } from "../data.js";
import { normalizeHtml, officialHtml, camaraHtml } from "./html.js";
import { atomicJson, exists, hash, now, readJson, resolveRoot, sleep } from "../utils.js";

export const hashBytes = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
export async function readPlan(file: string) {
  const raw = await readFile(file, "utf8"), plan = PlanSchema.parse(JSON.parse(raw));
  const ids = new Set(plan.sources.map(s => s.id));
  if (ids.size !== plan.sources.length || new Set(plan.questions.map(q => q.id)).size !== plan.questions.length || plan.questions.some(q => q.sources.some(id => !ids.has(id)) || Object.keys(q.articles).some(id => !q.sources.includes(id)))) throw new Error("Plano contém IDs duplicados ou fontes não declaradas.");
  for (const source of plan.sources) if (source.kind === "norma" ? !source.urn?.startsWith("urn:lex:br:") : source.kind === "doutrina" ? !source.url : !source.query?.trim()) throw new Error("Plano sem URN/consulta/URL de origem.");
  return { plan, planHash: hash(raw), raw };
}
function requestFor(source: CorpusPlan["sources"][number]) {
  if (source.kind === "norma" && source.url) return { url: source.url };
  if (source.kind === "doutrina") return { url: source.url! };
  if (source.kind === "norma") return { url: `https://normas.leg.br/api/public/normas?${new URLSearchParams({ urn: source.urn!, tipo_documento: "maior-detalhe" })}` };
  return { url: "https://pangeabnp.pdpj.jus.br/api/v1/precedentes", requestBody: { filtro: { buscaGeral: source.query, todasPalavras: "", quaisquerPalavras: "", semPalavras: "", trechoExato: "", atualizacaoDesde: "", atualizacaoAte: "", cancelados: false, ordenacao: "Text", nr: "", pagina: 1, tamanhoPagina: 5, orgaos: ["STJ", "STF"], tipos: ["SUM", "SV", "RG", "RR", "IRDR", "IAC", "ADI", "ADC", "ADO", "ADPF"] } } };
}
export async function fetchSources(file: string, retryFailed = false) {
  const { plan, planHash, raw } = await readPlan(file);
  const data = await loadData();
  if (JSON.stringify(plan.selection.inputHashes) !== JSON.stringify(data.inputHashes) || plan.questions.some(q => !data.questions.some(item => item.id === q.id))) throw new Error("Plano pertence a outras entradas.");
  const directory = resolveRoot("output/knowledge/staging", plan.id);
  await mkdir(directory, { recursive: true });
  const lock = `${directory}/plan.json`;
  if (await exists(lock) && hash(await readFile(lock, "utf8")) !== planHash) throw new Error("Plano mudou: use outro ID de base.");
  if (!await exists(lock)) await atomicJson(lock, JSON.parse(raw));
  // atomicJson's formatting is canonical; subsequent invocations compare the exact serialized plan.
  if (hash(await readFile(lock, "utf8")) !== planHash) throw new Error("Plano precisa usar JSON formatado com dois espaços e newline final.");
  let networkCalls = 0;
  for (const source of plan.sources) {
    const metadataFile = `${directory}/${source.id}.json`;
    if (await exists(metadataFile)) {
      const saved = await readJson<SourceCapture>(metadataFile);
      if (saved.status === "ok" && saved.rawFile && hashBytes(await readFile(`${directory}/${saved.rawFile}`)) !== saved.bodyHash) throw new Error("Captura anterior alterada.");
      if (saved.status === "ok" || !retryFailed) continue;
    }
    const request = requestFor(source);
    const capture: SourceCapture = { ...source, ...request, retrievedAt: now(), status: "error", httpStatus: null, bodyHash: null, rawFile: null, error: null };
    try {
      await sleep(3000); networkCalls++;
      const directHtml = source.kind === "norma" && !!source.url;
      const response = await fetch(request.url, { method: request.requestBody ? "POST" : "GET", headers: { Accept: directHtml ? "text/html" : "application/json", "Content-Type": "application/json", "User-Agent": "Desafio-local-corpus/0.1" }, ...(request.requestBody ? { body: JSON.stringify(request.requestBody) } : {}), signal: AbortSignal.timeout(30000), redirect: "error" });
      capture.httpStatus = response.status;
      const reader = response.body?.getReader(); const parts: Uint8Array[] = []; let size = 0;
      if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16_000_000) { await reader.cancel(); throw new Error("Fonte excede 16 MB."); } parts.push(value); }
      const body = Buffer.concat(parts);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      capture.rawFile = `${source.id}.body.json`; capture.bodyHash = hashBytes(body);
      if (directHtml) {
        if (!/html/i.test(response.headers.get("content-type") ?? "")) throw new Error("Ato não retornou HTML.");
        capture.supplement = { url: request.url, retrievedAt: capture.retrievedAt, rawFile: capture.rawFile, bodyHash: capture.bodyHash, httpStatus: response.status, error: null, encoding: "utf-8" };
        if (!normalizeHtml(body.toString("utf8"), capture, plan).length) throw new Error("Ato sem artigos extraíveis.");
      } else {
        if (!/json/i.test(response.headers.get("content-type") ?? "")) throw new Error("Fonte não retornou JSON; possível página de proteção.");
        const data = JSON.parse(body.toString("utf8"));
        if (source.kind === "norma" && data.legislationIdentifier !== source.urn) throw new Error("Identificador da norma diverge do solicitado.");
        if (source.kind === "precedente" && (!Array.isArray(data.resultados) || typeof data.total !== "number")) throw new Error("Resposta não contém precedentes identificáveis.");
      }
      await import("node:fs/promises").then(fs => fs.writeFile(`${directory}/${capture.rawFile}`, body));
      capture.status = "ok";
    } catch (error) { capture.error = (error as Error).message; }
    await atomicJson(metadataFile, capture);
    console.error(`${source.id}: ${capture.status}${capture.error ? ` (${capture.error})` : ""}`);
  }
  return { directory, networkCalls, sources: plan.sources.length };
}
export async function importerHash(): Promise<string> {
  const files = (await readdir(resolveRoot("src/knowledge"))).filter(f => f.endsWith(".ts")).sort();
  return hash((await Promise.all(files.map(async f => `${f}:${hash(await readFile(resolveRoot("src/knowledge", f), "utf8"))}`))).join("\n"));
}
export async function fetchHtmlSupplements(file: string, provider: "planalto" | "camara" | "senado" = "planalto", retryFailed = false) {
  const { plan } = await readPlan(file), directory = resolveRoot("output/knowledge/staging", plan.id);
  let networkCalls = 0;
  for (const source of plan.sources.filter(s => s.kind === "norma" && !s.url && (provider === "senado" || officialHtml[s.id]))) {
    const captureFile = `${directory}/${source.id}.json`, capture = await readJson<SourceCapture>(captureFile);
    if (capture.status !== "ok" || !capture.rawFile) continue;
    const json = await readJson<any>(`${directory}/${capture.rawFile}`);
    if (json.hasPart) continue;
    const encodings = Array.isArray(json.encoding) ? json.encoding : [];
    const encoding = encodings.find((e: any) => e.version === "Current" && /html/i.test(e.encodingFormat ?? ""))
      ?? encodings.find((e: any) => /html/i.test(e.encodingFormat ?? ""));
    const targetUrl = provider === "senado" ? encoding?.contentUrl : (provider === "camara" ? camaraHtml : officialHtml)[source.id];
    if (!targetUrl || (provider === "senado" && new URL(targetUrl).hostname !== "normas.leg.br")) continue;
    if (capture.supplement && (!capture.supplement.error || capture.supplement.url === targetUrl && !retryFailed)) continue;
    if (capture.supplement) (capture.supplementHistory ??= []).push(capture.supplement);
    const supplement: NonNullable<SourceCapture["supplement"]> = { url: targetUrl, retrievedAt: now(), rawFile: null, bodyHash: null, httpStatus: null, error: null, encoding: "utf-8" };
    capture.supplement = supplement;
    try {
      await sleep(3000); networkCalls++;
      const response = await fetch(supplement.url, { headers: { Accept: "text/html", "User-Agent": "Desafio-local-corpus/0.1" }, signal: AbortSignal.timeout(30000), redirect: "follow" });
      if (!["www.planalto.gov.br", "planalto.gov.br", "www2.camara.leg.br", "www.camara.leg.br", "normas.leg.br", "legis.senado.leg.br"].includes(new URL(response.url).hostname)) throw new Error("Redirecionamento para fonte não autorizada.");
      supplement.url = response.url; supplement.httpStatus = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader(), parts: Uint8Array[] = []; let size = 0;
      if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8_000_000) { await reader.cancel(); throw new Error("HTML excede 8 MB."); } parts.push(value); }
      const body = Buffer.concat(parts);
      const header = body.subarray(0, 5000).toString("ascii");
      supplement.encoding = /charset\s*=\s*["']?(?:iso-8859-1|windows-1252)/i.test(header) ? "windows-1252" : "utf-8";
      const html = new TextDecoder(supplement.encoding).decode(body);
      supplement.rawFile = `${source.id}-html.body.json`; // raw bytes; suffix is kept uniform for snapshot validation
      supplement.bodyHash = hashBytes(body);
      await import("node:fs/promises").then(fs => fs.writeFile(`${directory}/${supplement.rawFile}`, body));
      if (!normalizeHtml(html, capture, plan).length) throw new Error("Nenhum artigo do recorte encontrado.");
    } catch (error) { supplement.error = `${(error as Error).message}${(error as any).cause?.code ? ` (${(error as any).cause.code})` : ""}`; }
    await atomicJson(captureFile, capture);
    console.error(`${source.id} HTML: ${supplement.error ?? "ok"}`);
  }
  return { directory, networkCalls };
}
export async function buildSnapshot(file: string) {
  const { plan, planHash, raw } = await readPlan(file);
  const data = await loadData();
  if (JSON.stringify(plan.selection.inputHashes) !== JSON.stringify(data.inputHashes)) throw new Error("Plano pertence a outras entradas.");
  const staging = resolveRoot("output/knowledge/staging", plan.id), target = resolveRoot("output/knowledge/snapshots", plan.id);
  if (await exists(target)) throw new Error("Versão já congelada. Use outro ID; não sobrescreva a base de um experimento.");
  const captures: SourceCapture[] = [], chunks: Chunk[] = [], rawFiles: { path: string; hash: string }[] = [];
  for (const source of plan.sources) {
    const capture = await readJson<SourceCapture>(`${staging}/${source.id}.json`);
    if (JSON.stringify({ ...capture, retrievedAt: undefined, status: undefined, httpStatus: undefined, bodyHash: undefined, rawFile: undefined, error: undefined, supplement: undefined, supplementHistory: undefined, extraction: undefined }) !== JSON.stringify({ ...source, ...requestFor(source) })) throw new Error("Metadados de origem divergem do plano.");
    captures.push(capture);
    if (capture.status !== "ok") continue;
    const body = await readFile(`${staging}/${capture.rawFile}`);
    if (hashBytes(body) !== capture.bodyHash) throw new Error("Corpo de origem alterado.");
    const extracted = capture.extraction ? await readFile(`${staging}/${capture.extraction.rawFile}`) : null;
    if (extracted && hashBytes(extracted) !== capture.extraction!.bodyHash) throw new Error("Extração do livro alterada.");
    const directHtml = source.kind === "norma" && !!source.url;
    if (!directHtml) {
      const data = JSON.parse((extracted ?? body).toString("utf8"));
      chunks.push(...(source.kind === "norma" ? normalizeNorm(data, capture, plan) : source.kind === "doutrina" ? normalizeDoctrine(data, capture) : normalizePrecedents(data, capture, plan.cutoff)));
    }
    rawFiles.push({ path: `raw/${capture.rawFile}`, hash: capture.bodyHash! });
    if (capture.extraction) rawFiles.push({ path: `raw/${capture.extraction.rawFile}`, hash: capture.extraction.bodyHash });
    if (capture.supplement?.rawFile && !capture.supplement.error) {
      const supplement = capture.supplement, bytes = await readFile(`${staging}/${supplement.rawFile}`);
      if (hashBytes(bytes) !== supplement.bodyHash) throw new Error("Texto HTML de origem alterado.");
      chunks.push(...normalizeHtml(new TextDecoder(supplement.encoding).decode(bytes), capture, plan));
      if (supplement.rawFile !== capture.rawFile) rawFiles.push({ path: `raw/${supplement.rawFile}`, hash: supplement.bodyHash! });
    }
  }
  const unique = [...new Map(chunks.map(c => [c.id, c])).values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!unique.length) throw new Error("Nenhum texto utilizável: base não será publicada vazia.");
  const temp = `${target}.building-${process.pid}`;
  await mkdir(`${temp}/raw`, { recursive: true });
  for (const rawFile of rawFiles) await copyFile(`${staging}/${path.basename(rawFile.path)}`, `${temp}/${rawFile.path}`);
  const chunkText = unique.map(c => JSON.stringify(c)).join("\n") + "\n";
  const fs = await import("node:fs/promises");
  await fs.writeFile(`${temp}/chunks.jsonl`, chunkText); await fs.writeFile(`${temp}/plan.json`, raw);
  createDatabase(`${temp}/corpus.sqlite`, plan, captures, unique);
  const snapshot: Snapshot = { version: 1, id: plan.id, createdAt: now(), cutoff: plan.cutoff, planHash, inputHashes: plan.selection.inputHashes, database: "corpus.sqlite", databaseHash: hashBytes(await readFile(`${temp}/corpus.sqlite`)), chunksFile: "chunks.jsonl", chunksHash: hash(chunkText), importerHash: await importerHash(), counts: { sources: captures.length, successfulSources: captures.filter(s => s.status === "ok").length, chunks: unique.length, questions: plan.questions.length }, scope: plan.questions, captures, rawFiles };
  await atomicJson(`${temp}/manifest.json`, snapshot);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(temp, target);
  return { directory: target, ...snapshot.counts, failedSources: captures.filter(s => s.status !== "ok").map(s => ({ id: s.id, error: s.error })) };
}
