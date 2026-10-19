import { readFile, mkdir, copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readPlan, hashBytes } from "./import.js";
import { normalizeDoctrine } from "./normalize.js";
import { atomicJson, exists, hash, now, resolveRoot } from "../utils.js";
import type { SourceCapture } from "./types.js";
import { ExtractedBookSchema } from "./book-types.js";

/** Import user-supplied bytes and their reproducible extraction, no network. */
export async function importBook(planFile: string, sourceId: string, input: string, extraction: string) {
  const { plan, planHash, raw } = await readPlan(planFile);
  const source = plan.sources.find(s => s.id === sourceId);
  if (!source || source.kind !== "doutrina") throw new Error("Livro não declarado no plano como doutrina.");
  const original = await readFile(input), text = await readFile(extraction);
  const document = ExtractedBookSchema.parse(JSON.parse(text.toString("utf8")));
  if (hashBytes(original) !== document.inputSha256 || original.length !== document.inputBytes) throw new Error("Extração pertence a outro arquivo de livro.");
  if (source.url !== pathToFileURL(path.resolve(input)).href) throw new Error("Origem do plano diverge do arquivo fornecido.");
  if (document.format === "pdf" ? original.subarray(0, 5).toString() !== "%PDF-" : original.subarray(0, 2).toString() !== "PK") throw new Error("Formato do livro não corresponde aos bytes.");
  const directory = resolveRoot("output/knowledge/staging", plan.id);
  await mkdir(directory, { recursive: true });
  if (await exists(`${directory}/plan.json`)) {
    if (hash(await readFile(`${directory}/plan.json`, "utf8")) !== planHash) throw new Error("Plano de estágio mudou.");
  } else await import("node:fs/promises").then(fs => fs.writeFile(`${directory}/plan.json`, raw));
  const capture: SourceCapture = { ...source, url: source.url!, retrievedAt: now(), status: "ok", httpStatus: null,
    bodyHash: document.inputSha256, rawFile: `${sourceId}-book.body.json`, error: null,
    extraction: { rawFile: `${sourceId}-text.body.json`, bodyHash: hashBytes(text), method: document.method } };
  const chunks = normalizeDoctrine(document, capture);
  if (await exists(`${directory}/${sourceId}.json`)) throw new Error("Livro já importado neste estágio; não sobrescrever.");
  await copyFile(input, `${directory}/${capture.rawFile}`);
  await copyFile(extraction, `${directory}/${capture.extraction!.rawFile}`);
  await atomicJson(`${directory}/${sourceId}.json`, capture);
  return { source: sourceId, format: document.format, units: document.units.length, chunks: chunks.length, inputHash: document.inputSha256, networkCalls: 0 };
}
