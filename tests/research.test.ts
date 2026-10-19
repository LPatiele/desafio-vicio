import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { getConfig } from "../src/config.js";
import { ConfigSchema, type RecordState, type Prepared, type Proposal, type Verdict } from "../src/types.js";
import { ToolRegistry } from "../src/mcp/tool-registry.js";
import { LexmlClient, serverEnvironment, verifySourceLock, type ResearchBackend } from "../src/mcp/lexml-client.js";
import { normalizeEvidence, citedSources, type ResearchState } from "../src/research/evidence.js";
import { ResearchSession } from "../src/research/session.js";
import { OpenRouterClient, RetryableCallError, type ToolCall, type Message } from "../src/client.js";
import { createGraph } from "../src/graph.js";
import { importProposals } from "../src/runner.js";
import { validateResearchCheckpoint } from "../src/research/checkpoint.js";
import { Logger } from "../src/logger.js";
import { atomicJson, hash, resolveRoot } from "../src/utils.js";

const tools = [{ name: "lexml_search", inputSchema: { type: "object", properties: { query: { type: "string" }, filters: { type: "object" }, maximum_records: { type: "integer" } }, additionalProperties: false } }, { name: "lexml_resolve_urn", inputSchema: { type: "object", properties: { urn: { type: "string" }, verify: { type: "boolean" } }, required: ["urn"] } }];
const raw = { number_of_records: 1, records: [{ title: ["FIXTURE — furto"], identifier: ["https://www.lexml.gov.br/test-only"] }], provenance: { backend_name: "test-only", retrieved_at: "2026-10-17" } };
const proposal: Proposal = { id: "Q0001", tema_central_id: "2", fora: false, extras_ids: [], concorrentes_ids: ["3"], evidencias: [{ campo: "enunciado", trecho: "subtraiu um bem sem violência" }], justificativa: "O conhecimento necessário é a subtração sem violência.", incertezas: [], confianca_declarada: 0.9 };
const rubric = { avaliacao: "sustentado" as const, justificativa: "Subtração sem violência caracteriza o instituto." };
const verdict: Verdict = { id: "Q0001", tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric, tema_alternativo_id: null, fora_sustentado: false, extras_sustentados_ids: [], alertas: [] };
const data: Prepared = { version: 1, inputHashes: { questions: "fixture", themes: "fixture" }, cleaning: [], questions: [{ id: "Q0001", enunciado: "O agente subtraiu um bem sem violência.", comando: "Assinale.", alternativas: {}, avisos: [] }], themes: [
  { tema_id: "1", parent_id: "", disciplina: "Penal", nivel: 0, titulo: "Penal", caminho: "Penal", descricao: "Disciplina", status: "active" },
  { tema_id: "2", parent_id: "1", disciplina: "Penal", nivel: 1, titulo: "Furto", caminho: "Penal > Furto", descricao: "Subtração sem violência", status: "active" },
  { tema_id: "3", parent_id: "1", disciplina: "Penal", nivel: 1, titulo: "Roubo", caminho: "Penal > Roubo", descricao: "Subtração com violência", status: "active" },
] };
const unthrottled = { acquire: async () => {}, deferUntil: async () => {} };
const call: ToolCall = { id: "tool-1", type: "function", function: { name: "lexml_search", arguments: '{"query":"dc.title any furto","maximum_records":5}' } };
async function config() { return { ...await getConfig(resolveRoot("config/lexml-pesquisa-v4.json")), minIntervalMs: 0, retryBaseDelayMs: 0 }; }
const response = (tool: boolean, content = JSON.stringify({ resultados: [verdict] })) => new Response(JSON.stringify({ model: "fixture:free", usage: { cost: 0 }, choices: [{ finish_reason: tool ? "tool_calls" : "stop", message: tool ? { role: "assistant", content: null, tool_calls: [call], reasoning_details: [{ type: "reasoning.encrypted", data: "opaque-test" }] } : { role: "assistant", content } }] }));

test("registro permite somente ferramentas aprovadas e limita argumentos", () => {
  const registry = new ToolRegistry([...tools, { name: "execute_shell", inputSchema: {} }]);
  assert.equal(registry.definitions.length, 2);
  assert.throws(() => registry.arguments("execute_shell", "{}"), /não permitida/);
  assert.throws(() => registry.arguments("lexml_search", '{"query":"a","maximum_records":100}'), /cinco/);
  assert.throws(() => registry.arguments("lexml_search", '{"query":"a","filters":{}}'), /exclusivamente/);
  assert.throws(() => registry.arguments("lexml_search", '{"query":"a","injected":true}'), /inválidos/);
  assert.throws(() => registry.arguments("lexml_resolve_urn", '{"urn":"https://localhost"}'), /URN/);
  assert.equal(registry.arguments("lexml_resolve_urn", '{"urn":"urn:lex:br:federal:lei:1990-09-11;8078","verify":false}').verify, true);
});

test("evidência distingue sucesso, vazio, desafio HTML, erros e resposta sem proveniência", () => {
  assert.equal(normalizeEvidence(raw, 12000).status, "ok");
  assert.equal(normalizeEvidence({ content: [{ type: "text", text: JSON.stringify(raw) }] }, 12000).sources[0]!.kind, "metadata_only");
  assert.equal(normalizeEvidence({ ...raw, records: [], number_of_records: 0 }, 12000).status, "empty");
  assert.equal(normalizeEvidence({ is_challenge_like: true, status_code: 200 }, 12000).status, "challenge");
  assert.equal(normalizeEvidence({ error: { type: "timeout" } }, 12000).retryable, true);
  assert.equal(normalizeEvidence({ records: [], number_of_records: 0 }, 12000).status, "invalid");
  assert.equal(normalizeEvidence({ content: [{ type: "text", text: "<html>verificação</html>" }] }, 12000).status, "invalid");
  assert.equal(normalizeEvidence(raw, 10).status, "oversized");
  assert.equal(normalizeEvidence({ provenance: {}, public_url: "https://www.lexml.gov.br/urn/a" }, 12000).status, "invalid");
});

test("IDs de fontes são verificáveis e não substituem evidências da questão", () => {
  const evidence = normalizeEvidence(raw, 12000);
  const operations = [{ toolCallId: call.id, name: "lexml_search", rawArguments: call.function.arguments, attempts: 1, state: "complete" as const, result: evidence }];
  assert.deepEqual(citedSources(evidence.sources[0]!.id, operations), [evidence.sources[0]!.id]);
  assert.throws(() => citedSources("S-000000000000", operations), /não recuperada/);
});

test("MCP alternativo usa argumentos próprios e não expõe ferramentas processuais", () => {
  const registry = new ToolRegistry([
    { name: "pesquisar_lexml", inputSchema: { type: "object", properties: { termos: { type: "string" }, campo: { type: "string" }, limite: { type: "integer" }, pagina: { type: "integer" } }, required: ["termos"] } },
    { name: "resolver_urn_lexml", inputSchema: { type: "object", properties: { urn: { type: "string" } }, required: ["urn"] } },
    { name: "confirmar_leitura_intimacao", inputSchema: {} },
  ]);
  assert.equal(registry.searchName, "pesquisar_lexml"); assert.equal(registry.definitions.length, 2);
  assert.deepEqual(registry.arguments("pesquisar_lexml", '{"termos":"furto"}'), { termos: "furto", limite: 5, pagina: 1 });
  assert.throws(() => registry.arguments("pesquisar_lexml", '{"termos":"furto","limite":10}'), /cinco/);
  assert.throws(() => registry.arguments("pesquisar_lexml", '{"termos":"furto","pagina":2}'), /primeira/);
  assert.equal(registry.arguments("resolver_urn_lexml", '{"urn":"urn:lex:br:federal:lei:1990-09-11;8078"}').verify, undefined);
});

test("normalização do MCP alternativo conserva metadados e distingue resolvedor offline", () => {
  const result = normalizeEvidence({ documentos: [{ urn: "urn:lex:br:federal:lei:1990-09-11;8078", titulo: "FIXTURE CDC", url_resolvedor: "https://www.lexml.gov.br/urn/test-only" }], total_resultados: 1, provenance: { producer: "application_adapter" } }, 12000);
  assert.equal(result.status, "ok"); assert.equal(result.sources[0]!.title, "FIXTURE CDC"); assert.equal(result.sources[0]!.kind, "metadata_only");
  const offline = normalizeEvidence({ valida: true, url_resolvedor: "https://www.lexml.gov.br/urn/test-only", resolution_verified: false, provenance: { producer: "application_adapter" } }, 12000);
  assert.equal(offline.status, "ok"); assert.match(offline.sources[0]!.title, /offline/);
});

test("cliente MCP negocia stdio real com fixture e não herda chave OpenRouter", async () => {
  const dir = await mkdtemp(resolveRoot("output/mcp-test-"));
  const previous = process.env.OPENROUTER_API_KEY;
  let client: LexmlClient | undefined;
  try {
    process.env.OPENROUTER_API_KEY = "fixture-secret";
    assert.equal(serverEnvironment(15000).OPENROUTER_API_KEY, undefined);
    const fixture = "tests/fixtures/lexml-mcp.mjs";
    const c = (await config()).research!;
    c.provider = "prof-ramos/LeXML-mcp";
    delete c.environmentLock;
    c.command = process.execPath; c.args = [resolveRoot(fixture)]; c.cwd = ".";
    c.sourceLock = path.relative(resolveRoot(), `${dir}/source-lock.json`);
    const lock = { status: "verified", revision: "a".repeat(40), repository: "local-fixture-only", cwd: ".", command: c.command, args: c.args, files: { [fixture]: hash(await readFile(resolveRoot(fixture), "utf8")) } };
    await atomicJson(resolveRoot(c.sourceLock), lock);
    client = await LexmlClient.connect(c);
    const result = normalizeEvidence(await client.call("lexml_search", { query: "fixture", maximum_records: 5 }), 12000);
    assert.equal(result.status, "empty");
    assert.equal((result.payload as { inheritedOpenRouterKey: boolean }).inheritedOpenRouterKey, false);
    await assert.rejects(client.call("execute_shell", {}), /bloqueada/);
    await atomicJson(resolveRoot(c.sourceLock), { ...lock, files: { [fixture]: "changed" } });
    await assert.rejects(verifySourceLock(c), /mudou/);
  } finally { await client?.close(); if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; await rm(dir, { recursive: true, force: true }); }
});

test("transporte preserva IDs/raciocínio e aplica JSON schema apenas na fase final", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-turn-"));
  const original = globalThis.fetch;
  try {
    const c = await config(); let requests = 0, reservations = 0;
    const client = new OpenRouterClient(c, new Logger(dir), null, unthrottled);
    const definitions = new ToolRegistry(tools).definitions;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)); requests++;
      assert.equal(reservations, requests);
      if (requests === 1) assert.equal(body.response_format, undefined);
      else { assert.equal(body.response_format.type, "json_schema"); assert.equal(body.tool_choice, "none"); assert.deepEqual(body.messages[0].reasoning_details, [{ type: "reasoning.encrypted", data: "opaque-test" }]); assert.equal(body.messages[1].tool_call_id, call.id); }
      return response(requests === 1);
    };
    const schema = z.object({ resultados: z.array(z.any()) });
    const first = await client.turn("judge", c.judgeModel, [], schema, ["Q0001"], async () => { reservations++; }, { tools: definitions, choice: { type: "function", function: { name: "lexml_search" } }, final: false });
    assert.equal(first.kind, "tools");
    const messages: Message[] = [first.message, { role: "tool", tool_call_id: call.id, content: JSON.stringify(raw) }];
    assert.equal((await client.turn("judge", c.judgeModel, messages, schema, ["Q0001"], async () => { reservations++; }, { tools: definitions, choice: "none", final: true })).kind, "final");
    assert.equal(client.calls, 2);
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

async function harness(dir: string, backendCall: ResearchBackend["call"] = async () => raw) {
  const c = await config();
  let saved: Record<string, RecordState> = { Q0001: { id: "Q0001", proposal, errors: [] } };
  const logger = new Logger(dir);
  const backend = { registry: new ToolRegistry(tools), identity: { fixture: true }, call: backendCall };
  const session = new ResearchSession(backend, c.research!, logger, dir);
  const graph = (maxCalls = 50) => createGraph({ config: c, data, prompts: { classifier: "fixture", judge: "fixture" }, logger, caller: new OpenRouterClient({ ...c, maxCalls }, logger, null, unthrottled), research: session, save: async records => { saved = structuredClone(records); } });
  return { c, graph, saved: () => saved, session };
}

test("juiz pesquisa e chega ao parecer sem repetir revisão válida", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-judge-")); const original = globalThis.fetch;
  try {
    let requests = 0, searches = 0;
    const h = await harness(dir, async () => { searches++; return raw; });
    globalThis.fetch = async () => { requests++; assert.equal(h.saved().Q0001!.attempts?.judge, requests); return response(requests === 1, JSON.stringify({ resultados: [{ ...verdict, tema_central: { ...rubric, avaliacao: "incerto" } }] })); };
    const result = await h.graph().invoke({ ids: ["Q0001"], records: h.saved() });
    assert.equal(result.records.Q0001!.research?.status, "complete");
    assert.equal(result.records.Q0001!.attempts?.judge, 2);
    assert.equal(result.records.Q0001!.decision?.decisao, "revisar");
    await h.graph().invoke({ ids: ["Q0001"], records: result.records });
    assert.equal(requests, 2); assert.equal(searches, 1);
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

test("retomada conserva consulta e orçamento após parar antes da resposta final", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-resume-")); const original = globalThis.fetch;
  try {
    let requests = 0, searches = 0;
    const h = await harness(dir, async () => { searches++; return raw; });
    globalThis.fetch = async () => response(++requests === 1);
    await assert.rejects(h.graph(1).invoke({ ids: ["Q0001"], records: h.saved() }), /Orçamento/);
    assert.equal(h.saved().Q0001!.attempts?.judge, 1);
    assert.equal(searches, 1);
    const result = await h.graph().invoke({ ids: ["Q0001"], records: h.saved() });
    assert.equal(result.records.Q0001!.decision?.decisao, "publicar");
    assert.equal(result.records.Q0001!.attempts?.judge, 2); assert.equal(searches, 1);
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

test("desafio HTTP 200 impede parecer/publicação e não é repetido", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-challenge-")); const original = globalThis.fetch;
  try {
    let searches = 0, requests = 0;
    const h = await harness(dir, async () => { searches++; return { is_challenge_like: true, status_code: 200 }; });
    globalThis.fetch = async () => { requests++; return response(true); };
    const result = await h.graph().invoke({ ids: ["Q0001"], records: h.saved() });
    assert.equal(result.records.Q0001!.research?.status, "unavailable"); assert.equal(result.records.Q0001!.verdict, undefined); assert.equal(result.records.Q0001!.decision, undefined);
    await h.graph().invoke({ ids: ["Q0001"], records: result.records });
    assert.equal(searches, 1); assert.equal(requests, 1);
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

test("falhas de inferência esgotam cinco envios totais sem renovar na retomada", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-cap-")); const original = globalThis.fetch;
  try {
    let requests = 0; const h = await harness(dir);
    globalThis.fetch = async () => { requests++; throw new TypeError("fixture network"); };
    const result = await h.graph().invoke({ ids: ["Q0001"], records: h.saved() });
    assert.equal(result.records.Q0001!.attempts?.judge, 5); assert.equal(result.records.Q0001!.research?.status, "exhausted");
    await h.graph().invoke({ ids: ["Q0001"], records: result.records }); assert.equal(requests, 5);
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

test("sessão limita MCP a dois envios por operação e cacheia apenas sucesso", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-cache-"));
  try {
    let calls = 0; const h = await harness(dir, async () => { calls++; return calls < 3 ? { error: { type: "timeout" } } : raw; });
    const state = (): ResearchState => ({ status: "running", messages: [], operations: [{ toolCallId: call.id, name: call.function.name, rawArguments: call.function.arguments, attempts: 0, state: "pending" }], sourcesUsed: [] });
    const failed = state(); await h.session.completePending(failed, async () => {}); assert.equal(calls, 2); assert.equal(failed.operations[0]!.result?.status, "error");
    const success = state(); await h.session.completePending(success, async () => {}); assert.equal(calls, 3); assert.equal(success.operations[0]!.result?.status, "ok");
    const cached = state(); await h.session.completePending(cached, async () => {}); assert.equal(calls, 3); assert.equal(cached.operations[0]!.cacheHit, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("pesquisa exige modo individual sem multiplicador de tentativas", async () => {
  const c = await config();
  assert.throws(() => ConfigSchema.parse({ ...c, batchSize: 10 }));
  assert.throws(() => ConfigSchema.parse({ ...c, maxRetries: 1 }));
  assert.throws(() => ConfigSchema.parse({ ...c, maxAttemptsPerStage: 1 }));
});

test("etapa final com auto recusa nova ferramenta e não a executa", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-final-")); const original = globalThis.fetch;
  try {
    const c = await config(); let reservations = 0;
    globalThis.fetch = async () => response(true);
    const client = new OpenRouterClient(c, new Logger(dir), null, unthrottled);
    await assert.rejects(client.turn("judge", c.judgeModel, [], z.object({ result: z.string() }), ["Q0001"], async () => { reservations++; }, { tools: new ToolRegistry(tools).definitions, choice: "auto", final: true }), RetryableCallError);
    assert.equal(reservations, 1); assert.equal(client.calls, 1);
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

test("limite de conteúdo por questão não vira busca válida sem fonte entregue", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-content-"));
  try {
    const h = await harness(dir, async () => ({ ...raw, records: [{ title: "x".repeat(1500), identifier: "https://www.lexml.gov.br/test-only" }] }));
    h.session.config.maxQuestionCharacters = 1000;
    const state: ResearchState = { status: "running", messages: [], operations: [{ toolCallId: call.id, name: call.function.name, rawArguments: call.function.arguments, attempts: 0, state: "pending" }], sourcesUsed: [] };
    await h.session.completePending(state, async () => {});
    assert.equal(state.operations[0]!.result?.status, "oversized"); assert.equal(h.session.successfulSearch(state), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("checkpoint rejeita limites reiniciados e parecer sem consulta concluída", async () => {
  const c = await config();
  assert.throws(() => validateResearchCheckpoint({ id: "Q0001", proposal, verdict, errors: [] }, c), /sem pesquisa/);
  const state: ResearchState = { status: "running", messages: [{ role: "assistant", content: null, tool_calls: [call] }], operations: [{ toolCallId: call.id, name: call.function.name, rawArguments: call.function.arguments, attempts: 3, state: "pending" }], sourcesUsed: [] };
  assert.throws(() => validateResearchCheckpoint({ id: "Q0001", proposal, research: state, errors: [] }, c), /limites/);
  state.operations[0]!.attempts = 0;
  assert.throws(() => validateResearchCheckpoint({ id: "Q0001", proposal, research: state, errors: [] }, c), /contabilização/);
});

test("parecer com fonte inventada exige correção sem refazer a consulta", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-citation-")); const original = globalThis.fetch;
  try {
    let requests = 0, searches = 0;
    const h = await harness(dir, async () => { searches++; return raw; });
    globalThis.fetch = async () => {
      requests++;
      return response(requests === 1, JSON.stringify({ resultados: [{ ...verdict, tema_central: { ...rubric, justificativa: requests === 2 ? "Conforme S-000000000000, o tema é adequado." : rubric.justificativa } }] }));
    };
    const result = await h.graph().invoke({ ids: ["Q0001"], records: h.saved() });
    assert.equal(result.records.Q0001!.attempts?.judge, 3); assert.equal(searches, 1);
    assert.match(result.records.Q0001!.errors[0]!.message, /não recuperada/);
    assert.equal(result.records.Q0001!.decision?.decisao, "publicar");
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }); }
});

test("importação copia apenas propostas válidas e registra hashes de origem", async () => {
  const dir = await mkdtemp(resolveRoot("output/experiments/mcp-import-test-"));
  try {
    await atomicJson(`${dir}/manifest.json`, { inputHashes: data.inputHashes });
    await atomicJson(`${dir}/records.json`, { Q0001: { id: "Q0001", proposal, verdict, decision: { decisao: "publicar" }, attempts: { classifier: 4, judge: 5 } } });
    const imported = await importProposals(path.basename(dir), data, ["Q0001"]);
    assert.equal(imported.records.Q0001!.verdict, undefined); assert.equal(imported.records.Q0001!.attempts, undefined);
    assert.equal(imported.provenance.proposalHashes.Q0001, hash(JSON.stringify(proposal)));
    await atomicJson(`${dir}/records.json`, { Q0001: { proposal: { ...proposal, tema_central_id: "999" } } });
    await assert.rejects(importProposals(path.basename(dir), data, ["Q0001"]), /inválida/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
