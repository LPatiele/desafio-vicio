import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../src/config.js";
import { Logger } from "../src/logger.js";
import { StopRun } from "../src/client.js";
import { geminiBody } from "../src/providers/direct.js";
import { SuiteBudget } from "../experiments/paid-v17/client.js";
import { VertexClient } from "../experiments/vertex-v18/client.js";
import { VertexSettingsSchema, guardedVertexFetch, createVertexSdk, vertexEndpoint, vertexParameters } from "../experiments/vertex-v18/connection.js";

const settings = VertexSettingsSchema.parse(JSON.parse(await readFile("config/vertex-v18.json", "utf8")));
const base = await getConfig("config/individual-v16-projeto3.json");
const authClient = { getRequestHeaders: async () => new Headers({ authorization: "Bearer synthetic-test-token" }) };
const schema = z.object({ resultados: z.array(z.object({ id: z.string() })) });

test("SDK envia OAuth ao endpoint Vertex explícito, mesmo com chave e URL do AI Studio no ambiente", async () => {
  const oldKey = process.env.GEMINI_API_KEY, oldUrl = process.env.GOOGLE_VERTEX_BASE_URL;
  process.env.GEMINI_API_KEY = "synthetic-ignored-key";
  process.env.GOOGLE_VERTEX_BASE_URL = "https://generativelanguage.googleapis.com";
  let calls = 0;
  try {
    const sdk = createVertexSdk(settings, 1000, async (input, init) => {
      calls++;
      assert.equal(String(input), vertexEndpoint(settings, settings.classifierModel));
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-goog-api-key"), null);
      assert.equal(headers.get("authorization"), "Bearer synthetic-test-token");
      assert.equal(headers.get("x-goog-user-project"), settings.project);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseJsonSchema.properties.resultados.type, "array");
      assert.equal(body.systemInstruction.parts[0].text.includes("teste"), true);
      return Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: '{"resultados":[{"id":"Q0001"}]}' }] } }] });
    }, authClient);
    const body = geminiBody(settings.classifierModel, base.direct!.classifier, [{ role: "system", content: "teste" }, { role: "user", content: "questão" }], schema);
    await sdk.models.generateContent(vertexParameters(settings.classifierModel, body));
    assert.equal(calls, 1);
  } finally {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.GOOGLE_VERTEX_BASE_URL; else process.env.GOOGLE_VERTEX_BASE_URL = oldUrl;
  }
});

test("guard recusa host, projeto, chave e autenticação incompatíveis antes da rede", async () => {
  let calls = 0;
  const guarded = guardedVertexFetch(settings, async () => { calls++; return Response.json({}); });
  const endpoint = vertexEndpoint(settings, settings.judgeModel), headers = { authorization: "Bearer test" };
  for (const url of ["https://generativelanguage.googleapis.com/v1/models/x", endpoint.replace(settings.project, "another-project"), `${endpoint}?key=test`, endpoint.replace("https:", "http:")]) await assert.rejects(guarded(url, { headers }), /endpoint Vertex/);
  await assert.rejects(guarded(endpoint, { headers: { "x-goog-api-key": "test" } }), /ADC/);
  await assert.rejects(guarded(endpoint, { headers: {} }), /ADC/);
  assert.equal(calls, 0);
});

test("SDK preserva assinaturas e múltiplas chamadas de ferramentas na conversação", async () => {
  const parts = ["Q0001", "Q0002"].map(id => ({ thoughtSignature: `signature-${id}`, functionCall: { id: `call-${id}`, name: "buscar_referencias", args: { consulta: "furto", questao_id: id } } }));
  const sdk = createVertexSdk(settings, 1000, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.contents[1].parts, parts);
    assert.equal(body.tools[0].functionDeclarations[0].parametersJsonSchema.properties.questao_id.type, "string");
    assert.equal(body.toolConfig.functionCallingConfig.mode, "AUTO");
    return Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "ok" }] } }] });
  }, authClient);
  await sdk.models.generateContent(vertexParameters(settings.classifierModel, {
    contents: [{ role: "user", parts: [{ text: "teste" }] }, { role: "model", parts }, { role: "user", parts: [{ functionResponse: { id: "call-Q0001", name: "buscar_referencias", response: { documentos: [] } } }, { functionResponse: { id: "call-Q0002", name: "buscar_referencias", response: { documentos: [] } } }] }],
    generationConfig: { maxOutputTokens: 100 }, systemInstruction: { parts: [{ text: "teste" }] },
    tools: [{ functionDeclarations: [{ name: "buscar_referencias", parametersJsonSchema: { type: "object", properties: { questao_id: { type: "string" } } } }] }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
  }));
});

test("erro financeiro 429 encerra a etapa após um único envio, sem retries ocultos", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vertex-v18-"));
  let calls = 0, attempts = 0;
  try {
    const sdk = createVertexSdk(settings, 1000, async () => {
      calls++;
      return Response.json({ error: { code: 429, message: "Your project has exceeded its monthly spending cap.", status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
    }, authClient);
    const client = new VertexClient(base, new Logger(directory), new SuiteBudget(`${directory}/spend.json`, 10), `${directory}/cooldowns`, {}, settings, sdk);
    await assert.rejects(client.turn("classifier", [{ role: "user", content: "teste" }], schema, ["Q0001"], async () => { attempts++; }), error => error instanceof StopRun && error.message.includes("monthly spending cap"));
    assert.equal(calls, 1); assert.equal(attempts, 1);
    const budget = await client.budget.summary();
    assert.equal(budget.unresolved, 1);
    const log = await readFile(`${directory}/requests.jsonl`, "utf8");
    assert.equal(log.includes('"channel":"vertex"'), true);
    assert.equal(log.includes("synthetic-test-token"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("planejamento Vertex não consulta serviços nem altera o fingerprint original", async () => {
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "experiments/vertex-v18/cli.ts", "--dry-run", "--limit", "10", "--condition", "b10"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.channel, "vertex"); assert.equal(plan.authentication, "ADC");
  assert.equal(plan.originalCodePreserved, true); assert.equal(plan.importsPreviousCheckpoint, false);
  assert.equal(plan.concurrency, 1); assert.equal(plan.maxAttemptsPerQuestionAndStage, 5);
  assert.equal(plan.questions, 10); assert.equal(plan.settings.project, "gen-lang-client-0789985100");
});
