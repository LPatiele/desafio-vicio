import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../src/config.js";
import { Logger } from "../src/logger.js";
import { geminiBody } from "../src/providers/direct.js";
import type { Prepared, Proposal, Verdict } from "../src/types.js";
import { assertNoRetrieval, messagesFor, NoRagEngine, verifyCheckpoint, type Caller, type Checkpoint } from "../experiments/no-rag-v19/engine.js";

const base = await getConfig("config/individual-v16-projeto3.json");
delete base.knowledge; delete base.retrieval; delete base.research; base.batchSize = 10;
const data: Prepared = { version: 1, inputHashes: { fixture: "test" }, cleaning: [],
  questions: [
    { id: "Q0001", enunciado: "A questão discute o conhecimento necessário para o caso.", comando: "Assinale a alternativa correta.", alternativas: { A: "Primeira alternativa de resposta." }, avisos: [] },
    { id: "Q0002", enunciado: "Outro caso jurídico para classificação temática.", comando: "Assinale a alternativa correta.", alternativas: { B: "Alternativa específica para a segunda questão." }, avisos: [] },
  ], themes: ["100", "101"].map(tema_id => ({ tema_id, parent_id: "", disciplina: "Direito", nivel: 1, titulo: `Tema ${tema_id}`, caminho: tema_id, descricao: "Escopo do tema para este teste.", status: "active" })),
};
const proposal = (id: string): Proposal => ({ id, tema_central_id: "100", fora: false, extras_ids: [], concorrentes_ids: ["101"],
  evidencias: [{ campo: id === "Q0001" ? "enunciado" : "alternativa:B", trecho: id === "Q0001" ? "A questão discute o conhecimento necessário" : "Alternativa específica para a segunda questão." }], justificativa: "O conhecimento determinante corresponde ao tema proposto.", incertezas: [], confianca_declarada: 0.8 });
const verdict = (id: string): Verdict => ({ id, tema_central: { avaliacao: "sustentado", justificativa: "O tema representa o instituto determinante." }, evidencia_textual: { avaliacao: "sustentado", justificativa: "O trecho literal sustenta o enquadramento." }, distincao_de_concorrentes: { avaliacao: "sustentado", justificativa: "A diferença de escopo favorece o destino." }, tema_alternativo_id: id === "Q0002" ? "101" : null, fora_sustentado: false, extras_sustentados_ids: [], alertas: [] });
const prompts = { classifier: "Classifique a questão.", judge: "Julgue a proposta." };
const initial = (): Checkpoint => ({ version: 1, fingerprint: "test", records: Object.fromEntries(data.questions.map(q => [q.id, { id: q.id, errors: [] }])) });
async function temporary(fn: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "case-no-rag-v19-"));
  try { await fn(directory); } finally { await rm(directory, { force: true, recursive: true }); }
}

test("entrada e corpo nativo contêm só questão/taxonomia/proposta, sem contexto ou ferramentas", () => {
  const cp = initial(); cp.records.Q0001!.proposal = proposal("Q0001");
  for (const role of ["classifier", "judge"] as const) {
    const messages = messagesFor(role, ["Q0001"], cp.records, data, base, prompts);
    const input = JSON.parse(messages[1]!.content!).questoes[0];
    assert.deepEqual(Object.keys(input).sort(), role === "classifier" ? ["questao"] : ["proposta", "questao"]);
    assert.deepEqual(Object.keys(input.questao).sort(), ["alternativas", "avisos", "comando", "enunciado", "id"]);
    const body = geminiBody(role === "classifier" ? base.classifierModel : base.judgeModel, base.direct![role], messages, z.object({ resultados: z.array(z.any()) }));
    assert.equal(body.tools, undefined); assert.equal(body.toolConfig, undefined);
    assert.equal(JSON.stringify(body).includes("contexto_externo"), false);
    assert.equal(JSON.stringify(body).includes("rotulo_original"), false);
    assert.equal(JSON.stringify(body).includes("referencia_de_avaliacao"), false);
  }
});

test("rejeita ativação de RAG e checkpoints que trazem contexto de execuções anteriores", () => {
  assert.throws(() => assertNoRetrieval({ ...base, knowledge: { ...({} as any), enabled: true } }), /desabilitados/);
  const cp = initial(); (cp.records.Q0001 as any).classifierKnowledge = { chunks: [] };
  assert.throws(() => verifyCheckpoint(cp, "test", data, base), /contexto externo/);
});

test("pipeline conserva itens válidos, corrige campo da evidência por feedback e mantém revisão por tema alternativo", async () => temporary(async directory => {
  const checkpoint = initial(), calls: { role: string; ids: string[] }[] = [];
  const caller: Caller = { logger: new Logger(directory), turn: async (role, messages, _schema, ids, beforeSend, options) => {
    assert.equal(options, undefined);
    calls.push({ role, ids }); await beforeSend(`request-${calls.length}`);
    let rows: (Proposal | Verdict)[];
    if (role === "classifier") {
      rows = ids.map(proposal);
      if (calls.length === 1) (rows[1] as Proposal).evidencias[0]!.campo = "enunciado";
      if (calls.length === 2) {
        assert.deepEqual(ids, ["Q0002"]);
        assert.equal(JSON.stringify(messages).includes("campos_com_trecho_literal"), true);
        assert.equal(JSON.stringify(messages).includes("alternativa:B"), true);
      }
    } else rows = ids.map(verdict);
    const content = JSON.stringify({ resultados: rows });
    return { kind: "final", content, message: { role: "assistant", content } };
  } };
  const engine = new NoRagEngine(data, base, prompts, caller, checkpoint, directory);
  await engine.run();
  assert.equal(calls.length, 3);
  assert.deepEqual(checkpoint.records.Q0001!.attempts, { classifier: 1, judge: 1 });
  assert.deepEqual(checkpoint.records.Q0002!.attempts, { classifier: 2, judge: 1 });
  assert.equal(checkpoint.records.Q0001!.decision!.decisao, "publicar");
  assert.equal(checkpoint.records.Q0002!.decision!.decisao, "revisar");
  const restored = JSON.parse(await readFile(`${directory}/checkpoint.json`, "utf8"));
  verifyCheckpoint(restored, "test", data, base);
  await new NoRagEngine(data, base, prompts, caller, restored, directory).run();
  assert.equal(calls.length, 3);
}));

test("cinco tentativas não produzem decisão fictícia e retomada não zera o contador", async () => temporary(async directory => {
  const selected = { ...data, questions: data.questions.slice(0, 1) }, checkpoint = initial();
  delete checkpoint.records.Q0002;
  let calls = 0;
  const caller: Caller = { logger: new Logger(directory), turn: async (role, _messages, _schema, _ids, beforeSend) => {
    assert.equal(role, "classifier"); await beforeSend(`missing-${++calls}`);
    const content = '{"resultados":[]}'; return { kind: "final", content, message: { role: "assistant", content } };
  } };
  const engine = new NoRagEngine(selected, base, prompts, caller, checkpoint, directory);
  await engine.run(); await engine.run();
  assert.equal(calls, 5); assert.equal(checkpoint.records.Q0001!.attempts!.classifier, 5);
  assert.equal(checkpoint.records.Q0001!.proposal, undefined); assert.equal(checkpoint.records.Q0001!.decision, undefined);
}));

test("CLI planeja todas as 359 questões sem RAG e preserva o fingerprint original", async () => {
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "experiments/no-rag-v19/cli.ts", "--dry-run"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.questions, 359); assert.equal(plan.batches, 36); assert.equal(plan.minimumInferenceCalls, 72);
  assert.equal(plan.knowledgeEnabled, false); assert.equal(plan.retrievalEnabled, false); assert.equal(plan.toolsEnabled, false);
  assert.equal(plan.sharedBudgetLimitUsd, 30); assert.equal(plan.previousResultsPreserved, true);
});
