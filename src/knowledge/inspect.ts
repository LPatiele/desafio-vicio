import { readFile, writeFile, mkdir } from "node:fs/promises";
import { KnowledgeStore } from "./store.js";
import type { Prepared } from "../types.js";
import { resolveRoot } from "../utils.js";

/** Export an inspectable, offline read-only view of actual SQLite rows. */
export async function inspectSnapshot(snapshot: string, data: Prepared, outputDirectory?: string) {
  const store = await KnowledgeStore.open(snapshot, data);
  try {
    const sourceRows = store.db.prepare("SELECT s.id,s.data,count(c.id) AS chunks FROM sources s LEFT JOIN chunks c ON c.source_id=s.id GROUP BY s.id ORDER BY s.id").all();
    const sources = sourceRows.map(row => ({ ...JSON.parse(row.data as string), chunks: row.chunks }));
    const chunks = store.db.prepare("SELECT data FROM chunks ORDER BY source_id,locator,id").all().map(row => JSON.parse(row.data as string));
    const questions = store.db.prepare("SELECT data FROM questions ORDER BY id").all().map(row => {
      const scope = JSON.parse(row.data as string);
      const question = data.questions.find(q => q.id === scope.id);
      return { ...scope, question, gaps: store.gapsFor(scope.id), documentCount: chunks.filter(c => scope.sources.includes(c.sourceId)).length };
    });
    const payload = JSON.stringify({ id: store.manifest.id, cutoff: store.manifest.cutoff, createdAt: store.manifest.createdAt, hash: store.manifestHash, database: snapshot.replace(/manifest\.json$/, "corpus.sqlite"), sources, chunks, questions }).replaceAll("<", "\\u003c");
    const template = await readFile(resolveRoot("src/knowledge/inspect.html"), "utf8");
    const directory = outputDirectory ?? resolveRoot("output/knowledge/inspection", store.manifest.id);
    await mkdir(directory, { recursive: true });
    const file = `${directory}/index.html`;
    await writeFile(file, template.replace("/*__CORPUS__*/null", () => payload));
    return { file, snapshot: store.manifest.id, sources: sources.length, chunks: chunks.length, questions: questions.length };
  } finally { store.close(); }
}
