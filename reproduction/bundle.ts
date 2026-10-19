import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { hash } from "../src/utils.js";
import { ConfigSchema, type Prepared, type Reference } from "../src/types.js";
import type { Checkpoint } from "../experiments/no-rag-v19/engine.js";
import { buildArtifacts } from "../delivery/finalize.js";
import { CONFIRMED_OUTSIDE_POLICY } from "../delivery/confirmed-outside.js";

export type Bundle = { version: 1; kind: "offline-delivery-v1" | "vertex-baseline-template-v1"; metadata: Record<string, any>; files: Record<string, string>; hashes: Record<string, string> };
export function bundle(kind: Bundle["kind"], files: Record<string, string>, metadata: Record<string, any>): Bundle {
  return { version: 1, kind, metadata, files, hashes: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, hash(text)])) };
}
export function validateBundle(value: Bundle) {
  if (value.version !== 1 || !["offline-delivery-v1", "vertex-baseline-template-v1"].includes(value.kind) || JSON.stringify(Object.keys(value.files).sort()) !== JSON.stringify(Object.keys(value.hashes).sort())) throw new Error("Pacote de reprodução inválido.");
  for (const [name, text] of Object.entries(value.files)) if (!/^[a-z][a-z0-9.-]*$/.test(name) || typeof text !== "string" || hash(text) !== value.hashes[name]) throw new Error(`Integridade do pacote inválida: ${name}.`);
  return value;
}
export async function readBundle(file: string) { return validateBundle(JSON.parse(gunzipSync(await readFile(file)).toString("utf8"))); }
export async function saveBundle(file: string, value: Bundle) { validateBundle(value); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, gzipSync(JSON.stringify(value), { level: 9 })); }
export function reproduce(value: Bundle) {
  validateBundle(value);
  if (value.kind !== "offline-delivery-v1" || value.metadata.decisionPolicy !== CONFIRMED_OUTSIDE_POLICY) throw new Error("Escolha o pacote de entrega e sua política explícita.");
  const get = <T>(name: string): T => { if (!value.files[name]) throw new Error(`Arquivo ausente: ${name}.`); return JSON.parse(value.files[name]!); };
  const data = get<Prepared>("prepared.json"), checkpoint = get<Checkpoint>("checkpoint.json"), config = ConfigSchema.parse(get("config.json"));
  if (data.questions.length !== 359 || data.questions.some((q, i) => q.id !== `Q${String(i + 1).padStart(4, "0")}`)) throw new Error("O pacote deve conter os 359 IDs em ordem.");
  const result = buildArtifacts(data, checkpoint, config, get<Reference[]>("reference.json"), value.metadata.fingerprint, CONFIRMED_OUTSIDE_POLICY);
  if (hash(result.delivery) !== value.metadata.expectedCsvSha256 || result.delivery !== value.files["publicacao.csv"]) throw new Error("CSV reproduzido difere da entrega conferida.");
  return result;
}
