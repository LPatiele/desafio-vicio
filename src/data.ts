import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { parse } from "csv-parse/sync";
import type { Prepared, Question, Theme } from "./types.js";
import { atomicJson, hash, readJson, resolveRoot } from "./utils.js";

export function cleanHtml(value: string): string {
  const $ = load(value);
  $("script,style,xml,head,meta,link").remove();
  $("br").replaceWith("\n");
  $("p,div,li,tr").append("\n");
  return $.root().text().replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}
export function indexThemes(themes: Theme[]): Map<string, Theme> {
  const index = new Map<string, Theme>();
  for (const t of themes) {
    if (index.has(t.tema_id)) throw new Error(`Tema duplicado: ${t.tema_id}`);
    index.set(t.tema_id, t);
  }
  for (const t of themes) {
    const seen = new Set([t.tema_id]);
    let id = t.parent_id;
    while (id) {
      if (seen.has(id)) throw new Error(`Ciclo na árvore: ${t.tema_id}`);
      seen.add(id);
      const parent = index.get(id);
      if (!parent) throw new Error(`Pai ausente: ${id}`);
      id = parent.parent_id;
    }
  }
  return index;
}
export function ancestors(id: string, themes: Map<string, Theme>): string[] {
  const result: string[] = [];
  let next = themes.get(id)?.parent_id;
  while (next) { result.push(next); next = themes.get(next)?.parent_id; }
  return result;
}
export function relationship(proposed: string | null, expected: string | null, themes: Map<string, Theme>): string {
  if (proposed === expected) return proposed === null ? "fora" : "exato";
  if (!proposed || !expected) return "distinto";
  if (ancestors(expected, themes).includes(proposed)) return "ancestral";
  if (ancestors(proposed, themes).includes(expected)) return "descendente";
  if (themes.get(proposed)?.parent_id && themes.get(proposed)?.parent_id === themes.get(expected)?.parent_id) return "irmao";
  return "distinto";
}
export async function prepareData(): Promise<Prepared> {
  const questionText = await readFile(resolveRoot("anexos/questoes.jsonl"), "utf8");
  const themeText = await readFile(resolveRoot("anexos/temas.csv"), "utf8");
  const themes = (parse(themeText, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[])
    .map(t => ({ ...t, nivel: Number(t.nivel) }) as Theme);
  indexThemes(themes);
  const cleaning: Prepared["cleaning"] = [];
  const seen = new Set<string>();
  const questions: Question[] = questionText.trim().split(/\r?\n/).map(line => {
    const q = JSON.parse(line) as { id: string; enunciado_html: string; comando: string; alternativas: Record<string, string> };
    if (!/^Q\d{4}$/.test(q.id) || seen.has(q.id)) throw new Error(`ID inválido ou duplicado: ${q.id}`);
    seen.add(q.id);
    if (typeof q.enunciado_html !== "string" || typeof q.comando !== "string" || !q.alternativas || Array.isArray(q.alternativas) || typeof q.alternativas !== "object") throw new Error(`Questão malformada: ${q.id}`);
    const alternatives = Object.fromEntries(Object.entries(q.alternativas).map(([key, text]) => {
      if (typeof text !== "string") throw new Error(`Alternativa inválida: ${q.id}/${key}`);
      return [key, cleanHtml(text)];
    }));
    const warnings: string[] = [];
    if (!cleanHtml(q.enunciado_html)) warnings.push("enunciado_vazio");
    if (Object.keys(alternatives).length < 2 || Object.values(alternatives).some(v => !v)) warnings.push("alternativas_incompletas");
    if (Object.values({ enunciado: q.enunciado_html, ...q.alternativas }).some(v => /<img\b/i.test(v))) warnings.push("imagem_requer_conferencia");
    const result = { id: q.id, enunciado: cleanHtml(q.enunciado_html), comando: cleanHtml(q.comando), alternativas: alternatives, avisos: warnings };
    cleaning.push({ id: q.id, before: JSON.stringify(q).length, after: JSON.stringify(result).length, warnings });
    return result;
  });
  if (questions.length !== 359) throw new Error(`Esperadas 359 questões; encontradas ${questions.length}.`);
  const data: Prepared = { version: 1, inputHashes: { questions: hash(questionText), themes: hash(themeText) }, questions, themes, cleaning };
  await atomicJson(resolveRoot("output/prepared.json"), data);
  return data;
}
export async function loadData(): Promise<Prepared> {
  // Always compare the actual inputs, not only a potentially stale prepared file.
  const data = await readJson<Prepared>(resolveRoot("output/prepared.json"));
  for (const [key, file] of [["questions", "anexos/questoes.jsonl"], ["themes", "anexos/temas.csv"]]) {
    if (hash(await readFile(resolveRoot(file!), "utf8")) !== data.inputHashes[key!]) throw new Error("Entradas mudaram. Execute prepare:data novamente.");
  }
  return data;
}
