import { DatabaseSync } from "node:sqlite";
import type { Chunk, CorpusPlan, SourceCapture } from "./types.js";

export function createDatabase(file: string, plan: CorpusPlan, captures: SourceCapture[], chunks: Chunk[]): void {
  const db = new DatabaseSync(file);
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
      CREATE TABLE sources(id TEXT PRIMARY KEY,data TEXT NOT NULL) STRICT;
      CREATE TABLE questions(id TEXT PRIMARY KEY,data TEXT NOT NULL) STRICT;
      CREATE TABLE chunks(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),locator TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,data TEXT NOT NULL) STRICT;
      CREATE VIRTUAL TABLE chunks_fts USING fts5(title,body,content='chunks',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
      BEGIN IMMEDIATE;`);
    const meta = db.prepare("INSERT INTO metadata VALUES (?,?)");
    meta.run("schema_version", "1"); meta.run("corpus_id", plan.id); meta.run("cutoff", plan.cutoff);
    const source = db.prepare("INSERT INTO sources VALUES (?,?)");
    for (const item of captures) source.run(item.id, JSON.stringify(item));
    const scope = db.prepare("INSERT INTO questions VALUES (?,?)");
    for (const q of plan.questions) scope.run(q.id, JSON.stringify(q));
    const insert = db.prepare("INSERT INTO chunks VALUES (?,?,?,?,?,?)");
    for (const chunk of chunks) insert.run(chunk.id, chunk.sourceId, chunk.locator, chunk.title, chunk.text, JSON.stringify(chunk));
    db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild'); COMMIT; PRAGMA integrity_check;");
  } finally { db.close(); }
}
const stop = new Set("para pelo pela pelos pelas como sobre entre quando segundo conforme assinale alternativa correta incorreta incorreto questao questoes direito processo penal parte termos acerca seguinte seguintes afirma afirmar art artigo artigos nao uma que dos das aos seu sua seus suas esta sao sera pode podera devera crime crimes analise item abaixo todas todos qualquer qual quais existe constitui materia instituto tema conhecimento".split(" "));
export function expressionFor(text: string): string {
  const tokens = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  const chosen = [...new Set(tokens.filter(t => !stop.has(t)))].slice(0, 28);
  return chosen.map(t => `"${t}"`).join(" OR ");
}
export function searchDatabase(db: DatabaseSync, text: string, limit = 5, kind?: Chunk["kind"]): { expression: string; chunks: Chunk[] } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Limite de busca local inválido.");
  const expression = expressionFor(text);
  if (!expression) return { expression, chunks: [] };
  const rows = db.prepare("SELECT c.data FROM chunks_fts JOIN chunks c ON c.rowid=chunks_fts.rowid WHERE chunks_fts MATCH ? AND (? IS NULL OR json_extract(c.data,'$.kind')=?) ORDER BY bm25(chunks_fts,4,1),c.id LIMIT ?").all(expression, kind ?? null, kind ?? null, limit * 8);
  const seen = new Set<string>(), chunks: Chunk[] = [];
  for (const row of rows) {
    const chunk = JSON.parse(row.data as string) as Chunk, key = `${chunk.locator}:${chunk.text}`;
    if (!seen.has(key)) { seen.add(key); chunks.push(chunk); }
    if (chunks.length === limit) break;
  }
  return { expression, chunks };
}
