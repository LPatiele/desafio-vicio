import { parseArgs } from "node:util";
import { getConfig } from "../config.js";
import { loadData } from "../data.js";
import { atomicJson, resolveRoot } from "../utils.js";
import { buildSnapshot, fetchSources, fetchHtmlSupplements } from "./import.js";
import { KnowledgeStore, LocalContextService } from "./store.js";
import { loadOriginalLabels } from "../retrieval/context.js";
import { importProposals } from "../runner.js";
import { inspectSnapshot } from "./inspect.js";
import { importBook } from "./books.js";

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { plan: { type: "string", default: "knowledge/plans/desafio359-v6-livros.json" }, snapshot: { type: "string", default: "output/knowledge/snapshots/desafio359-v6-livros/manifest.json" }, query: { type: "string" }, source: { type: "string" }, file: { type: "string" }, extraction: { type: "string" }, "retry-failed": { type: "boolean", default: false } } });
  if (positionals[0] === "import-book") {
    if (!values.source || !values.file || !values.extraction) throw new Error("import-book exige --source, --file e --extraction.");
    return importBook(values.plan!, values.source, values.file, values.extraction);
  }
  if (positionals[0] === "fetch") return fetchSources(values.plan!, values["retry-failed"]);
  if (positionals[0] === "fetch-html") return fetchHtmlSupplements(values.plan!, positionals[1] === "senado" ? "senado" : positionals[1] === "camara" ? "camara" : "planalto", values["retry-failed"]);
  if (positionals[0] === "build") return buildSnapshot(values.plan!);
  const data = await loadData();
  if (positionals[0] === "inspect") return inspectSnapshot(values.snapshot!, data);
  const store = await KnowledgeStore.open(values.snapshot!, data);
  try {
    if (positionals[0] === "search") return store.search(values.query ?? "Tribunal do Júri");
    if (positionals[0] === "coverage" || positionals[0] === "check") {
      const labels = await loadOriginalLabels(data);
      const rows = data.questions.map(question => {
        const scope = store.manifest.scope.find(q => q.id === question.id);
        if (!scope) return { id: question.id, inScope: false, retrieved: 0, plannedSourceMatches: 0, gaps: ["Questão ausente do escopo."], results: [] };
        const query = [question.enunciado, question.comando, ...Object.values(question.alternativas)].join(" ");
        const candidates = [...store.search(query, 6).chunks, ...store.search(labels.get(question.id)?.assunto || query, 3).chunks];
        const results = [...new Map(candidates.map(c => [c.id, c])).values()].slice(0, 9);
        return { id: question.id, inScope: true, retrieved: results.length, plannedSourceMatches: results.filter(c => scope.sources.includes(c.sourceId)).length, gaps: store.gapsFor(question.id), results: results.map(c => ({ id: c.id, sourceId: c.sourceId, title: c.title, url: c.url, text: c.text.slice(0, 400) })) };
      });
      const report = { snapshot: store.manifest.id, manifestHash: store.manifestHash, questions: rows.length, inScope: rows.filter(r => r.inScope).length, withRetrievedContext: rows.filter(r => r.retrieved).length, withPlannedSourceCandidates: rows.filter(r => r.plannedSourceMatches).length, withDeclaredGaps: rows.filter(r => r.gaps.length).length, manuallyValidatedCoverage: false, warning: "Presença de candidatos e associação a fonte planejada não demonstram suficiência jurídica ou acerto temático.", modelCalls: 0, networkCalls: 0, rows };
      const file = resolveRoot("output/knowledge/checks", `${store.manifest.id}-coverage.json`);
      await atomicJson(file, report);
      return { ...report, rows: undefined, report: file };
    }
    if (positionals[0] !== "check-proposals") throw new Error("Comandos: import-book, fetch, fetch-html, build, search, check, coverage, inspect, check-proposals (legado).");
    const config = await getConfig(resolveRoot("config/individual-v6-local.json"));
    const ids = store.manifest.scope.map(q => q.id);
    const imported = await importProposals("individual-v3-invertido-50", data, ids);
    const service = new LocalContextService(store, data, await loadOriginalLabels(data), config);
    const rows = ids.map(id => {
      const context = service.make(data.questions.find(q => q.id === id)!, imported.records[id]!.proposal!);
      return { id, status: context.status, gaps: context.gaps, sources: context.chunks.map(c => ({ id: c.id, locator: c.locator, title: c.title })), contextCharacters: context.judgeContext.length, context };
    });
    const report = { snapshot: store.manifest.id, manifestHash: store.manifestHash, questions: rows.length, withRetrievedContext: rows.filter(r => r.status === "retrieved").length, withDeclaredGaps: rows.filter(r => r.gaps.length).length, manuallyValidatedCoverage: false, modelCalls: 0, networkCalls: 0, rows };
    const file = resolveRoot("output/knowledge/checks", `${store.manifest.id}.json`);
    await atomicJson(file, report);
    return { ...report, rows: undefined, report: file };
  } finally { store.close(); }
}
main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error({ error: (error as Error).message }); process.exitCode = 1; });
