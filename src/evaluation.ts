import { readFile } from "node:fs/promises";
import { decideRecord } from "./retrieval/decision.js";
import { loadOriginalLabels, validateContextCheckpoint } from "./retrieval/context.js";
import { KnowledgeStore, LocalContextService, validateLocalCheckpoint } from "./knowledge/store.js";
import type { Decision, Prepared, RecordState, Reference, Split } from "./types.js";
import { ProposalSchema, VerdictSchema } from "./types.js";
import { indexThemes, relationship } from "./data.js";
import { atomicJson, exists, hash, readJson, resolveRoot } from "./utils.js";
import { experimentDir, type Manifest } from "./runner.js";
import { validateProposal, validateVerdict } from "./validation.js";
import { validateResearchCheckpoint } from "./research/checkpoint.js";

export async function loadExperiment(name: string, data: Prepared) {
  const directory = experimentDir(name);
  const manifest = await readJson<Manifest>(`${directory}/manifest.json`);
  if (JSON.stringify(manifest.inputHashes) !== JSON.stringify(data.inputHashes)) throw new Error("Experimento usa entradas diferentes.");
  const records = await readJson<Record<string, RecordState>>(`${directory}/records.json`);
  const themes = indexThemes(data.themes);
  const questions = new Map(data.questions.map(q => [q.id, q]));
  const originalLabels = manifest.config.retrieval?.enabled || manifest.config.knowledge?.enabled ? await loadOriginalLabels(data) : new Map();
  const localStore = manifest.config.knowledge?.enabled ? await KnowledgeStore.open(resolveRoot(manifest.config.knowledge.snapshot), data) : undefined;
  try {
  if (localStore && (localStore.manifestHash !== manifest.knowledgeIdentity?.manifestHash || localStore.manifest.databaseHash !== manifest.knowledgeIdentity.databaseHash)) throw new Error("Base local difere da identidade congelada no experimento.");
  const localContext = localStore ? new LocalContextService(localStore, data, originalLabels, manifest.config) : undefined;
  for (const [id, record] of Object.entries(records)) {
    const question = questions.get(id);
    if (!question || record.id !== id) throw new Error(`Registro inesperado: ${id}`);
    validateResearchCheckpoint(record, manifest.config);
    validateContextCheckpoint(record, manifest.config, originalLabels.get(id), themes);
    validateLocalCheckpoint(record, manifest.config, localContext);
    if (record.proposal) {
      ProposalSchema.parse(record.proposal);
      if (validateProposal(record.proposal, question, themes).length) throw new Error(`Proposta salva inválida: ${id}`);
    }
    if (record.verdict) {
      VerdictSchema.parse(record.verdict);
      if (!record.proposal || validateVerdict(record.verdict, record.proposal, themes).length) throw new Error(`Parecer salvo inválido: ${id}`);
    }
    if (record.decision) {
      const expected = decideRecord(record, question, themes, manifest.config);
      if (JSON.stringify(expected) !== JSON.stringify(record.decision)) throw new Error(`Decisão difere das regras: ${id}. Não altere checkpoints manualmente.`);
    }
  }
  return { directory, manifest, records };
  } finally { localStore?.close(); }
}
export async function loadReference(data: Prepared, version = "analise-propria-v1") {
  if (!/^analise-propria-v[1-9]\d*$/.test(version)) throw new Error("Versão de referência inválida.");
  const dir = resolveRoot("referencias", version);
  const manifest = await readJson<{ sha256_referencia: string; hashes_entrada: { questoes: string; taxonomia: string } }>(`${dir}/manifesto.json`);
  const text = await readFile(`${dir}/referencia.jsonl`, "utf8");
  if (hash(text) !== manifest.sha256_referencia || data.inputHashes.questions !== manifest.hashes_entrada.questoes || data.inputHashes.themes !== manifest.hashes_entrada.taxonomia) throw new Error("Referência ou entradas divergem do manifesto congelado.");
  const items = text.trim().split(/\r?\n/).map(line => JSON.parse(line) as Reference);
  const expected = new Set(data.questions.map(q => q.id));
  if (items.length !== expected.size || new Set(items.map(r => r.id)).size !== expected.size || items.some(r => !expected.has(r.id))) throw new Error("IDs da referência não correspondem às entradas.");
  const themes = indexThemes(data.themes);
  for (const item of items) {
    const id = item.classificacao.tema_id;
    if (item.classificacao.fora_da_taxonomia !== (id === null) || (id !== null && themes.get(id)?.status !== "active")) throw new Error(`Tema de referência inválido: ${item.id}`);
  }
  return { items, hash: hash(text) };
}
export async function loadSplit(data: Prepared): Promise<Split | null> {
  const file = resolveRoot("output/split.json");
  if (!await exists(file)) return null;
  const split = await readJson<Split>(file);
  const ids = [...split.development, ...split.evaluation];
  if (split.inputHash !== data.inputHashes.questions || new Set(ids).size !== ids.length || ids.length !== data.questions.length || ids.some(id => !data.questions.some(q => q.id === id))) throw new Error("Divisão inválida ou de outra entrada.");
  return split;
}
export async function createSplit(data: Prepared, count: number, seed: string) {
  const file = resolveRoot("output/split.json");
  if (await exists(file)) throw new Error("Divisão já existe; preserve-a para evitar selecionar um teste favorável.");
  if (!Number.isInteger(count) || count < 1 || count >= data.questions.length) throw new Error("Quantidade de desenvolvimento deve ser entre 1 e 358.");
  const ordered = data.questions.map(q => q.id).sort((a, b) => hash(seed + a).localeCompare(hash(seed + b)));
  const split: Split = { seed, inputHash: data.inputHashes.questions!, development: ordered.slice(0, count), evaluation: ordered.slice(count) };
  await atomicJson(file, split);
  return { development: count, evaluation: ordered.length - count, file };
}
export function wilson(hits: number, total: number): [number, number] | null {
  if (!total) return null;
  const p = hits / total, z = 1.96, d = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / d;
  const radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export type ComparisonRow = {
  id: string; decisao: string | null; tema_proposto: string | null;
  tema_final: string | null; tema_referencia: string | null;
  relacao_proposta: string | null; relacao_final: string | null;
  referencia_limitada: boolean; raiz: boolean; exposicao_previa: boolean; aviso_entrada: boolean;
};
export const matchesBranch = (relation: string | null) => ["exato", "ancestral", "descendente"].includes(relation ?? "");
export function metrics(rows: ComparisonRow[], totalUniverse: number) {
  const proposals = rows.filter(r => r.relacao_proposta !== null);
  const published = rows.filter(r => r.decisao === "publicar");
  const hits = published.filter(r => matchesBranch(r.relacao_final)).length;
  const acceptedOutside = rows.filter(r => r.decisao === "fora");
  const withoutFilterHits = proposals.filter(r => matchesBranch(r.relacao_proposta) || r.relacao_proposta === "fora").length;
  return {
    questions: rows.length,
    processed: rows.filter(r => r.decisao).length,
    published: published.length, reviewed: rows.filter(r => r.decisao === "revisar").length,
    outside: acceptedOutside.length,
    coverageAmongSelected: rows.length ? published.length / rows.length : null,
    coverageOf359: published.length / totalUniverse,
    publishedAgreement: published.length ? hits / published.length : null,
    publishedAgreementHits: hits,
    publishedAgreementWilson95: wilson(hits, published.length),
    exactPublishedAgreement: published.length ? published.filter(r => r.relacao_final === "exato").length / published.length : null,
    classifierAgreementBeforeFilter: proposals.length ? withoutFilterHits / proposals.length : null,
    classifierAgreementDenominator: proposals.length,
    publishedRelationships: Object.fromEntries(["exato", "ancestral", "descendente", "irmao", "distinto"].map(rel => [rel, published.filter(r => r.relacao_final === rel).length])),
    outsideAgreement: acceptedOutside.length ? acceptedOutside.filter(r => r.relacao_final === "fora").length / acceptedOutside.length : null,
  };
}
export async function evaluate(name: string, data: Prepared, selectedIds: string[], subset: string, referenceVersion = "analise-propria-v1") {
  const experiment = await loadExperiment(name, data);
  const reference = await loadReference(data, referenceVersion);
  const index = indexThemes(data.themes);
  const byId = new Map(reference.items.map(r => [r.id, r]));
  const rows: ComparisonRow[] = selectedIds.map(id => {
    const r = experiment.records[id];
    const ref = byId.get(id)!;
    const proposed = r?.proposal?.tema_central_id ?? null;
    const final = r?.decision?.tema_central_id ?? null;
    return {
      id, decisao: r?.decision?.decisao ?? null, tema_proposto: proposed, tema_final: final,
      tema_referencia: ref.classificacao.tema_id,
      relacao_proposta: r?.proposal ? relationship(proposed, ref.classificacao.tema_id, index) : null,
      relacao_final: r?.decision ? relationship(final, ref.classificacao.tema_id, index) : null,
      referencia_limitada: ref.conferencia.possui_ressalva || !!ref.conferencia.fontes_pendentes.length || !!ref.classificacao.limite_especifico,
      raiz: ref.classificacao.nivel === 0 || (!!final && index.get(final)?.nivel === 0),
      exposicao_previa: ref.exposicao_previa_a_rotulos_ou_pilotos,
      aviso_entrada: !!data.questions.find(q => q.id === id)?.avisos.length,
    };
  });
  const report = {
    experiment: name, subset, referenceVersion, referenceHash: reference.hash,
    nature: "Concordância com referência provisória; não demonstra precisão jurídica real nem garante 95%.",
    intervalLimit: "Wilson descreve incerteza amostral sob hipótese binomial; não corrige erros da referência, dependência entre itens ou seleção para ajustes. Para este conjunto fixo, a concordância observada é exata.",
    overall: metrics(rows, data.questions.length),
    sensitivity: {
      withoutBroadRoots: metrics(rows.filter(r => !r.raiz), data.questions.length),
      withoutReferenceLimitations: metrics(rows.filter(r => !r.raiz && !r.referencia_limitada), data.questions.length),
      withoutPreviouslyExposed: metrics(rows.filter(r => !r.exposicao_previa), data.questions.length),
      withoutInputWarnings: metrics(rows.filter(r => !r.aviso_entrada), data.questions.length),
    },
    rows,
  };
  await atomicJson(`${experiment.directory}/evaluation-${subset}${referenceVersion === "analise-propria-v1" ? "" : `-${referenceVersion}`}.json`, report);
  return report;
}
export type Calibration = {
  fingerprint: string; referenceHash: string; splitHash: string; developmentIds: string[];
  method: string; minimum: number;
  groups: Record<string, { n: number; hits: number; estimate: number | null; interval: [number, number] | null }>;
};
export async function calibrate(name: string, data: Prepared, minimum = 20) {
  const split = await loadSplit(data);
  if (!split) throw new Error("Calibração exige divisão explícita de desenvolvimento e avaliação. Consulte split:data.");
  const report = await evaluate(name, data, split.development, "development");
  const experiment = await loadExperiment(name, data);
  const splitHash = hash(await readFile(resolveRoot("output/split.json"), "utf8"));
  if (experiment.manifest.splitHash !== splitHash) throw new Error("A divisão precisa existir antes de iniciar o experimento.");
  if (report.rows.some(r => !r.decisao)) throw new Error("Conclua todas as questões de desenvolvimento antes de calibrar.");
  const groups: Calibration["groups"] = {};
  for (const group of ["publicar", "revisar"]) {
    const rows = report.rows.filter(r => r.decisao === group && r.tema_final !== null);
    const hits = rows.filter(r => matchesBranch(r.relacao_final)).length;
    groups[group] = { n: rows.length, hits, estimate: rows.length >= minimum ? (hits + 1) / (rows.length + 2) : null, interval: wilson(hits, rows.length) };
  }
  const result: Calibration = { fingerprint: experiment.manifest.fingerprint, referenceHash: report.referenceHash, splitHash, developmentIds: split.development, minimum, groups,
    method: "Estimativa agrupada por decisão, suavização de Laplace (acertos+1)/(n+2), usando somente desenvolvimento. Estima concordância provisória, sem validação externa da probabilidade real." };
  await atomicJson(`${experiment.directory}/calibration.json`, result);
  return result;
}
