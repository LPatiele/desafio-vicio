import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { prepare, estimate, authorizedBudget } from "../experiments/individual-v20/plan.js";
import { IndividualVertexClient } from "../experiments/individual-v20/client.js";
import { SuiteBudget } from "../experiments/paid-v17/client.js";
import { NoRagEngine, messagesFor, type Checkpoint, type Caller } from "../experiments/no-rag-v19/engine.js";
import { geminiBody } from "../src/providers/direct.js";
import { Logger } from "../src/logger.js";
import type { Config, RecordState } from "../src/types.js";
import { hash } from "../src/utils.js";

test("v20 mantém perfil e prompts do classificador, muda somente modelo/preço do juiz e usa um item sem RAG", async () => {
  const p = await prepare();
  const baseline = JSON.parse(await readFile("output/no-rag-v19/model-only-v19-359/manifest.json", "utf8")) as { config: Config };
  assert.deepEqual(p.config.direct!.classifier, baseline.config.direct!.classifier);
  assert.equal(p.config.classifierModel, "gemini-3.5-flash-lite");
  assert.equal(p.config.judgeModel, "gemini-3.1-pro-preview");
  assert.equal(p.config.direct!.judge.reasoningEffort, "medium");
  assert.equal(p.config.direct!.judge.inputUsdPerMillion, 2);
  assert.equal(p.config.direct!.judge.outputUsdPerMillion, 12);
  assert.equal(p.config.direct!.judge.longContext!.inputUsdPerMillion, 4);
  assert.equal(p.config.batchSize, 1);
  assert.equal(p.config.knowledge, undefined); assert.equal(p.config.retrieval, undefined); assert.equal(p.config.research, undefined);
  const previousPrompts = JSON.parse(await readFile("output/no-rag-v19/model-only-v19-359/prompts.json", "utf8"));
  assert.deepEqual(p.prompts, previousPrompts);
  const cost = await estimate(p);
  assert.ok(cost.uncachedUsd > 30);
  assert.ok(cost.ninetyPercentInputCachedUsd < cost.uncachedUsd);
});

test("v20 chama classificador e juiz em sequência por questão; todas as propostas começam vazias", async () => {
  const p = await prepare(2), temp = await mkdtemp(path.join(os.tmpdir(), "case-v20-"));
  const previous = JSON.parse(await readFile("output/no-rag-v19/model-only-v19-359/records.json", "utf8")) as Record<string, RecordState>;
  const checkpoint: Checkpoint = { version: 1, fingerprint: p.fingerprint, records: Object.fromEntries(p.data.questions.map(q => [q.id, { id: q.id, errors: [] }])) };
  assert.ok(Object.values(checkpoint.records).every(r => !r.proposal && !r.verdict));
  const order: string[] = []; let concurrent = 0, maximumConcurrent = 0;
  const caller: Caller = { logger: new Logger(temp), turn: async (role, messages, _schema, ids, beforeSend) => {
    assert.equal(ids.length, 1);
    const id = ids[0]!; order.push(`${role}:${id}`);
    concurrent++; maximumConcurrent = Math.max(concurrent, maximumConcurrent);
    await beforeSend(`v20-${order.length}`);
    const input = JSON.parse(messages[1]!.content!).questoes[0];
    assert.deepEqual(Object.keys(input).sort(), role === "judge" ? ["proposta", "questao"] : ["questao"]);
    const record = previous[id]!;
    const content = JSON.stringify({ resultados: [role === "classifier" ? record.proposal : record.verdict] });
    concurrent--; return { kind: "final", content, message: { role: "assistant", content } };
  } };
  try {
    await new NoRagEngine(p.data, p.config, p.prompts, caller, checkpoint, temp).run();
    assert.deepEqual(order, ["classifier:Q0001", "judge:Q0001", "classifier:Q0002", "judge:Q0002"]);
    assert.equal(maximumConcurrent, 1);
    assert.ok(Object.values(checkpoint.records).every(r => r.proposal && r.verdict && r.decision));
    const messages = messagesFor("judge", ["Q0001"], checkpoint.records, p.data, p.config, p.prompts);
    const body = geminiBody(p.config.judgeModel, p.config.direct!.judge, messages, z.object({ resultados: z.array(z.any()) }));
    assert.equal(body.tools, undefined); assert.equal(body.toolConfig, undefined);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "MEDIUM");
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("v20 exige teto próprio, rejeita valor inválido e preserva orçamento, resultados e CSV anteriores", async () => {
  assert.throws(() => authorizedBudget(null, null), /teto financeiro próprio/);
  assert.equal(authorizedBudget({ budgetUsd: 45 }, null), 45);
  assert.throws(() => authorizedBudget({ budgetUsd: 45 }, 60), /difere/);
  const protectedFiles = ["output/paid-v17/paid-v17-359/spend.json", "output/paid-v17/paid-v17-359/authorization.json", "output/no-rag-v19/model-only-v19-359/checkpoint.json", "publicacao.csv", "config/vertex-v18.json"];
  const before = await Promise.all(protectedFiles.map(async file => hash(await readFile(file, "utf8"))));
  await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "experiments/individual-v20/cli.ts", "--run", "--budget-usd", "0", "--limit", "1", "--suite", "v20-budget-guard-test"]), error => {
    assert.match((error as { stderr: string }).stderr, /Teto financeiro inválido/); return true;
  });
  const after = await Promise.all(protectedFiles.map(async file => hash(await readFile(file, "utf8"))));
  assert.deepEqual(after, before);
});

test("falha de rede interrompe no primeiro envio e preserva orçamento desconhecido sem esgotar os outros itens", async () => {
  const p = await prepare(2), temp = await mkdtemp(path.join(os.tmpdir(), "case-v20-offline-"));
  const budget = new SuiteBudget(path.join(temp, "spend.json"), 45);
  const checkpoint: Checkpoint = { version: 1, fingerprint: p.fingerprint, records: Object.fromEntries(p.data.questions.map(q => [q.id, { id: q.id, errors: [] }])) };
  let calls = 0;
  const sdk = { models: { generateContent: async () => { calls++; throw new Error("fetch failed"); } } };
  const client = new IndividualVertexClient(p.config, new Logger(temp), budget, path.join(temp, "cooldowns"), {}, p.vertex, sdk as any);
  try {
    await assert.rejects(new NoRagEngine(p.data, p.config, p.prompts, client, checkpoint, temp).run(), /Falha de conexão Vertex/);
    assert.equal(calls, 1);
    assert.equal(checkpoint.records.Q0001!.attempts!.classifier, 1);
    assert.equal(checkpoint.records.Q0002!.attempts, undefined);
    assert.equal((await budget.summary()).unresolved, 1);
    assert.ok((await budget.summary()).remainingUsd < 45);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
