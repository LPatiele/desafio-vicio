import test from "node:test";
import assert from "node:assert/strict";
import { decideConfirmedOutside, verifyConfirmedOutside } from "../delivery/confirmed-outside.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { getConfig } from "../src/config.js";
import type { Question, RecordState, Theme } from "../src/types.js";
import { buildArtifacts } from "../delivery/finalize.js";
import { CONFIRMED_OUTSIDE_POLICY } from "../delivery/confirmed-outside.js";
import { parse } from "csv-parse/sync";

const config = await getConfig("config/individual-v16-projeto3.json"); delete config.knowledge; delete config.retrieval; delete config.research;
const q: Question = { id: "Q0001", enunciado: "Conhecimento sobre lei especial ausente na taxonomia.", comando: "Assinale a correta.", alternativas: {}, avisos: [] };
const theme: Theme = { tema_id: "10", parent_id: "", disciplina: "Direito", titulo: "Código Penal", caminho: "Código Penal", descricao: "Crimes do Código Penal.", nivel: 1, status: "active" };
const themes = new Map([["10", theme]]);
function fixture(): RecordState {
  const rubric = { avaliacao: "sustentado" as const, justificativa: "A lei especial está ausente e o Código Penal tem escopo distinto." };
  return { id: q.id, errors: [], attempts: { classifier: 1, judge: 5 },
    proposal: { id: q.id, fora: true, tema_central_id: null, extras_ids: [], concorrentes_ids: ["10"], evidencias: [{ campo: "enunciado", trecho: q.enunciado }], justificativa: "A questão cobra lei especial ausente na árvore.", incertezas: ["Possível abrangência ampla do Código Penal."], confianca_declarada: 0 },
    verdict: { id: q.id, tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric, fora_sustentado: true, tema_alternativo_id: null, extras_sustentados_ids: [], alertas: [] } };
}
test("juiz afirmativo resolve dúvida de fora em variante explícita, sem alterar proposta ou regra original", () => {
  const r = fixture(), before = JSON.stringify(r);
  assert.equal(decideRecord(r, q, themes, config), null);
  const d = decideConfirmedOutside(r, q, themes, config);
  assert.equal(d?.decisao, "fora"); assert.equal(d?.tema_central_id, null);
  assert.equal(JSON.stringify(r), before);
  const checkpoint = { version: 1 as const, fingerprint: "fixture", records: { [q.id]: { ...r, decision: d! } } };
  const data = { version: 1 as const, inputHashes: {}, questions: [q], themes: [theme], cleaning: [] };
  verifyConfirmedOutside(checkpoint, "fixture", data, config);
  checkpoint.records[q.id]!.decision.decisao = "publicar";
  assert.throws(() => verifyConfirmedOutside(checkpoint, "fixture", data, config), /diverge da política/);
});
test("mantém bloqueios para alerta, aviso, rubrica incerta, ausência de parecer e ID inválido", () => {
  const alert = fixture(); alert.verdict!.alertas = ["Problema material."];
  assert.equal(decideConfirmedOutside(alert, q, themes, config), null);
  assert.equal(decideConfirmedOutside(fixture(), { ...q, avisos: ["Texto incompleto"] }, themes, config), null);
  const uncertain = fixture(); uncertain.verdict!.tema_central.avaliacao = "incerto";
  assert.equal(decideConfirmedOutside(uncertain, q, themes, config), null);
  const missing = fixture(); delete missing.verdict;
  assert.equal(decideConfirmedOutside(missing, q, themes, config), null);
  const invalid = fixture(); invalid.proposal!.concorrentes_ids = ["inexistente"];
  assert.equal(decideConfirmedOutside(invalid, q, themes, config), null);
});
test("não flexibiliza publicação quando há incerteza do classificador", () => {
  const r = fixture(); r.proposal!.fora = false; r.proposal!.tema_central_id = "10"; r.proposal!.concorrentes_ids = ["11"]; r.verdict!.fora_sustentado = false;
  const moreThemes = new Map([...themes, ["11", { ...theme, tema_id: "11" }]]);
  assert.equal(decideConfirmedOutside(r, q, moreThemes, config)?.decisao, "revisar");
  assert.deepEqual(decideConfirmedOutside(r, q, moreThemes, config), decideRecord(r, q, moreThemes, config));
});
test("CSV da variante exige política explícita e representa fora com tema vazio e motivo", () => {
  const r = fixture(); r.decision = decideConfirmedOutside(r, q, themes, config)!;
  const checkpoint = { version: 1 as const, fingerprint: "fixture", records: { [q.id]: r } };
  const data = { version: 1 as const, inputHashes: {}, questions: [q], themes: [theme], cleaning: [] };
  const reference = [{ id: q.id, classificacao: { tema_id: null, fora_da_taxonomia: true, nivel: 0, limite_especifico: null }, conferencia: { possui_ressalva: false, fontes_pendentes: [], situacao: "fixture" }, exposicao_previa_a_rotulos_ou_pilotos: false }];
  assert.throws(() => buildArtifacts(data, checkpoint, config, reference, "fixture"), /Decisão salva alterada/);
  const csv = buildArtifacts(data, checkpoint, config, reference, "fixture", CONFIRMED_OUTSIDE_POLICY).delivery;
  const [row] = parse(csv, { columns: true }) as Record<string, string>[];
  assert.ok(row);
  assert.equal(row.decisao, "fora"); assert.equal(row.tema_central_id, ""); assert.ok(row.motivo?.length);
  assert.equal(row.confianca, "0.0000");
});
