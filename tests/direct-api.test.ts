import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { getConfig } from "../src/config.js";
import { ConfigSchema } from "../src/types.js";
import { RetryableCallError, StopRun, type Message, type TurnOptions } from "../src/client.js";
import { DirectClient, directPreflight, geminiBody, openaiBody, decodeTurn, normalizeUsage, permanentQuotaFailure } from "../src/providers/direct.js";
import { SpendBudget, usageCost } from "../src/providers/budget.js";
import { LocalAgentSchema } from "../src/knowledge/agent-types.js";
import { Logger } from "../src/logger.js";
import { atomicJson, redact, resolveRoot } from "../src/utils.js";
import { SharedRateLimiter } from "../src/rate-limit.js";
import { withInferenceLock } from "../src/providers/serial.js";
import { setTimeout as delay } from "node:timers/promises";

const config = await getConfig(resolveRoot("config/individual-v10-gemini-openai.json"));
const schema = z.object({ resultados: z.array(z.object({ id: z.string() }).strict()) }).strict();
const options: TurnOptions = { tools: [{ type: "function", function: { name: "buscar_referencias", description: "Buscar", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } } }], choice: { type: "function", function: { name: "buscar_referencias" } }, final: false };
const messages: Message[] = [{ role: "system", content: "Classifique após consultar." }, { role: "user", content: "Q0001" }];
const noopLimiter = () => ({ acquire: async () => {}, deferUntil: async () => {} });
const jsonResponse = (body: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });
const googleTools = { modelVersion: "gemini-3.1-pro-preview", candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ thoughtSignature: "assinatura-opaca", functionCall: { name: "buscar_referencias", args: { query: "furto" } } }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 20, totalTokenCount: 130 } };
const googleFinal = { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: '{"resultados":[{"id":"Q0001"}]}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 20, totalTokenCount: 130 } };

async function temporary(action: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-direct-"));
  try { await action(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test("configurações antigas continuam gratuitas; perfis pagos são explícitos e swap troca perfil inteiro", async () => {
  const old = await getConfig();
  assert.equal(old.direct, undefined);
  assert.throws(() => ConfigSchema.parse({ ...old, classifierModel: "gpt-5.2" }), /:free/);
  assert.throws(() => ConfigSchema.parse({ ...config, maxRetries: 1 }), /retentativas|Retentativas|diretas/);
  assert.throws(() => ConfigSchema.parse({ ...config, classifierModel: "gemini-4-argon" }), /incompatíveis/);
  assert.throws(() => ConfigSchema.parse({ ...config, responseFormat: "json_object" }), /json_schema/);
  const swapped = await getConfig(resolveRoot("config/individual-v10-gemini-openai.json"), true);
  assert.equal(swapped.classifierModel, config.judgeModel);
  assert.deepEqual(swapped.direct?.classifier, config.direct!.judge);
});

test("nova condição aceita Flash-Lite classificador e Flash juiz, preservando RAG e os perfis anteriores", async () => {
  const duo = await getConfig(resolveRoot("config/individual-v11-gemini-flash.json"));
  assert.equal(duo.classifierModel, "gemini-3.1-flash-lite");
  assert.equal(duo.judgeModel, "gemini-3.8-flash");
  assert.equal(duo.direct?.classifier.provider, "gemini");
  assert.equal(duo.direct?.judge.provider, "gemini");
  assert.deepEqual(duo.knowledge, config.knowledge);
  assert.equal(duo.classifierPrompt, config.classifierPrompt);
  assert.equal(duo.judgePrompt, config.judgePrompt);
  const swapped = await getConfig(resolveRoot("config/individual-v11-gemini-flash.json"), true);
  assert.equal(swapped.direct?.classifier.inputUsdPerMillion, duo.direct?.judge.inputUsdPerMillion);
});

test("CLI usa APIs diretas por padrão e mantém configuração gratuita explícita, sem inferência no dry-run", async () => {
  const run = promisify(execFile), args = ["--import", "tsx", "src/index.ts", "run", "--dry-run", "--limit", "1"];
  const current = JSON.parse((await run(process.execPath, args, { cwd: resolveRoot() })).stdout);
  assert.deepEqual(current.models, [config.classifierModel, config.judgeModel]);
  assert.equal(current.minimumCalls, 3); assert.equal(current.directApis.judge, "openai");
  const legacy = JSON.parse((await run(process.execPath, [...args, "--config", "config/individual-v3.json"], { cwd: resolveRoot() })).stdout);
  assert.ok(legacy.models.every((model: string) => model.endsWith(":free")));
  assert.equal(legacy.directApis, undefined);
});

test("Gemini preserva partes e assinaturas em checkpoint e reconstrói respostas de ferramentas", () => {
  const first = decodeTurn("gemini", config.classifierModel, googleTools, "r1", options);
  assert.equal(first.kind, "tools"); if (first.kind !== "tools") return;
  const state = LocalAgentSchema.parse(JSON.parse(JSON.stringify({ version: 2, snapshotHash: "snapshot", status: "running", messages: [...messages, first.message], rounds: 1, operations: [] })));
  const history: Message[] = [...state.messages, { role: "tool", tool_call_id: first.message.tool_calls[0]!.id, content: '{"fontes":[]}' }];
  const body = geminiBody(config.classifierModel, config.direct!.classifier, history, schema, { ...options, final: true });
  assert.deepEqual(body.contents[1], googleTools.candidates[0]!.content);
  assert.deepEqual(body.contents[2].parts[0].functionResponse, { name: "buscar_referencias", response: { fontes: [] } });
  assert.equal(body.tools, undefined);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "HIGH");
  assert.throws(() => openaiBody(config.judgeModel, config.direct!.judge, history, schema), /outro fornecedor/);
});

test("OpenAI preserva itens de raciocínio criptografado e chamadas nativas sem estado remoto", () => {
  const output = [{ type: "reasoning", id: "rs1", encrypted_content: "opaco", summary: [] }, { type: "function_call", id: "fc1", call_id: "call1", name: "buscar_referencias", arguments: '{"query":"furto"}', status: "completed" }];
  const first = decodeTurn("openai", config.judgeModel, { status: "completed", output }, "r2", options);
  assert.equal(first.kind, "tools"); if (first.kind !== "tools") return;
  const history: Message[] = [...messages, first.message, { role: "tool", tool_call_id: "call1", content: '{"fontes":[]}' }];
  const body = openaiBody(config.judgeModel, config.direct!.judge, history, schema, { ...options, final: true });
  assert.equal(body.store, false);
  assert.deepEqual(body.input.slice(2, 4), output);
  assert.deepEqual(body.input[4], { type: "function_call_output", call_id: "call1", output: '{"fontes":[]}' });
  assert.equal(body.text.format.strict, true);
  assert.equal(body.max_output_tokens, 8192);
  assert.equal(body.temperature, undefined);
});

test("continuidade agrupa duas respostas Gemini e respeita IDs nativos", () => {
  const raw = structuredClone(googleTools) as any;
  raw.candidates[0].content.parts[0].functionCall.id = "native1";
  raw.candidates[0].content.parts.push({ functionCall: { id: "native2", name: "buscar_referencias", args: { query: "roubo" } } });
  const turn = decodeTurn("gemini", config.classifierModel, raw, "r3", options);
  assert.equal(turn.kind, "tools"); if (turn.kind !== "tools") return;
  const history: Message[] = [...messages, turn.message, ...turn.message.tool_calls.map(c => ({ role: "tool" as const, tool_call_id: c.id, content: '{"fontes":[]}' }))];
  const body = geminiBody(config.classifierModel, config.direct!.classifier, history, schema, options);
  assert.equal(body.contents.length, 3);
  assert.deepEqual(body.contents[2].parts.map((p: any) => p.functionResponse.id), ["native1", "native2"]);
});

test("uso não duplica raciocínio e distingue cache e faixa de contexto longo", () => {
  assert.deepEqual(normalizeUsage("gemini", googleTools.usageMetadata), { inputTokens: 100, cachedInputTokens: 0, outputTokens: 30, reasoningTokens: 20 });
  const usage = normalizeUsage("openai", { input_tokens: 100, output_tokens: 40, input_tokens_details: { cached_tokens: 30 }, output_tokens_details: { reasoning_tokens: 25 } })!;
  assert.equal(usage.outputTokens, 40);
  assert.equal(usageCost(config.direct!.judge, usage), (70 * 1.75 + 30 * 0.175 + 40 * 14) / 1e6);
  assert.equal(normalizeUsage("openai", { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 11 } }), null);
  assert.equal(normalizeUsage("gemini", {}), null);
  assert.equal(usageCost(config.direct!.classifier, { inputTokens: 200001, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0 }), (200001 * 4 + 10 * 18) / 1e6);
});

test("orçamento persiste reservas desconhecidas, concilia uso e não renova chamadas na retomada", async () => temporary(async dir => {
  const file = path.join(dir, "spend.json");
  let budget = await SpendBudget.open(file, 1, 2);
  await budget.reserve("r1", "classifier", config.classifierModel, config.direct!.classifier, 100);
  await budget.settle("r1", config.direct!.classifier, normalizeUsage("gemini", googleTools.usageMetadata));
  await budget.reserve("r2", "judge", config.judgeModel, config.direct!.judge, 100);
  await budget.settle("r2", config.direct!.judge, null);
  budget = await SpendBudget.open(file, 1, 2);
  assert.equal(budget.summary().calls, 2);
  assert.equal(budget.summary().unresolved, 1);
  assert.ok(budget.summary().chargedOrReservedUsd > budget.summary().knownCostUsd);
  await assert.rejects(budget.reserve("r3", "judge", config.judgeModel, config.direct!.judge, 100), /persistente/);
  const low = await SpendBudget.open(path.join(dir, "low.json"), 0.001, 5);
  await assert.rejects(low.reserve("r4", "judge", config.judgeModel, config.direct!.judge, 100), /Orçamento em dólares/);
}));

test("transporte direto registra reserva e tentativa antes de enviar; usa apenas endpoint e chave do papel", async () => temporary(async dir => {
  const saved = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "TEST_GEMINI_SECRET";
  let reserved = 0, sent = 0;
  try {
    const budget = await SpendBudget.open(path.join(dir, "spend.json"), 10, 5);
    const client = new DirectClient(config, new Logger(dir), budget, async (url, init) => {
      sent++; assert.equal(reserved, sent);
      assert.match(String(url), /generativelanguage\.googleapis\.com.*generateContent$/);
      assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "TEST_GEMINI_SECRET");
      assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
      assert.equal(budget.summary().unresolved, 1);
      return jsonResponse(googleFinal);
    }, noopLimiter);
    const raw = await client.call("classifier", config.classifierModel, messages, schema, ["Q0001"], async () => { reserved++; });
    assert.equal(JSON.parse(raw).resultados[0].id, "Q0001");
    assert.equal(client.calls, 1);
    assert.equal(budget.summary().unresolved, 0);
    const logs = await readFile(path.join(dir, "requests.jsonl"), "utf8");
    assert.doesNotMatch(logs, /TEST_GEMINI_SECRET/);
  } finally { if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved; }
}));

test("limite monetário e falha ao persistir tentativa impedem inferência", async () => temporary(async dir => {
  const saved = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "TEST_OPENAI_SECRET";
  let sent = 0;
  try {
    const transport: typeof fetch = async () => { sent++; return jsonResponse({}); };
    const low = await SpendBudget.open(path.join(dir, "low.json"), 0.00001, 10);
    await assert.rejects(new DirectClient(config, new Logger(dir), low, transport, noopLimiter).call("judge", config.judgeModel, messages, schema, ["Q0001"]), /Orçamento em dólares/);
    const budget = await SpendBudget.open(path.join(dir, "spend.json"), 10, 10);
    await assert.rejects(new DirectClient(config, new Logger(dir), budget, transport, noopLimiter).call("judge", config.judgeModel, messages, schema, ["Q0001"], async () => { throw new Error("disco indisponível"); }), /disco/);
    assert.equal(sent, 0); assert.equal(budget.summary().chargedOrReservedUsd, 0);
  } finally { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; }
}));

test("timeout conserva reserva e HTTP de faturamento interrompe sem retentativas ocultas", async () => temporary(async dir => {
  const saved = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "TEST_OPENAI_SECRET";
  try {
    const budget = await SpendBudget.open(path.join(dir, "spend.json"), 10, 10);
    let sent = 0;
    const transport: typeof fetch = async () => { sent++; if (sent === 1) throw new Error("rede"); return jsonResponse({ error: { code: "insufficient_quota" } }, 429); };
    const client = new DirectClient(config, new Logger(dir), budget, transport, noopLimiter);
    await assert.rejects(client.call("judge", config.judgeModel, messages, schema, ["Q0001"]), RetryableCallError);
    assert.equal(sent, 1); assert.equal(budget.summary().unresolved, 1);
    await assert.rejects(client.call("judge", config.judgeModel, messages, schema, ["Q0001"]), error => error instanceof StopRun && !(error instanceof RetryableCallError));
    assert.equal(sent, 2); assert.equal(budget.summary().unresolved, 2);
  } finally { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; }
}));

test("API parcial e ferramentas excessivas são rejeitadas; bloqueio não vira publicação", () => {
  assert.throws(() => decodeTurn("gemini", config.classifierModel, { candidates: [{ finishReason: "MAX_TOKENS" }] }, "x"), RetryableCallError);
  assert.throws(() => decodeTurn("openai", config.judgeModel, { status: "incomplete", output: [], incomplete_details: { reason: "max_output_tokens" } }, "x"), RetryableCallError);
  assert.throws(() => decodeTurn("gemini", config.classifierModel, { promptFeedback: { blockReason: "SAFETY" } }, "x"), StopRun);
  assert.throws(() => decodeTurn("gemini", config.classifierModel, googleTools, "x", { ...options, final: true }), RetryableCallError);
});

test("limite de tokens é compartilhado entre filas e arquivo corrompido bloqueia orçamento", async () => temporary(async dir => {
  const file = path.join(dir, "rate.json"), options = { requestsPerMinute: 60, minIntervalMs: 0, tokensPerMinute: 10, windowMs: 80 };
  const first = new SharedRateLimiter(file, options), second = new SharedRateLimiter(file, options);
  await first.acquire(6); const at = Date.now(); await second.acquire(6);
  assert.ok(Date.now() - at >= 70);
  await assert.rejects(first.acquire(11), /excede/);
  const corrupt = path.join(dir, "spend.json");
  await atomicJson(corrupt, { version: 1, entries: { x: { actualUsd: -1 } } });
  await assert.rejects(SpendBudget.open(corrupt, 10, 10));
}));

test("logs ocultam chaves dos três fornecedores", () => {
  const original = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "segredo-google-fixture";
  try { assert.equal(redact({ text: "segredo-google-fixture sk-proj-exemplo123 sk-or-v1-exemplo123" }).text, "[REDACTED] [REDACTED] [REDACTED]"); }
  finally { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; }
});

test("preflight direto consulta só Google/OpenAI e dispensa chave/cota do OpenRouter", async () => {
  const previousFetch = globalThis.fetch, oldGoogle = process.env.GEMINI_API_KEY, oldOpenAI = process.env.OPENAI_API_KEY, oldRouter = process.env.OPENROUTER_API_KEY;
  process.env.GEMINI_API_KEY = "GOOGLE_FIXTURE"; process.env.OPENAI_API_KEY = "OPENAI_FIXTURE"; delete process.env.OPENROUTER_API_KEY;
  const urls: string[] = [];
  try {
    globalThis.fetch = async url => {
      urls.push(String(url));
      return jsonResponse(String(url).includes("googleapis.com") ? { name: `models/${config.classifierModel}`, supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1048576 } : { id: config.judgeModel });
    };
    const result = await directPreflight(config);
    assert.equal(result.quota, null); assert.equal(result.models.length, 2);
    assert.equal(urls.length, 2); assert.doesNotMatch(urls.join("\n"), /openrouter|FIXTURE/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries({ GEMINI_API_KEY: oldGoogle, OPENAI_API_KEY: oldOpenAI, OPENROUTER_API_KEY: oldRouter })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("dois papéis Gemini verificam acesso e geram parecer sem depender de chave OpenAI", async () => temporary(async dir => {
  const duo = await getConfig(resolveRoot("config/individual-v11-gemini-flash.json"));
  const originalFetch = globalThis.fetch, oldGoogle = process.env.GEMINI_API_KEY, oldOpenAI = process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "GOOGLE_FIXTURE"; delete process.env.OPENAI_API_KEY;
  const urls: string[] = [];
  try {
    globalThis.fetch = async url => { urls.push(String(url)); return jsonResponse({ name: String(url).split("/models/")[1], supportedGenerationMethods: ["generateContent"] }); };
    const check = await directPreflight(duo);
    assert.equal(check.models.length, 2);
    assert.ok(urls.every(url => url.includes("googleapis.com")));
    const budget = await SpendBudget.open(path.join(dir, "spend.json"), 1, 5);
    const client = new DirectClient(duo, new Logger(dir), budget, async (url, init) => {
      assert.match(String(url), /gemini-3\.8-flash:generateContent$/);
      assert.equal(JSON.parse(init!.body as string).generationConfig.thinkingConfig.thinkingLevel, "MEDIUM");
      return jsonResponse(googleFinal);
    }, noopLimiter);
    assert.equal(JSON.parse(await client.call("judge", duo.judgeModel, messages, schema, ["Q0001"])).resultados[0].id, "Q0001");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({ GEMINI_API_KEY: oldGoogle, OPENAI_API_KEY: oldOpenAI })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}));

test("429 Gemini com referência genérica a billing continua transitório e compartilha pausa", async () => temporary(async dir => {
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "GOOGLE_FIXTURE";
  let pauses = 0, sends = 0;
  try {
    const budget = await SpendBudget.open(path.join(dir, "spend.json"), 10, 10);
    const client = new DirectClient(config, new Logger(dir), budget, async () => { sends++; return jsonResponse({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Check your plan and billing details.", details: [{ retryDelay: "70s" }] } }, 429); }, () => ({ acquire: async () => {}, deferUntil: async timestamp => { pauses++; assert.ok(timestamp - Date.now() >= 69000); } }));
    await assert.rejects(client.call("classifier", config.classifierModel, messages, schema, ["Q0001"]), error => error instanceof RetryableCallError && error.retryAfterMs === 70000);
    assert.equal(pauses, 1); assert.equal(sends, 1);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
}));

test("saldo esgotado e limites financeiros OpenAI são fatais, incluindo error.type genérico", async () => temporary(async dir => {
  const old = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "OPENAI_FIXTURE";
  try {
    for (const code of ["credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"]) assert.match(permanentQuotaFailure("openai", { code })!, /saldo ou limite/);
    assert.match(permanentQuotaFailure("openai", { type: "insufficient_quota", code: "new_billing_code" })!, /saldo ou limite/);
    assert.equal(permanentQuotaFailure("openai", { code: "slow_down", type: "rate_limit_error" }), null);
    let sends = 0;
    const budget = await SpendBudget.open(path.join(dir, "spend.json"), 10, 5);
    const client = new DirectClient(config, new Logger(dir), budget, async () => { sends++; return jsonResponse({ error: { code: "credit_balance_exhausted", type: "insufficient_quota", message: "You have no credits remaining." } }, 429); }, noopLimiter);
    await assert.rejects(client.call("judge", config.judgeModel, messages, schema, ["Q0001"]), error => error instanceof StopRun && !(error instanceof RetryableCallError));
    assert.equal(sends, 1);
  } finally { if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; }
}));

test("Google Free Tier zero e cota diária param; limite por minuto continua transitório", () => {
  const failure = (quotaId: string, quotaMetric: string, message: string) => ({ message, details: [{ violations: [{ quotaId, quotaMetric }] }] });
  assert.match(permanentQuotaFailure("gemini", failure("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "generate_content_free_tier_requests", "Quota exceeded, limit: 0"))!, /Free Tier com cota zero/);
  assert.match(permanentQuotaFailure("gemini", failure("GenerateRequestsPerDayPerProjectPerModel", "requests", "Quota exceeded"))!, /diária esgotada/);
  assert.equal(permanentQuotaFailure("gemini", failure("GenerateRequestsPerMinutePerProjectPerModel", "requests", "Quota exceeded")), null);
});

test('v14 mantém modelos, prompts e base; configura cotas por papel sem alterar v13',async()=>{
 const old=await getConfig(resolveRoot('config/individual-v13-livros.json'));
 const next=await getConfig(resolveRoot('config/individual-v14-limites.json'));
 assert.equal(next.classifierModel,'gemini-3.1-flash-lite');assert.equal(next.judgeModel,old.judgeModel);
 assert.equal(next.classifierPrompt,old.classifierPrompt);assert.equal(next.judgePrompt,old.judgePrompt);
 assert.deepEqual(next.knowledge,old.knowledge);assert.equal(next.direct!.budgetUsd,10);
 assert.equal(next.direct!.classifier.requestsPerMinute,15);assert.equal(next.direct!.judge.requestsPerMinute,15);
 assert.equal(next.direct!.classifier.tokensPerMinute,250_000);assert.equal(next.direct!.classifier.requestsPerDay,1000);
 assert.equal(next.direct!.judge.tokensPerMinute,1_000_000);assert.equal(next.direct!.judge.requestsPerDay,1500);
 for(const role of ['classifier','judge'] as const){assert.equal(next.direct![role].dailyResetTimeZone,'America/Los_Angeles');}
 assert.equal(old.direct!.classifier.requestsPerMinute,10);assert.equal(old.direct!.classifier.requestsPerDay,undefined);
 const {directQuotaBucket}=await import('../src/providers/direct.js');
 assert.equal(directQuotaBucket('gemini',next.classifierModel,'project'),directQuotaBucket('gemini',next.classifierModel,'project'));
 assert.notEqual(directQuotaBucket('gemini',next.classifierModel,'project'),directQuotaBucket('gemini',next.judgeModel,'project'));
 assert.notEqual(directQuotaBucket('gemini',next.classifierModel,'project'),directQuotaBucket('gemini',next.classifierModel,'other-project'));
 assert.throws(()=>ConfigSchema.parse({...next,direct:{...next.direct,classifier:{...next.direct!.classifier,requestsPerDay:0}}}));
});

test('cota diária esgotada não envia nem consome tentativa; bloqueio da API persiste entre clientes',async()=>temporary(async dir=>{
 const original=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='FIXTURE';
 try{
  const c=await getConfig(resolveRoot('config/individual-v14-limites.json'));
  let sends=0,attempts=0;
  const file=path.join(dir,'rate.json'),options={requestsPerMinute:100,minIntervalMs:0,requestsPerDay:1500};
  const fetcher:typeof fetch=async()=>{sends++;return jsonResponse({error:{code:429,message:'quota exceeded',details:[{violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel',quotaMetric:'requests'}]},{retryDelay:'3600s'}]}},429);};
  const budget=await SpendBudget.open(path.join(dir,'spend.json'),10,5);
  const make=()=>new SharedRateLimiter(file,options);
  const client=new DirectClient(c,new Logger(dir),budget,fetcher,make);
  await assert.rejects(client.call('judge',c.judgeModel,messages,schema,['Q0001'],async()=>{attempts++;}),/diária esgotada/);
  assert.equal(sends,1);assert.equal(attempts,1);
  const second=new DirectClient(c,new Logger(dir),budget,fetcher,make);
  await assert.rejects(second.call('judge',c.judgeModel,messages,schema,['Q0001'],async()=>{attempts++;}),/Provedor informou/);
  assert.equal(sends,1);assert.equal(attempts,1);assert.equal(budget.summary().calls,1);
  assert.match(await readFile(path.join(dir,'events.jsonl'),'utf8'),/daily_quota_exhausted/);
 }finally{if(original===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=original;}
}));

test('orçamento ou persistência bloqueados devolvem reserva diária sem realizar HTTP',async()=>temporary(async dir=>{
 const original=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='FIXTURE';
 try{
  const c=await getConfig(resolveRoot('config/individual-v14-limites.json'));
  const file=path.join(dir,'rate.json'),make=()=>new SharedRateLimiter(file,{requestsPerMinute:100,minIntervalMs:0,requestsPerDay:1});
  const fetcher:typeof fetch=async()=>{throw new Error('Não deve enviar');};
  const tiny=await SpendBudget.open(path.join(dir,'tiny.json'),0.000001,5);
  await assert.rejects(new DirectClient(c,new Logger(dir),tiny,fetcher,make).call('judge',c.judgeModel,messages,schema,['Q0001']),/Orçamento/);
  assert.equal(JSON.parse(await readFile(file,'utf8')).daily.requests,0);
  const ample=await SpendBudget.open(path.join(dir,'ample.json'),10,5);
  await assert.rejects(new DirectClient(c,new Logger(dir),ample,fetcher,make).call('judge',c.judgeModel,messages,schema,['Q0001'],async()=>{throw new Error('Falha ao salvar');}),/Falha ao salvar/);
  assert.equal(JSON.parse(await readFile(file,'utf8')).daily.requests,0);assert.equal(ample.summary().calls,0);
 }finally{if(original===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=original;}
}));

test('migração diária conta falhas e chamadas conhecidas; duplicatas e not_sent não inflam o histórico',async()=>temporary(async dir=>{
 const {mkdir,copyFile}=await import('node:fs/promises');
 const {knownDirectStarts}=await import('../src/providers/budget.js');
 await mkdir(path.join(dir,'a'));await mkdir(path.join(dir,'b'));
 const p=config.direct!.classifier, model='fixture-model';
 const budget=await SpendBudget.open(path.join(dir,'a','spend.json'),10,5);
 await budget.reserve('sent','classifier',model,p,100);await budget.settle('sent',p,{inputTokens:100,cachedInputTokens:0,outputTokens:20,reasoningTokens:0});
 await budget.reserve('unknown','classifier',model,p,100);await budget.settle('unknown',p,null);
 await budget.reserve('not-sent','classifier',model,p,100);await budget.settle('not-sent',p,null,true);
 await copyFile(path.join(dir,'a','spend.json'),path.join(dir,'b','spend.json'));
 assert.equal((await knownDirectStarts(dir,p.provider,model)).length,2);
 assert.equal((await knownDirectStarts(dir,p.provider,'other')).length,0);
}));

test('v15 aceita Gemini 3.5, preserva RAG e configura espaçamento por modelo',async()=>{
 const old=await getConfig(resolveRoot('config/individual-v14-limites.json'));
 const c=await getConfig(resolveRoot('config/individual-v15-gemini35.json'));
 assert.equal(c.classifierModel,'gemini-3.5-flash-lite');assert.equal(c.judgeModel,old.judgeModel);
 assert.deepEqual(c.knowledge,old.knowledge);assert.equal(c.classifierPrompt,old.classifierPrompt);assert.equal(c.judgePrompt,old.judgePrompt);
 assert.equal(c.direct!.classifier.requestsPerMinute,30);assert.equal(c.direct!.classifier.tokensPerMinute,1_000_000);assert.equal(c.direct!.classifier.requestsPerDay,1500);
 assert.equal(c.direct!.classifier.minIntervalMs,2100);assert.equal(c.direct!.judge.minIntervalMs,4100);
 assert.equal(c.direct!.classifier.inputUsdPerMillion,0.30);assert.equal(c.direct!.classifier.outputUsdPerMillion,2.50);assert.equal(c.direct!.classifier.cachedInputUsdPerMillion,0.03);
 assert.equal(geminiBody(c.classifierModel,c.direct!.classifier,messages,schema).generationConfig.thinkingConfig.thinkingLevel,'HIGH');
 const swap=await getConfig(resolveRoot('config/individual-v15-gemini35.json'),true);
 assert.equal(swap.direct!.classifier.minIntervalMs,4100);assert.equal(swap.direct!.judge.minIntervalMs,2100);
});

test('nova chave em outro projeto usa histórico separado, preservando ledgers anteriores', async () => temporary(async dir => {
  const { mkdir } = await import('node:fs/promises');
  const { knownDirectStarts } = await import('../src/providers/budget.js');
  await mkdir(path.join(dir, 'old')); await mkdir(path.join(dir, 'new'));
  const profile = config.direct!.classifier, model = config.classifierModel;
  const old = await SpendBudget.open(path.join(dir, 'old', 'spend.json'), 10, 5);
  await old.reserve('old', 'classifier', model, profile, 100);
  // Compatibility with historical files that predate the project field.
  const legacy = JSON.parse(await readFile(old.file, 'utf8')); delete legacy.entries.old.quotaScope;
  await atomicJson(old.file, legacy);
  const current = await SpendBudget.open(path.join(dir, 'new', 'spend.json'), 10, 5);
  await current.reserve('new', 'classifier', model, profile, 100, 'google-projeto2');
  assert.equal((await knownDirectStarts(dir, profile.provider, model)).length, 1);
  assert.equal((await knownDirectStarts(dir, profile.provider, model, 'google-projeto2')).length, 1);
  assert.equal((await knownDirectStarts(dir, profile.provider, model, 'unused-project')).length, 0);
  const previous = await getConfig(resolveRoot('config/individual-v15-gemini35.json'));
  const next = await getConfig(resolveRoot('config/individual-v16-projeto2.json'));
  assert.equal(next.direct!.quotaScope, 'google-projeto2');
  assert.deepEqual({ ...next.direct, quotaScope: 'workspace' }, previous.direct);
}));

test('trava de inferência serializa clientes de papéis distintos e libera após falha', async () => temporary(async dir => {
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'FIXTURE';
  let active = 0, peak = 0, sent = 0;
  try {
    const c = await getConfig(resolveRoot('config/individual-v16-projeto2.json'));
    c.direct!.quotaScope = `test-serial-${path.basename(dir)}`;
    const transport: typeof fetch = async () => {
      active++; peak = Math.max(peak, active); sent++;
      await delay(30); active--;
      return jsonResponse(googleFinal);
    };
    const first = new DirectClient(c, new Logger(path.join(dir, 'a')), await SpendBudget.open(path.join(dir, 'a', 'spend.json'), 10, 5), transport, noopLimiter);
    const second = new DirectClient(c, new Logger(path.join(dir, 'b')), await SpendBudget.open(path.join(dir, 'b', 'spend.json'), 10, 5), transport, noopLimiter);
    await Promise.all([
      first.call('classifier', c.classifierModel, messages, schema, ['Q0001']),
      second.call('judge', c.judgeModel, messages, schema, ['Q0002']),
    ]);
    assert.equal(peak, 1); assert.equal(sent, 2);
    const file = path.join(dir, 'serial.lock');
    await assert.rejects(withInferenceLock(file, async () => { throw new Error('falha'); }, 1000), /falha/);
    assert.equal(await withInferenceLock(file, async () => 42, 1000), 42);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
}));

test('429 transitório aguarda pelo menos 20s, usa 60s sem indicação e mantém cinco tentativas por etapa', async () => temporary(async dir => {
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'FIXTURE';
  try {
    const c = await getConfig(resolveRoot('config/individual-v16-projeto2.json'));
    assert.equal(c.maxAttemptsPerStage, 5);
    const budget = await SpendBudget.open(path.join(dir, 'spend.json'), 10, 5);
    for (const [headers, expected] of [[{ 'retry-after': '2' }, 20000], [{}, 60000]] as const) {
      let sends = 0, pausedUntil = 0;
      const client = new DirectClient(c, new Logger(dir), budget, async () => {
        sends++;
        return jsonResponse({ error: { status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }] }] } }, 429, headers);
      }, () => ({ acquire: async () => {}, deferUntil: async at => { pausedUntil = at; } }));
      const started = Date.now();
      await assert.rejects(client.call('judge', c.judgeModel, messages, schema, ['Q0001']), error => error instanceof RetryableCallError && error.retryAfterMs === expected);
      assert.equal(sends, 1); assert.ok(pausedUntil >= started + expected);
    }
    assert.match(await readFile(path.join(dir, 'events.jsonl'), 'utf8'), /rate_limited/);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
}));
