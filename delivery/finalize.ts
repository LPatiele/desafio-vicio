import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { cleanHtml, indexThemes, loadData, relationship } from "../src/data.js";
import { loadReference, matchesBranch, metrics, type ComparisonRow } from "../src/evaluation.js";
import type { Config, Prepared, RecordState, Reference } from "../src/types.js";
import { ProposalSchema, VerdictSchema } from "../src/types.js";
import { geminiBody } from "../src/providers/direct.js";
import { csvCell, exists, hash, now, readJson, resolveRoot } from "../src/utils.js";
import { verifyCheckpoint, type Checkpoint } from "../experiments/no-rag-v19/engine.js";
import { CONFIRMED_OUTSIDE_POLICY, verifyConfirmedOutside } from "./confirmed-outside.js";

export const DELIVERY_HEADER = ["id", "decisao", "tema_central_id", "extras_ids", "confianca", "motivo"];
const correct = (relation: string | null) => matchesBranch(relation) || relation === "fora";
const exact = (relation: string | null) => relation === "exato" || relation === "fora";
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";

/** Repeated finalization accepts only byte-identical output and matching provenance. */
export async function saveDelivery(directory: string, rootCsv: string, files: Record<string, string>, identity: { fingerprint: string; sourceHashes: Record<string, string>; referenceHash: string; [key: string]: unknown }) {
  if (await exists(rootCsv) && await readFile(rootCsv, "utf8") !== files["publicacao.csv"]) throw new Error("publicacao.csv da raiz pertence a outra entrega. Preserve-o antes de substituir.");
  const outputHashes = Object.fromEntries(Object.entries(files).map(([file, content]) => [file, hash(content)]));
  const reused = await exists(directory);
  if (reused) {
    const previous = await readJson<typeof identity & { outputHashes: Record<string, string> }>(`${directory}/exportacao.json`);
    for (const key of ["fingerprint", "sourceHashes", "referenceHash"] as const) if (JSON.stringify(previous[key]) !== JSON.stringify(identity[key])) throw new Error("Entrega existente pertence a outras fontes. Use --name para outra versão.");
    if (JSON.stringify(previous.outputHashes) !== JSON.stringify(outputHashes)) throw new Error("Conteúdo da entrega mudou. Use --name para outra versão.");
  } else {
    await mkdir(directory, { recursive: true });
    for (const [file, content] of Object.entries(files)) await writeFile(`${directory}/${file}`, content);
    await writeFile(`${directory}/exportacao.json`, JSON.stringify({ at: now(), ...identity, outputHashes }, null, 2) + "\n");
  }
  for (const [file, content] of Object.entries(files)) if (await readFile(`${directory}/${file}`, "utf8") !== content) throw new Error(`Arquivo exportado diverge: ${file}.`);
  await writeFile(rootCsv, files["publicacao.csv"]!);
  return reused;
}

/** Pure post-processing. The reference cannot change any proposal, verdict or decision. */
export function buildArtifacts(data: Prepared, checkpoint: Checkpoint, config: Config, reference: Reference[], fingerprint: string, decisionPolicy?: typeof CONFIRMED_OUTSIDE_POLICY) {
  if (decisionPolicy !== undefined && decisionPolicy !== CONFIRMED_OUTSIDE_POLICY) throw new Error("Política de decisão desconhecida.");
  (decisionPolicy ? verifyConfirmedOutside : verifyCheckpoint)(checkpoint, fingerprint, data, config);
  const records = checkpoint.records;
  const missing = data.questions.filter(q => !records[q.id]?.decision);
  if (missing.length) throw new Error(`Entrega bloqueada: ${missing.length} questões pendentes.`);
  const refs = new Map(reference.map(r => [r.id, r]));
  if (refs.size !== reference.length || refs.size !== data.questions.length || data.questions.some(q => !refs.has(q.id))) throw new Error("IDs da referência não correspondem às questões.");
  const themes = indexThemes(data.themes);
  for (const ref of reference) {
    const id = ref.classificacao.tema_id;
    if (ref.classificacao.fora_da_taxonomia !== (id === null) || id !== null && themes.get(id)?.status !== "active") throw new Error(`Referência inválida: ${ref.id}.`);
  }
  const rows: ComparisonRow[] = data.questions.map(q => {
    const r = records[q.id]!, ref = refs.get(q.id)!;
    return {
      id: q.id, decisao: r.decision!.decisao, tema_proposto: r.proposal!.tema_central_id,
      tema_final: r.decision!.tema_central_id, tema_referencia: ref.classificacao.tema_id,
      relacao_proposta: relationship(r.proposal!.tema_central_id, ref.classificacao.tema_id, themes),
      relacao_final: relationship(r.decision!.tema_central_id, ref.classificacao.tema_id, themes),
      referencia_limitada: ref.conferencia.possui_ressalva || !!ref.conferencia.fontes_pendentes.length || !!ref.classificacao.limite_especifico,
      raiz: ref.classificacao.nivel === 0 || !!r.decision!.tema_central_id && themes.get(r.decision!.tema_central_id)?.nivel === 0,
      exposicao_previa: ref.exposicao_previa_a_rotulos_ou_pilotos, aviso_entrada: !!q.avisos.length,
    };
  });
  const cohort = (selected: ComparisonRow[], field: "relacao_final" | "relacao_proposta" = "relacao_final") => {
    const branchHits = selected.filter(r => correct(r[field])).length;
    const exactHits = selected.filter(r => exact(r[field])).length;
    return { denominator: selected.length, branchOrOutsideHits: branchHits, exactOrOutsideHits: exactHits,
      branchOrOutsideAgreement: selected.length ? branchHits / selected.length : null,
      exactOrOutsideAgreement: selected.length ? exactHits / selected.length : null };
  };
  const overall = metrics(rows, data.questions.length);
  const evaluation = {
    nature: "Concordância exploratória com referência própria provisória, não gabarito oficial nem precisão jurídica validada.",
    definitions: {
      publicationPrecision: "Somente publicadas: exato, ancestral e descendente contam como concordância. Irmãos são erro. Extras não corrigem tema central.",
      publicationCoverage: "Número de publicadas dividido por todas as questões, incluindo revisar e fora no denominador.",
      cohorts: "Nos recortes gerais, fora concordante também conta como destino correto. Revisar avalia a sugestão, sem tratá-la como publicação.",
      confidence: "Confiança subjetiva do classificador, sem calibração. Em fora, 0 indica ausência de tema central, não descrença na exclusão.",
      interval: "Wilson é descritivo sob hipótese binomial; não corrige erros da referência, seleção para ajustes ou dependência entre itens.",
    }, overall,
    cohorts: {
      allClassifierProposals: cohort(rows, "relacao_proposta"), allFinalSuggestions: cohort(rows),
      published: cohort(rows.filter(r => r.decisao === "publicar")),
      review: cohort(rows.filter(r => r.decisao === "revisar")),
      outside: cohort(rows.filter(r => r.decisao === "fora")),
    },
    target: { minimum: 0.95, observedAgreementMeetsTarget: overall.publishedAgreement === null ? null : overall.publishedAgreement >= 0.95 },
    sensitivity: {
      withoutBroadRoots: metrics(rows.filter(r => !r.raiz), data.questions.length),
      withoutReferenceLimitations: metrics(rows.filter(r => !r.raiz && !r.referencia_limitada), data.questions.length),
      withoutPreviouslyExposed: metrics(rows.filter(r => !r.exposicao_previa), data.questions.length),
      withoutInputWarnings: metrics(rows.filter(r => !r.aviso_entrada), data.questions.length),
    }, rows,
  };
  const delivery = csv(DELIVERY_HEADER, data.questions.map(q => {
    const d = records[q.id]!.decision!;
    if (d.decisao !== "publicar" && !d.motivo.trim()) throw new Error(`Motivo obrigatório: ${q.id}.`);
    return [d.id, d.decisao, d.tema_central_id, d.extras_ids.join(";"), (d.decisao === "fora" ? 0 : d.confianca_declarada).toFixed(4), d.motivo];
  }));
  // Reparse the actual serialized bytes to check escaping, columns and row count.
  const parsed = parse(delivery, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  if (parsed.length !== data.questions.length || parsed.some((r, i) => r.id !== data.questions[i]!.id || Object.keys(r).join() !== DELIVERY_HEADER.join())) throw new Error("CSV não preservou o contrato de entrega.");
  const divergences = rows.filter(r => !exact(r.relacao_proposta) || !exact(r.relacao_final));
  const divergenceCsv = csv(["id", "decisao", "tema_proposto", "tema_final", "tema_referencia", "relacao_proposta", "relacao_final", "divergencia_de_ramo", "referencia_limitada", "motivo"],
    divergences.map(r => [r.id, r.decisao, r.tema_proposto, r.tema_final, r.tema_referencia, r.relacao_proposta, r.relacao_final, !correct(r.relacao_final), r.referencia_limitada, records[r.id]!.decision!.motivo]));
  return { delivery, divergenceCsv, evaluation };
}

type Manifest = { version: number; mode: string; fingerprint: string; ids: string[]; inputHashes: Prepared["inputHashes"]; config: Config; classifierModel: string; judgeModel: string; decisionPolicy?: typeof CONFIRMED_OUTSIDE_POLICY };
export async function finalize(suite = "model-only-v19-359", name = suite, options: { version: 19 | 20; decisionPolicy?: typeof CONFIRMED_OUTSIDE_POLICY } = { version: 19 }) {
  if (![suite, name].every(v => /^[a-z0-9-]{1,60}$/.test(v))) throw new Error("Nome inválido para suíte ou entrega.");
  const source = resolveRoot(options.version === 20 ? "output/individual-v20" : "output/no-rag-v19", suite), directory = resolveRoot("output/delivery", name);
  const rootCsv = options.version === 20 ? `${source}/publicacao.csv` : resolveRoot("publicacao.csv");
  if (await exists(`${source}/run.lock`)) throw new Error("Aguarde o encerramento da execução antes de finalizar.");
  const data = await loadData();
  if (data.questions.length !== 359) throw new Error("A entrega deste desafio exige as 359 questões.");
  const manifest = await readJson<Manifest>(`${source}/manifest.json`);
  if (manifest.decisionPolicy !== options.decisionPolicy) throw new Error("A política escolhida difere da política explícita do manifesto.");
  if (manifest.version !== options.version || manifest.mode !== "models_only" || JSON.stringify(manifest.inputHashes) !== JSON.stringify(data.inputHashes) || JSON.stringify(manifest.ids) !== JSON.stringify(data.questions.map(q => q.id))) throw new Error("Manifesto não corresponde à versão escolhida, à execução completa ou às entradas atuais.");
  const checkpoint = await readJson<Checkpoint>(`${source}/checkpoint.json`);
  const mirror = await readJson<Record<string, RecordState>>(`${source}/records.json`);
  if (JSON.stringify(mirror) !== JSON.stringify(checkpoint.records)) throw new Error("records.json diverge do checkpoint autoritativo.");
  // Check that prepared text still corresponds to the untouched original annexes.
  const originals = (await readFile(resolveRoot("anexos/questoes.jsonl"), "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
  for (const [i, q] of data.questions.entries()) {
    const raw = originals[i];
    if (q.id !== raw.id || q.enunciado !== cleanHtml(raw.enunciado_html) || q.comando !== cleanHtml(raw.comando) || JSON.stringify(q.alternativas) !== JSON.stringify(Object.fromEntries(Object.entries(raw.alternativas as Record<string, string>).map(([k, v]) => [k, cleanHtml(v)])))) throw new Error(`Preparação diverge do original: ${q.id}.`);
  }
  const rawThemes = (parse(await readFile(resolveRoot("anexos/temas.csv"), "utf8"), { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[]).map(t => ({ ...t, nivel: Number(t.nivel) }));
  if (JSON.stringify(rawThemes) !== JSON.stringify(data.themes)) throw new Error("Taxonomia preparada diverge do anexo original.");
  const reference = await loadReference(data, "analise-propria-v2");
  const artifacts = buildArtifacts(data, checkpoint, manifest.config, reference.items, manifest.fingerprint, options.decisionPolicy);
  const requests = (await readFile(`${source}/requests.jsonl`, "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const starts = requests.filter(r => r.phase === "start");
  // Audit actual native requests rather than trusting only the configuration flags.
  const messages = await import("../experiments/no-rag-v19/engine.js");
  const prompts = await readJson<{ classifier: string; judge: string }>(`${source}/prompts.json`);
  for (const request of starts) {
    if (!["classifier", "judge"].includes(request.role) || request.body.tools || request.body.toolConfig) throw new Error("Requisição contém ferramentas ou papel inesperado.");
    const role = request.role as "classifier" | "judge";
    const expectedMessages = messages.messagesFor(role, request.ids, checkpoint.records, data, manifest.config, prompts);
    const schema = z.object({ resultados: z.array(role === "classifier" ? ProposalSchema : VerdictSchema).min(1).max(manifest.config.batchSize) }).strict();
    const expectedBody = geminiBody(request.model, manifest.config.direct![role], expectedMessages, schema);
    if (JSON.stringify(request.body.systemInstruction) !== JSON.stringify(expectedBody.systemInstruction)) throw new Error("Taxonomia ou prompt da requisição difere da configuração salva.");
    const input = JSON.parse(request.body.contents[0].parts[0].text).questoes;
    if (JSON.stringify(input.map((item: { questao: { id: string } }) => item.questao.id)) !== JSON.stringify(request.ids)) throw new Error("IDs enviados não correspondem ao corpo da requisição.");
    for (const item of input) {
      const q = data.questions.find(q => q.id === item.questao.id);
      if (!q || JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(request.role === "judge" ? ["proposta", "questao"] : ["questao"]) || JSON.stringify(item.questao) !== JSON.stringify(q)) throw new Error("Questão enviada contém dados inesperados ou não preparados.");
      if (request.role === "judge" && JSON.stringify(item.proposta) !== JSON.stringify(checkpoint.records[q.id]!.proposal)) throw new Error("Juiz recebeu proposta diferente da salva.");
    }
  }
  const audit = {
    preparation: { questions: data.questions.length, originalsPreserved: true, inputHashes: data.inputHashes, activeThemes: data.themes.filter(t => t.status === "active").length, inactiveThemesExcludedFromModelTaxonomy: true },
    classifier: { model: manifest.classifierModel, proposals: data.questions.length },
    validation: { checkpointValidated: true, proposalsAndVerdictsValidated: true, decisionsRecomputedAndMatched: true, actualRequestsAudited: starts.length },
    judge: { model: manifest.judgeModel, verdicts: data.questions.length, rubrics: ["tema_central", "evidencia_textual", "distincao_de_concorrentes"] },
    decision: { ...artifacts.evaluation.overall, pending: 0, ...(options.decisionPolicy ? { policy: options.decisionPolicy, details: await readJson(`${source}/decision-policy.json`) } : {}) },
    evaluation: { referenceVersion: "analise-propria-v2", referenceHash: reference.hash, usedOnlyAfterInference: true },
    delivery: { rows: data.questions.length, columns: DELIVERY_HEADER, confidenceMode: "declared", forecastGenerated: false },
  };
  const sourceHashes: Record<string, string> = {};
  for (const file of ["manifest.json", "checkpoint.json", "records.json", "prompts.json", "requests.jsonl"]) sourceHashes[file] = hash(await readFile(`${source}/${file}`, "utf8"));
  if (options.decisionPolicy) sourceHashes["decision-policy.json"] = hash(await readFile(`${source}/decision-policy.json`, "utf8"));
  const evaluation = { experiment: suite, fingerprint: manifest.fingerprint, referenceVersion: "analise-propria-v2", referenceHash: reference.hash, ...artifacts.evaluation };
  const files: Record<string, string> = {
    "publicacao.csv": artifacts.delivery, "divergencias.csv": artifacts.divergenceCsv,
    "avaliacao.json": JSON.stringify(evaluation, null, 2) + "\n", "pipeline-audit.json": JSON.stringify(audit, null, 2) + "\n",
  };
  const exportManifest = { source, fingerprint: manifest.fingerprint, sourceHashes, referenceHash: reference.hash,
    confidenceMode: "declared", warning: evaluation.definitions.confidence, forecastGenerated: false,
    remainingDeliverables: ["previsao.txt: exige autoavaliação explicitamente registrada; métricas posteriores não são uma previsão cega.", "Relatório final e memo para professor conforme o PDF."],
  };
  const reusedExistingDelivery = await saveDelivery(directory, rootCsv, files, exportManifest);
  return { directory, rootCsv, reusedExistingDelivery, rows: data.questions.length, ...artifacts.evaluation.overall, inferenceCalls: 0, forecastGenerated: false };
}
