import test from "node:test";
import assert from "node:assert/strict";
import type { Checkpoint } from "../experiments/no-rag-v19/engine.js";
import { REPAIR_IDS, recoveryRecords, checkInherited, recoveryContext } from "../experiments/individual-v20/repair-plan.js";

function fixture(): Checkpoint {
  const records = Object.fromEntries([...REPAIR_IDS, "Q0001"].map(id => [id, { id, errors: [{ stage: "judge", message: "Erro anterior", at: "2026-10-19T00:00:00Z" }],
    proposal: { id, tema_central_id: "10", fora: false, extras_ids: [], concorrentes_ids: ["11"], evidencias: [{ campo: "enunciado", trecho: "Enunciado para teste" }], justificativa: "Justificativa da proposta original.", incertezas: [], confianca_declarada: .8 },
    attempts: { classifier: 1, judge: 5 }, ...(id === "Q0001" ? { decision: { id, decisao: "revisar" as const, tema_central_id: "10", extras_ids: [], confianca_declarada: .8, motivo: "Revisão original." } } : {}) }]));
  return { version: 1, fingerprint: "parent", records };
}

test("recupera só cinco IDs em ciclo separado, preservando todos os contadores originais", () => {
  const parent = fixture(), before = JSON.stringify(parent);
  const records = recoveryRecords(parent);
  assert.equal(JSON.stringify(parent), before);
  assert.deepEqual(records.Q0001, parent.records.Q0001);
  assert.deepEqual(records.Q0319?.proposal, parent.records.Q0319?.proposal);
  for (const id of REPAIR_IDS) {
    assert.equal(records[id]!.attempts, undefined);
    assert.equal(parent.records[id]!.attempts!.judge, 5);
    if (id !== "Q0319") assert.equal(records[id]!.proposal, undefined);
  }
  checkInherited(parent, records);
});

test("bloqueia alteração dos registros concluídos e esgotamento do novo ciclo", () => {
  const parent = fixture(), records = recoveryRecords(parent);
  records.Q0001!.decision!.motivo = "Alterado";
  assert.throws(() => checkInherited(parent, records), /concluído foi alterado/);
  const another = recoveryRecords(parent); another.Q0319!.attempts = { judge: 6 };
  assert.throws(() => checkInherited(parent, another), /cinco tentativas/);
  delete parent.records.Q0001!.decision;
  assert.throws(() => recoveryRecords(parent), /cinco IDs autorizados/);
});

test("feedback da recuperação vem só das propostas e respostas anteriores, sem avaliação", () => {
  const parent = fixture();
  const rubric = { avaliacao: "sustentado", justificativa: "Justificativa do parecer anterior." };
  const requests = REPAIR_IDS.flatMap(id => [{ phase: "start", role: "judge", ids: [id], requestId: id },
    { phase: "response", requestId: id, status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ resultados: [{ id, tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric, tema_alternativo_id: null, fora_sustentado: false, extras_sustentados_ids: [], alertas: [] }] }) }] } }] }) }]);
  const context = recoveryContext(parent, requests);
  assert.equal(Object.keys(context).length, 4);
  assert.equal(context.Q0319, undefined);
  const first = context.Q0017;
  assert.ok(first);
  assert.deepEqual(first.proposta_anterior, parent.records.Q0017!.proposal);
  assert.equal(first.parecer_anterior_nao_aceito.id, "Q0017");
  assert.equal("referencia" in first, false);
  assert.throws(() => recoveryContext(parent, []), /Sem parecer anterior/);
});
