import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, appendFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const resolveRoot = (...p: string[]) => path.join(ROOT, ...p);
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const now = () => new Date().toISOString();
export const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8"));
export async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
}
export async function atomicJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, file);
}
export function redact<T>(value: T): T {
  let text = JSON.stringify(value);
  for (const key of ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
    const secret = process.env[key];
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return JSON.parse(text.replace(/sk-(?:or-v1-|proj-|svcacct-)?[a-zA-Z0-9_-]+/g, "[REDACTED]").replace(/AIza[a-zA-Z0-9_-]{20,}/g, "[REDACTED]"));
}
export async function appendJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(redact(value)) + "\n");
}
export function parseModelJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(text);
}
// Validate records independently: one malformed item must not discard valid siblings.
export function parseBatch<T extends { id: string }>(
  raw: string, schema: z.ZodType<T>, expected: string[],
): { valid: T[]; errors: Record<string, string>; unexpected: string[] } {
  const errors: Record<string, string> = {};
  let rows: unknown[];
  try {
    const envelope = parseModelJson(raw) as { resultados?: unknown };
    if (!envelope || !Array.isArray(envelope.resultados)) throw new Error("Envelope resultados ausente.");
    rows = envelope.resultados;
  } catch (e) {
    return { valid: [], errors: Object.fromEntries(expected.map(id => [id, `JSON inválido: ${(e as Error).message}`])), unexpected: [] };
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = (row as { id?: unknown } | null)?.id;
    if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const valid: T[] = [];
  for (const id of expected) {
    if (!counts.has(id)) { errors[id] = "ID ausente na resposta."; continue; }
    if (counts.get(id)! > 1) { errors[id] = "ID duplicado na resposta."; continue; }
    const row = rows.find(r => (r as { id?: unknown } | null)?.id === id);
    const result = schema.safeParse(row);
    if (result.success) valid.push(result.data);
    else errors[id] = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  return { valid, errors, unexpected: [...counts.keys()].filter(id => !expected.includes(id)) };
}
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
