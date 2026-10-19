import { cleanHtml } from "../data.js";
import { hash } from "../utils.js";
import type { Chunk, CorpusPlan, SourceCapture } from "./types.js";
import { ExtractedBookSchema } from "./book-types.js";

const array = (v: any): any[] => v == null ? [] : Array.isArray(v) ? v : [v];
function chunk(source: SourceCapture, locator: string, title: string, text: string, versionDate: string | null, metadata: Record<string, unknown>, url: string): Chunk {
  const contentHash = hash(JSON.stringify({ locator, title, text, versionDate, metadata, url }));
  return { id: `S-${hash(source.id + contentHash).slice(0, 12)}`, sourceId: source.id, kind: source.kind, locator, title, text, versionDate, url, metadata, contentHash };
}
export function normalizeNorm(data: any, source: SourceCapture, plan: CorpusPlan): Chunk[] {
  if (data.legislationIdentifier !== source.urn || !data.hasPart) return [];
  const allowed = new Set(plan.questions.flatMap(q => q.articles[source.id] ?? []).map(s => s.toLowerCase().replaceAll("-", "")));
  const allArticles = allowed.has("*");
  const groups = new Map<string, { title: string; texts: string[]; versions: unknown[] }>();
  function walk(node: any, headings: string[]): void {
    for (const n of array(node)) {
      if (!n || typeof n !== "object") continue;
      const locator = String(n.legislationIdentifier ?? "");
      const article = locator.match(/!art([0-9]+[a-z-]*)(?:_|$)/i)?.[1]?.toLowerCase();
      const examples = array(n.workExample);
      const names = [n.name, ...examples.map(w => w?.name)].filter((v): v is string => typeof v === "string" && !/^Art\./i.test(v));
      const path = [...headings, ...names.slice(-1)].slice(-5);
      if (article && (allArticles || allowed.has(article.replaceAll("-", "")))) {
        // Select by source dates, retaining temporal/force metadata; not a legal assertion of validity.
        const valid = examples.filter(w => {
          if (typeof w?.text !== "string" || (typeof w.legislationDate === "string" && w.legislationDate > plan.cutoff)) return false;
          const periods = array(w.temporalCoverage).filter((v): v is string => typeof v === "string");
          return !periods.length || periods.some(period => {
            const [start, end] = period.split("/");
            return (!start || start <= plan.cutoff) && (!end || end >= plan.cutoff);
          });
        });
        valid.sort((a, b) => String(b.legislationDate ?? "").localeCompare(String(a.legislationDate ?? "")));
        const selected = valid[0];
        if (selected) {
          const text = cleanHtml(selected.text);
          if (text) {
            const g = groups.get(article) ?? { title: `${source.title} — Art. ${article}${path.length ? ` — ${path.join(" > ")}` : ""}`, texts: [], versions: [] };
            const label = n.name ?? selected.name ?? locator.split("!")[1];
            g.texts.push(`${label}: ${text}`);
            g.versions.push({ locator: selected.legislationIdentifier, date: selected.legislationDate ?? null, period: selected.temporalCoverage ?? null, force: selected.legislationLegalForce ?? null, type: selected.legislationType ?? null });
            groups.set(article, g);
          }
        }
      }
      walk(n.hasPart, path);
    }
  }
  walk(data.hasPart, []);
  const result: Chunk[] = [];
  for (const [article, g] of groups) {
    const locator = `${source.urn}!art${article}`;
    const text = g.texts.join("\n");
    // Preserve all clauses; bounded adjacent parts keep long articles searchable without losing text.
    const parts: string[] = text.match(/[\s\S]{1,5000}(?:\n|$)/g) ?? [];
    if (parts.join("") !== text) { // Regex cannot consume an uninterrupted very long line.
      parts.length = 0; for (let i = 0; i < text.length; i += 5000) parts.push(text.slice(i, i + 5000));
    }
    for (let i = 0; i < parts.length; i++) result.push(chunk(source, `${locator}${parts.length > 1 ? `#parte${i + 1}` : ""}`, g.title, parts[i]!, null, { cutoff: plan.cutoff, clauses: g.versions, validity: "seleção por datas fornecidas; vigência e interpretação exigem conferência", part: i + 1, parts: parts.length }, `https://normas.leg.br/?urn=${locator}`));
  }
  return result;
}
export function normalizePrecedents(data: any, source: SourceCapture, cutoff: string): Chunk[] {
  if (!Array.isArray(data.resultados) || typeof data.total !== "number") throw new Error("Resposta BNP inválida.");
  return data.resultados.flatMap((r: any) => {
    if (!r.id || !r.orgao || !r.tipo || r.nr == null) return [];
    const thesis = cleanHtml(typeof r.tese === "string" ? r.tese : "");
    const question = cleanHtml(typeof r.questao === "string" ? r.questao : "");
    if ((!thesis || /^(não informado|sem tese|n\/a)$/i.test(thesis)) && !question) return [];
    const date = typeof r.ultimaAtualizacao === "string" ? r.ultimaAtualizacao.split("/").reverse().join("-") : null;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date > cutoff) return [];
    const url = array(r.processosParadigma).map(p => p?.link).find(v => typeof v === "string" && /^https:\/\//.test(v)) ?? "https://pangeabnp.pdpj.jus.br/";
    return [chunk(source, String(r.id), `${r.orgao} — ${r.tipo} ${r.nr}`, `Tese: ${thesis || "não informada"}${question ? `\nQuestão: ${question}` : ""}`, date, { status: r.situacao ?? null, type: r.tipo, court: r.orgao, number: r.nr, query: source.query, nature: "tese ou questão submetida; não inteiro teor", historicalStatusNotReconstructed: true }, url)];
  });
}

/** Only extracted book text; no generated summaries or labels are indexed. */
export function normalizeDoctrine(data: any, source: SourceCapture): Chunk[] {
  if (data.units) {
    const document = ExtractedBookSchema.parse(data);
    if (source.kind !== "doutrina" || document.inputSha256 !== source.bodyHash) throw new Error("Documento doutrinário pertence a outra fonte.");
    const result: Chunk[] = [];
    const { chapters: _chapters, ...bibliography } = document.metadata;
    for (const [index, unit] of document.units.entries()) {
      const text = unit.text.trim();
      if (text.length < 80) continue;
      const where = unit.format === "pdf" ? `pagina${unit.page}` : `capitulo${unit.chapterNumber}!secao${index + 1}`;
      const heading = unit.format === "pdf" ? `${unit.chapter} — página PDF ${unit.page}` : `Capítulo ${unit.chapterNumber}: ${unit.chapter} — ${unit.section}`;
      const url = unit.format === "pdf" ? `${source.url}#page=${unit.page}` : `${source.url}#${encodeURIComponent(`${unit.path}${unit.sectionId ? `#${unit.sectionId}` : ""}`)}`;
      for (let offset = 0; offset < text.length; offset += 1800) {
        const part = offset / 1800 + 1;
        const metadata = { nature: "doutrina; interpretação do autor, não legislação nem precedente", format: unit.format,
          author: unit.author, chapter: unit.chapter, chapterNumber: unit.chapterNumber, part,
          ...(unit.format === "pdf" ? { pdfPage: unit.page } : { epubPath: unit.path, section: unit.section, sectionId: unit.sectionId, pagination: "sem página física estável" }),
          originalHash: document.inputSha256, extractorHash: document.extractorSha256, extraction: document.method, license: source.license ?? "arquivo fornecido para consulta local", bibliography };
        result.push(chunk(source, `livro:${source.id}!${where}#parte${part}`, `${source.title} — ${unit.author} — ${heading}`, text.slice(offset, offset + 2000), null, metadata, url));
        // A final window already contains the remaining text; do not index a
        // short duplicate tail (often only footnotes) as another document.
        if (offset + 2000 >= text.length) break;
      }
    }
    if (!result.length) throw new Error("Livro sem texto pesquisável; conferir necessidade de OCR.");
    return result;
  }
  if (!Array.isArray(data.pages) || !data.pages.length || source.kind !== "doutrina") throw new Error("Livro sem páginas extraídas identificáveis.");
  const result: Chunk[] = [];
  for (const page of data.pages) {
    if (!Number.isInteger(page.page) || page.page < 1 || typeof page.text !== "string") throw new Error("Página de livro inválida.");
    const text = page.text.trim();
    if (text.length < 80) continue;
    for (let offset = 0; offset < text.length; offset += 1800) {
      const part = offset / 1800 + 1;
      result.push(chunk(source, `livro:${source.id}!pagina${page.page}#parte${part}`, `${source.title} — página PDF ${page.page}`, text.slice(offset, offset + 2000), null,
        { nature: "doutrina; opinião dos autores, não legislação nem precedente", pdfPage: page.page, part, license: source.license ?? "arquivo fornecido para consulta local; conferir direitos antes de distribuir", pdfHash: source.bodyHash, extraction: source.extraction?.method ?? data.method, sourceTitle: source.title }, `${source.url}#page=${page.page}`));
    }
  }
  if (!result.length) throw new Error("Livro sem texto pesquisável; conferir necessidade de OCR.");
  return result;
}
