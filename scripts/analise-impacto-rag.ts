/** Recalcula métricas e retira apenas o veto local; não executa inferência. */
import { readFile } from "node:fs/promises";
import { loadData, indexThemes, relationship } from "../src/data.js";
import { evaluate, loadExperiment, matchesBranch, metrics } from "../src/evaluation.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { atomicJson, hash, now } from "../src/utils.js";

const name = process.argv[2] ?? "local-penal50-v7";
const baselineName = process.argv[3] ?? "individual-v3-invertido-50";
const data = await loadData();
const current = await loadExperiment(name, data);
const baseline = await loadExperiment(baselineName, data);
const ids = Object.keys(current.records).sort();
const left = await evaluate(baselineName, data, ids, "exploratorio");
const right = await evaluate(name, data, ids, "exploratorio");
const themes = indexThemes(data.themes);
const questions = new Map(data.questions.map(q => [q.id, q]));
const leftRows = new Map(left.rows.map(r => [r.id, r]));
const rightRows = new Map(right.rows.map(r => [r.id, r]));
const published = (side: typeof current, id: string) => side.records[id]?.decision?.decisao === "publicar";
const cohort = (selected: string[], side: "left" | "right") => ({
  ids: selected,
  count: selected.length,
  branchMatches: selected.filter(id => matchesBranch((side === "left" ? leftRows : rightRows).get(id)!.relacao_final)),
  branchDisagreements: selected.filter(id => !matchesBranch((side === "left" ? leftRows : rightRows).get(id)!.relacao_final)),
});
const commonIds = ids.filter(id => leftRows.get(id)!.decisao && rightRows.get(id)!.decisao);
const noGateConfig = structuredClone(current.manifest.config);
if (!noGateConfig.knowledge?.enabled) throw new Error("Experimento precisa usar base local.");
noGateConfig.knowledge.requireContextForPublication = false;
const gateChanges: unknown[] = [];
const noGateRows = right.rows.map(row => {
  const record = current.records[row.id]!;
  const decision = decideRecord(record, questions.get(row.id)!, themes, noGateConfig);
  if (JSON.stringify(decision) !== JSON.stringify(record.decision ?? null)) gateChanges.push({ id: row.id, actual: record.decision ?? null, withoutGate: decision, reference: row.tema_referencia });
  return { ...row, decisao: decision?.decisao ?? null, tema_final: decision?.tema_central_id ?? null,
    relacao_final: decision ? relationship(decision.tema_central_id, row.tema_referencia, themes) : null };
});
const citedPublished = right.rows.filter(row => row.decisao === "publicar" && current.records[row.id]!.knowledge!.sourcesUsed.length);
const uncitedPublished = right.rows.filter(row => row.decisao === "publicar" && !current.records[row.id]!.knowledge!.sourcesUsed.length);
const removed = cohort(ids.filter(id => published(baseline, id) && !published(current, id)), "left");
const added = cohort(ids.filter(id => !published(baseline, id) && published(current, id)), "right");
const retained = cohort(ids.filter(id => published(baseline, id) && published(current, id)), "right");
if (left.overall.published - removed.count + added.count !== right.overall.published ||
    left.overall.publishedAgreementHits - removed.branchMatches.length + added.branchMatches.length !== right.overall.publishedAgreementHits)
  throw new Error("Decomposição inconsistente.");
const result = {
  at: now(), experiment: name, baseline: baselineName, selectedIds: ids,
  interpretation: "Comparação observacional com referência provisória. Retirada do veto é uma simulação determinística sobre pareceres fixos; não é julgamento sem RAG.",
  referenceHash: right.referenceHash,
  identity: { currentRecordsHash: hash(await readFile(`${current.directory}/records.json`, "utf8")),
    baselineRecordsHash: hash(await readFile(`${baseline.directory}/records.json`, "utf8")),
    knowledge: current.manifest.knowledgeIdentity, currentPrompts: current.manifest.promptHashes },
  all50: { baseline: left.overall, current: right.overall },
  paired: { ids: commonIds, baseline: metrics(left.rows.filter(row => commonIds.includes(row.id)), data.questions.length),
    current: metrics(right.rows.filter(row => commonIds.includes(row.id)), data.questions.length) },
  publicationChanges: { removed, added, retained },
  localGapGate: { actual: right.overall, withoutGate: metrics(noGateRows, data.questions.length), changes: gateChanges },
  citationSubgroups: { caution: "Subgrupos definidos pela saída do próprio modelo; não são braços randomizados de RAG.",
    withCitation: metrics(citedPublished, data.questions.length), withoutCitation: metrics(uncitedPublished, data.questions.length),
    withCitationIds: citedPublished.map(r => r.id), withoutCitationIds: uncitedPublished.map(r => r.id) },
  deltas: { published: right.overall.published - left.overall.published,
    branchAgreementPercentagePoints: 100 * (right.overall.publishedAgreement! - left.overall.publishedAgreement!),
    exactAgreementPercentagePoints: 100 * (right.overall.exactPublishedAgreement! - left.overall.exactPublishedAgreement!),
    coveragePercentagePoints: 100 * (right.overall.coverageAmongSelected! - left.overall.coverageAmongSelected!),
    correctPublished: right.overall.publishedAgreementHits - left.overall.publishedAgreementHits,
    discordantPublished: (right.overall.published - right.overall.publishedAgreementHits) - (left.overall.published - left.overall.publishedAgreementHits) },
  newModelCalls: 0,
};
await atomicJson(`${current.directory}/impacto-rag.json`, result);
console.log(JSON.stringify({ file: `${current.directory}/impacto-rag.json`, deltas: result.deltas,
  withoutGate: result.localGapGate.withoutGate, removed, added, retained, newModelCalls: 0 }, null, 2));
