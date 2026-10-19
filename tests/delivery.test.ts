import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { getConfig } from "../src/config.js";
import type { Prepared, Proposal, Reference, Verdict } from "../src/types.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { indexThemes } from "../src/data.js";
import type { Checkpoint } from "../experiments/no-rag-v19/engine.js";
import { buildArtifacts, DELIVERY_HEADER, saveDelivery } from "../delivery/finalize.js";
import { runPipeline } from "../delivery/pipeline.js";

const config = await getConfig("config/individual-v16-projeto3.json");
delete config.knowledge; delete config.retrieval; delete config.research;
const data: Prepared = { version: 1, inputHashes: {}, cleaning: [],
  questions: [1, 2, 3, 4].map(n => ({ id: `Q000${n}`, enunciado: "Conhecimento jurídico determinante desta questão.", comando: "Assinale a correta.", alternativas: { A: "Uma alternativa de resposta." }, avisos: [] })),
  themes: [["10", "", 0], ["11", "10", 1], ["12", "10", 1], ["13", "11", 2], ["14", "10", 1]].map(([id, parent, level]) => ({ tema_id: String(id), parent_id: String(parent), nivel: Number(level), disciplina: "Direito", titulo: `Tema ${id}`, caminho: String(id), descricao: "Descrição do tema.", status: id === "14" ? "inactive" : "active" })),
};
function fixture() {
  const checkpoint: Checkpoint = { version: 1, fingerprint: "test", records: {} };
  for (const q of data.questions) {
    const outside = q.id === "Q0003", review = q.id === "Q0004";
    const proposal: Proposal = { id: q.id, fora: outside, tema_central_id: outside ? null : q.id === "Q0001" ? "11" : "12",
      extras_ids: q.id === "Q0001" ? ["13"] : [], concorrentes_ids: [q.id === "Q0001" ? "12" : "11"],
      evidencias: [{ campo: "enunciado", trecho: q.enunciado }], justificativa: "O conhecimento determinante define o enquadramento.", incertezas: [], confianca_declarada: 0.875 };
    const rubric = { avaliacao: "sustentado" as const, justificativa: "Há suporte textual para este enquadramento." };
    const verdict: Verdict = { id: q.id, tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric,
      tema_alternativo_id: review ? "11" : null, fora_sustentado: outside, extras_sustentados_ids: proposal.extras_ids,
      alertas: review ? ['Atenção, "dúvida"\nentre os temas.'] : [] };
    const record = { id: q.id, proposal, verdict, errors: [], attempts: { classifier: 1, judge: 1 } };
    checkpoint.records[q.id] = { ...record, decision: decideRecord(record, q, indexThemes(data.themes), config)! };
  }
  const reference: Reference[] = data.questions.map(q => ({ id: q.id,
    classificacao: { tema_id: q.id === "Q0003" ? null : q.id === "Q0001" ? "13" : "11", fora_da_taxonomia: q.id === "Q0003", nivel: 1, limite_especifico: null },
    conferencia: { possui_ressalva: false, fontes_pendentes: [], situacao: "fixture" }, exposicao_previa_a_rotulos_ou_pilotos: false }));
  return { checkpoint, reference };
}

test("avalia publicadas, propostas gerais e revisões com denominadores distintos e irmãos como erro", () => {
  const { checkpoint, reference } = fixture();
  const { evaluation } = buildArtifacts(data, checkpoint, config, reference, "test");
  assert.equal(evaluation.overall.published, 2);
  assert.equal(evaluation.overall.publishedAgreement, 0.5);
  assert.equal(evaluation.overall.exactPublishedAgreement, 0);
  assert.equal(evaluation.overall.coverageAmongSelected, 0.5);
  assert.equal(evaluation.cohorts.allClassifierProposals.denominator, 4);
  assert.equal(evaluation.cohorts.allClassifierProposals.branchOrOutsideAgreement, 0.5);
  assert.equal(evaluation.cohorts.review.denominator, 1);
  assert.equal(evaluation.cohorts.review.branchOrOutsideAgreement, 0);
  assert.equal(evaluation.cohorts.outside.branchOrOutsideAgreement, 1);
  assert.equal(evaluation.target.observedAgreementMeetsTarget, false);
});

test("CSV segue as seis colunas do anexo, inclui todas as decisões e preserva aspas, vírgulas e quebras", () => {
  const { checkpoint, reference } = fixture();
  const result = buildArtifacts(data, checkpoint, config, reference, "test");
  const rows = parse(result.delivery, { columns: true }) as Record<string, string>[];
  assert.ok(rows[0] && rows[2] && rows[3]);
  assert.deepEqual(Object.keys(rows[0]), DELIVERY_HEADER);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].extras_ids, "13");
  assert.equal(rows[0].confianca, "0.8750");
  assert.equal(rows[2].tema_central_id, "");
  assert.equal(rows[2].extras_ids, "");
  assert.equal(rows[2].confianca, "0.0000");
  assert.equal(rows[3].motivo, checkpoint.records.Q0004!.decision!.motivo);
  assert.match(rows[3].motivo, /"dúvida"\n/);
  const divergences = parse(result.divergenceCsv, { columns: true }) as Record<string, string>[];
  assert.equal(divergences.find(r => r.id === "Q0001")!.divergencia_de_ramo, "false");
  assert.equal(divergences.find(r => r.id === "Q0002")!.divergencia_de_ramo, "true");
});

test("exportação bloqueia pendências e decisões alteradas manualmente", () => {
  const { checkpoint, reference } = fixture();
  delete checkpoint.records.Q0002!.decision;
  assert.throws(() => buildArtifacts(data, checkpoint, config, reference, "test"), /pendentes/);
  checkpoint.records.Q0001!.decision!.tema_central_id = "12";
  assert.throws(() => buildArtifacts(data, checkpoint, config, reference, "test"), /Decisão salva alterada/);
});

test("exportação bloqueia temas inativos, duplicatas, referência incompleta e confiança inválida", () => {
  const a = fixture(); a.checkpoint.records.Q0001!.proposal!.tema_central_id = "14";
  assert.throws(() => buildArtifacts(data, a.checkpoint, config, a.reference, "test"), /Proposta salva inválida/);
  const b = fixture(); b.reference[1] = b.reference[0]!;
  assert.throws(() => buildArtifacts(data, b.checkpoint, config, b.reference, "test"), /IDs da referência/);
  const c = fixture(); c.checkpoint.records.Q0001!.proposal!.confianca_declarada = 1.2;
  assert.throws(() => buildArtifacts(data, c.checkpoint, config, c.reference, "test"));
  const d = fixture(); d.checkpoint.records.Q0001!.proposal!.extras_ids = ["13", "13"];
  assert.throws(() => buildArtifacts(data, d.checkpoint, config, d.reference, "test"), /Proposta salva inválida/);
});

test("a referência modifica somente a avaliação, nunca o CSV ou os registros", () => {
  const { checkpoint, reference } = fixture();
  const before = JSON.stringify(checkpoint);
  const a = buildArtifacts(data, checkpoint, config, reference, "test");
  reference[1]!.classificacao.tema_id = "12";
  const b = buildArtifacts(data, checkpoint, config, reference, "test");
  assert.equal(a.delivery, b.delivery);
  assert.notEqual(a.evaluation.overall.publishedAgreement, b.evaluation.overall.publishedAgreement);
  assert.equal(JSON.stringify(checkpoint), before);
});

test("comando integrado executa o pipeline antes de gerar a entrega e reutiliza experimento concluído", async () => {
  const options = { suite: "fixture", name: "fixture", limit: 359, dryRun: false };
  const order: string[] = []; let complete = false;
  const dependencies = {
    completed: async () => complete,
    execute: async () => { order.push("run"); complete = true; return 0; },
    deliver: async () => { order.push("csv"); return "delivery"; },
  };
  assert.deepEqual(await runPipeline(options, dependencies), { exitCode: 0, reusedCompletedExperiment: false, delivery: "delivery" });
  assert.deepEqual(order, ["run", "csv"]);
  order.length = 0;
  const resumed = await runPipeline(options, dependencies);
  assert.equal(resumed.reusedCompletedExperiment, true);
  assert.deepEqual(order, ["csv"]);
});

test("comando integrado não exporta em falha, pendência, dry-run ou recorte parcial", async () => {
  const options = { suite: "fixture", name: "fixture", limit: 359, dryRun: false };
  let deliveries = 0;
  const dependencies = { completed: async () => false, execute: async () => 2, deliver: async () => { deliveries++; } };
  assert.equal((await runPipeline(options, dependencies)).exitCode, 2);
  const successful = { ...dependencies, execute: async () => 0 };
  await assert.rejects(runPipeline(options, successful), /sem concluir/);
  await runPipeline({ ...options, dryRun: true }, successful);
  await runPipeline({ ...options, limit: 10 }, successful);
  assert.equal(deliveries, 0);
});

test("CSV é escrito pelo código e pode ser recriado sem alterar o snapshot; alterações são bloqueadas", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "case-delivery-"));
  try {
    const directory = path.join(temp, "snapshot"), rootCsv = path.join(temp, "publicacao.csv");
    const { checkpoint, reference } = fixture();
    const files = { "publicacao.csv": buildArtifacts(data, checkpoint, config, reference, "test").delivery };
    const identity = { fingerprint: "fixture", sourceHashes: { checkpoint: "fixture-hash" }, referenceHash: "reference" };
    assert.equal(await saveDelivery(directory, rootCsv, files, identity), false);
    assert.equal(await readFile(rootCsv, "utf8"), files["publicacao.csv"]);
    const manifest = await readFile(path.join(directory, "exportacao.json"), "utf8");
    await rm(rootCsv);
    assert.equal(await saveDelivery(directory, rootCsv, files, identity), true);
    assert.equal(await readFile(rootCsv, "utf8"), files["publicacao.csv"]);
    assert.equal(await readFile(path.join(directory, "exportacao.json"), "utf8"), manifest);
    await assert.rejects(saveDelivery(directory, rootCsv, files, { ...identity, fingerprint: "different" }), /outras fontes/);
    await writeFile(path.join(directory, "publicacao.csv"), "changed");
    await assert.rejects(saveDelivery(directory, rootCsv, files, identity), /diverge/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
