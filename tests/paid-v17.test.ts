import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SuiteBudget, ReactiveClient, decodeBatchTurn, batchWireBody } from "../experiments/paid-v17/client.js";
import { RetryableCallError, StopRun } from "../src/client.js";
import { BatchEngine, recoverRetrievalOnly, routeArguments, verifySessions, type Checkpoint } from "../experiments/paid-v17/engine.js";
import { getConfig, loadPrompts } from "../src/config.js";
import { loadData } from "../src/data.js";
import { loadOriginalLabels } from "../src/retrieval/context.js";
import { KnowledgeStore, LocalContextService } from "../src/knowledge/store.js";
import { Logger } from "../src/logger.js";
import { resolveRoot, readJson } from "../src/utils.js";
import type { RecordState } from "../src/types.js";
import { assertBudgetScope, baselineReady, conditionOrder, runSequential } from "../experiments/paid-v17/sequence.js";

async function temporary(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-paid-v17-"));
  try { await fn(dir); } finally { await rm(dir, { force: true, recursive: true }); }
}
const config = await getConfig(resolveRoot("config/individual-v16-projeto3.json"));

test("CLI planeja quatro condições sem inferência e exige teto compartilhado explícito", async () => {
  const run = promisify(execFile);
  const result = await run(process.execPath, ["--import", "tsx", "experiments/paid-v17/cli.ts", "--dry-run"], { cwd: resolveRoot() });
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.baselineCodePreserved, true);
  assert.equal(plan.questions, 359);
  assert.deepEqual(plan.conditions.map((c: any) => c.batchSize), [30, 20, 10, 1]);
  assert.deepEqual(plan.conditions.map((c: any) => c.batches), [12, 18, 36, 359]);
  assert.equal(plan.inferenceConcurrency, 1);
  assert.equal(plan.deferredConditions[0].name, "b1");
  assert.equal(plan.budgetUsdShared, null);
  assert.equal(plan.preventiveSleep, false);
  const batches = JSON.parse((await run(process.execPath, ["--import", "tsx", "experiments/paid-v17/cli.ts", "--dry-run", "--condition", "batches", "--budget-usd", "30"], { cwd: resolveRoot() })).stdout);
  assert.deepEqual(batches.executionOrder, ["b30", "b20", "b10"]);
  assert.equal(batches.budgetUsdShared, 30);
  assert.deepEqual(batches.deferredConditions, []);
  await assert.rejects(run(process.execPath, ["--import", "tsx", "experiments/paid-v17/cli.ts"], { cwd: resolveRoot() }), error => String((error as any).stderr).includes("teto TOTAL aprovado"));
});

test("sequência b30/b20/b10 aguarda cada condição e adia b1 até a conclusão efetiva da v16", async () => {
  assert.deepEqual(conditionOrder("all"), [30, 20, 10, 1]);
  assert.deepEqual(conditionOrder("batches"), [30, 20, 10]);
  const authorization = { totalBudgetUsd: 30, allowedConditions: ["b30", "b20", "b10"] };
  assert.doesNotThrow(() => assertBudgetScope([30, 20, 10], 30, authorization));
  assert.throws(() => assertBudgetScope([1], 30, authorization), /excedem/);
  assert.throws(() => assertBudgetScope([30], 31, authorization), /excedem/);
  let active = 0, peak = 0;
  const order: number[] = [];
  await runSequential([30, 20, 10], async size => {
    active++; peak = Math.max(peak, active); await delay(5); order.push(size); active--;
    return { stopped: null };
  });
  assert.equal(peak, 1); assert.deepEqual(order, [30, 20, 10]);
  const interrupted = await runSequential([30, 20, 10], async () => ({ stopped: "saldo esgotado" }));
  assert.equal(interrupted.results.length, 1); assert.deepEqual(interrupted.queued, ["b20", "b10"]);
  assert.equal(baselineReady(["Q0001", "Q0002"], { Q0001: { decision: {} } }, false), false);
  assert.equal(baselineReady(["Q0001"], { Q0001: { decision: {} } }, true), false);
  assert.equal(baselineReady(["Q0001"], { Q0001: { decision: {} } }, false), true);
});

test("lote preserva várias assinaturas nativas e recusa ferramentas não autorizadas", () => {
  const tool = { type: "function" as const, function: { name: "buscar_referencias", description: "buscar", parameters: {} } };
  const ids = ["Q0001", "Q0002", "Q0003"];
  const content = { role: "model", parts: ids.map(questao_id => ({ thoughtSignature: `opaque-${questao_id}`, functionCall: { name: "buscar_referencias", args: { questao_id, consulta: "furto" } } })) };
  const raw = { candidates: [{ finishReason: "STOP", content }] };
  const result = decodeBatchTurn(config.classifierModel, raw, "r1", ids, { tools: [tool], choice: "auto", final: false });
  assert.equal(result.kind, "tools");
  if (result.kind !== "tools") return;
  assert.equal(result.message.tool_calls.length, 3);
  assert.deepEqual(result.message.providerState!.payload, [content]);
  assert.throws(() => decodeBatchTurn(config.classifierModel, raw, "r1", ids, { tools: [], choice: "auto", final: false }), /autorizadas/);
  assert.throws(() => routeArguments('{"questao_id":"Q9999","consulta":"furto"}', ids), /não solicitado/);
  assert.throws(() => routeArguments('{"consulta":"furto"}', ids), /não solicitado/);
  assert.deepEqual(routeArguments('{"questao_id":"Q0002","consulta":"furto"}', ids), { questionId: "Q0002", rawArguments: '{"consulta":"furto"}' });
});

test("esquema externo do lote remove só maxItems da lista; recuperação conserva tentativas e rejeita resultados antigos", () => {
  const original = { generationConfig: { responseJsonSchema: { properties: { resultados: { type: "array", maxItems: 30, minItems: 1, items: { properties: { evidencias: { maxItems: 5 } } } } } } } };
  const wire = batchWireBody(original, 30);
  assert.equal(wire.generationConfig.responseJsonSchema.properties.resultados.maxItems, undefined);
  assert.equal(wire.generationConfig.responseJsonSchema.properties.resultados.items.properties.evidencias.maxItems, 5);
  assert.equal(original.generationConfig.responseJsonSchema.properties.resultados.maxItems, 30);
  assert.deepEqual(batchWireBody(original, 1), original);
  const seed: Checkpoint = { version: 1, fingerprint: "old", records: { Q0001: { id: "Q0001", attempts: { classifier: 3 }, errors: [] } }, sessions: {} };
  const recovered = recoverRetrievalOnly(seed, "old", "new");
  assert.equal(recovered.records.Q0001!.attempts!.classifier, 3);
  assert.equal(recovered.fingerprint, "new"); assert.equal(seed.fingerprint, "old");
  assert.throws(() => recoverRetrievalOnly(seed, "other", "new"), /original/);
  seed.records.Q0001!.proposal = {} as any;
  assert.throws(() => recoverRetrievalOnly(seed, "old", "new"), /sem propostas/);
});

test("suíte compartilha teto monetário entre reservas concorrentes", async () => temporary(async dir => {
  const budget = new SuiteBudget(path.join(dir, "spend.json"), 0.05), p = config.direct!.classifier;
  const results = await Promise.allSettled(["a", "b", "c"].map(id => budget.transaction(b => b.reserve(id, "classifier", config.classifierModel, p, 100, "test-project"))));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.ok((await budget.summary()).chargedOrReservedUsd <= 0.05);
  assert.equal((await budget.summary()).calls, 1);
}));

test("retentativa de um único ID em b30 mantém o esquema externo compatível", async () => temporary(async dir => {
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "GEMINI_TEST_FIXTURE";
  try {
    const c = structuredClone(config); c.batchSize = 30;
    const client = new ReactiveClient(c, new Logger(dir), new SuiteBudget(path.join(dir, "spend.json"), 1), path.join(dir, "cooldowns"), {}, async (_url, init) => {
      const schema = JSON.parse(init!.body as string).generationConfig.responseJsonSchema;
      assert.equal(schema.properties.resultados.maxItems, undefined);
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: '{"resultados":[{"id":"Q0001"}]}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } }));
    });
    await client.turn("classifier", [{ role: "user", content: "Q0001" }], z.object({ resultados: z.array(z.object({ id: z.string() })).max(30) }), ["Q0001"], async () => {});
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
}));

test("cliente reativo permite inferências simultâneas sem trava ou pausa preventiva", async () => temporary(async dir => {
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "GEMINI_TEST_FIXTURE";
  let active = 0, peak = 0;
  try {
    const budget = new SuiteBudget(path.join(dir, "spend.json"), 1);
    const client = new ReactiveClient(config, new Logger(dir), budget, path.join(dir, "cooldowns"), {}, async (url, init) => {
      assert.match(String(url), /^https:\/\/generativelanguage.googleapis.com/);
      assert.equal((init!.headers as Record<string, string>)["x-goog-api-key"], "GEMINI_TEST_FIXTURE");
      active++; peak = Math.max(peak, active); await delay(300); active--;
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110 } }));
    });
    await Promise.all(["Q0001", "Q0002"].map(id => client.turn("classifier", [{ role: "user", content: id }], z.object({ ok: z.boolean() }), [id], async () => {})));
    assert.equal(peak, 2); assert.equal((await budget.summary()).calls, 2);
    assert.doesNotMatch(await readFile(path.join(dir, "requests.jsonl"), "utf8"), /GEMINI_TEST_FIXTURE/);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
}));

test("429 preserva espera do servidor; faturamento interrompe todos os novos testes", async () => temporary(async dir => {
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "GEMINI_TEST_FIXTURE";
  try {
    const budget = new SuiteBudget(path.join(dir, "spend.json"), 1), state: { message?: string } = {};
    let sends = 0;
    const client = new ReactiveClient(config, new Logger(dir), budget, path.join(dir, "cooldowns"), state, async () => {
      sends++; return new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "70s" }] } }), { status: 429 });
    });
    await assert.rejects(client.turn("classifier", [{ role: "user", content: "teste" }], z.object({ ok: z.boolean() }), ["Q0001"], async () => {}), error => error instanceof RetryableCallError && error.retryAfterMs === 70000);
    assert.equal(sends, 1);
    assert.ok((await readJson<{ until: number }>(path.join(dir, "cooldowns", `${config.classifierModel}.json`))).until > Date.now() + 69000);
    const fatal = new ReactiveClient(config, new Logger(dir), budget, path.join(dir, "other-cooldowns"), state, async () => { sends++; return new Response('{"error":{"message":"credits depleted"}}', { status: 402 }); });
    await assert.rejects(fatal.turn("classifier", [{ role: "user", content: "teste" }], z.object({ ok: z.boolean() }), ["Q0001"], async () => {}), error => error instanceof StopRun && !(error instanceof RetryableCallError));
    assert.equal(sends, 2);
    await assert.rejects(client.turn("judge", [{ role: "user", content: "teste" }], z.object({ ok: z.boolean() }), ["Q0001"], async () => {}), /402/);
    assert.equal(sends, 2);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
}));

test("lote salva itens válidos, repete somente pendentes e revalida recuperação por ID", async () => temporary(async dir => {
  const data = await loadData(), ids = ["Q0001", "Q0002"];
  const prior = await readJson<Record<string, RecordState>>(resolveRoot("output/experiments/gemini35-v16-projeto2-359/records.json"));
  const c = structuredClone(config); c.batchSize = 2;
  const store = await KnowledgeStore.open(resolveRoot(c.knowledge!.snapshot), data);
  try {
    const service = new LocalContextService(store, data, await loadOriginalLabels(data), c);
    const checkpoint: Checkpoint = { version: 1, fingerprint: "test", records: Object.fromEntries(ids.map(id => [id, { id, errors: [] }])), sessions: {} };
    let count = 0;
    const logger = new Logger(dir);
    const client = { logger, turn: async (role: string, messages: unknown, schema: unknown, active: string[], before: (id: string) => Promise<void>) => {
      count++; await before(`mock-${count}`);
      if (count === 1) return { kind: "tools", message: { role: "assistant", content: null, tool_calls: ids.map((questao_id, i) => ({ id: `t${i}`, type: "function", function: { name: "buscar_referencias", arguments: JSON.stringify({ questao_id, consulta: "furto" }) } })) } };
      if (role === "classifier") {
        const selected = count === 2 ? ["Q0001"] : ["Q0002"];
        if (count === 3) assert.deepEqual(active, ["Q0002"]);
        const content = JSON.stringify({ resultados: selected.map(id => prior[id]!.proposal) });
        return { kind: "final", content, message: { role: "assistant", content } };
      }
      const content = JSON.stringify({ resultados: ids.map(id => prior[id]!.verdict) });
      return { kind: "final", content, message: { role: "assistant", content } };
    } } as unknown as ReactiveClient;
    const engine = new BatchEngine({ ...data, questions: data.questions.filter(q => ids.includes(q.id)) }, c, 2, await loadPrompts(c), service, client, checkpoint, dir);
    await engine.run();
    assert.equal(count, 4);
    assert.equal(checkpoint.records.Q0001!.attempts!.classifier, 2);
    assert.equal(checkpoint.records.Q0002!.attempts!.classifier, 3);
    assert.ok(checkpoint.records.Q0001!.decision); assert.ok(checkpoint.records.Q0002!.decision);
    verifySessions(checkpoint, service);
    const tampered = structuredClone(checkpoint);
    tampered.sessions["0-classifier"]!.operations[0]!.questionId = "Q0002";
    assert.throws(() => verifySessions(tampered, service), /Roteamento/);
    await engine.run(); assert.equal(count, 4);
  } finally { store.close(); }
}));
