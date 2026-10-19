import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanHtml, indexThemes, relationship } from "../src/data.js";
import { getConfig } from "../src/config.js";
import { ConfigSchema, ProposalSchema, type Proposal, type Question, type Theme, type Verdict, type RecordState, type Prepared } from "../src/types.js";
import { parseBatch, redact, atomicJson, resolveRoot } from "../src/utils.js";
import { decide, validateProposal, validateVerdict } from "../src/validation.js";
import { createGraph } from "../src/graph.js";
import { Logger } from "../src/logger.js";
import { batchIds } from "../src/runner.js";
import { OpenRouterClient, StopRun, RetryableCallError, preflight, type ModelCaller } from "../src/client.js";
import { wilson, metrics, type ComparisonRow } from "../src/evaluation.js";
import { exportDelivery } from "../src/export.js";

const unthrottled = { acquire: async () => {}, deferUntil: async () => {} };

const themes: Theme[] = [
  { tema_id: "1", parent_id: "", nivel: 0, titulo: "Penal", caminho: "Penal", descricao: "Disciplina", disciplina: "Penal", status: "active" },
  { tema_id: "2", parent_id: "1", nivel: 1, titulo: "Patrimônio", caminho: "Penal > Patrimônio", descricao: "Crimes patrimoniais", disciplina: "Penal", status: "active" },
  { tema_id: "3", parent_id: "2", nivel: 2, titulo: "Furto", caminho: "Penal > Patrimônio > Furto", descricao: "Subtração", disciplina: "Penal", status: "active" },
  { tema_id: "4", parent_id: "2", nivel: 2, titulo: "Roubo", caminho: "Penal > Patrimônio > Roubo", descricao: "Violência", disciplina: "Penal", status: "active" },
  { tema_id: "5", parent_id: "1", nivel: 1, titulo: "Inativo", caminho: "Penal > Inativo", descricao: "", disciplina: "Penal", status: "inactive" },
];
const index = indexThemes(themes);
const question: Question = { id: "Q0001", enunciado: "O agente subtraiu um bem sem violência.", comando: "Assinale a correta.", alternativas: { A: "Furto simples.", B: "Roubo simples." }, avisos: [] };
const proposal: Proposal = { id: "Q0001", tema_central_id: "3", fora: false, extras_ids: [], concorrentes_ids: ["4"], evidencias: [{ campo: "enunciado", trecho: "subtraiu um bem sem violência" }], justificativa: "A questão cobra subtração sem violência.", incertezas: [], confianca_declarada: 0.93 };
const rubric = { avaliacao: "sustentado" as const, justificativa: "A subtração sem violência sustenta o instituto." };
const verdict: Verdict = { id: "Q0001", tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric, tema_alternativo_id: null, fora_sustentado: false, extras_sustentados_ids: [], alertas: [] };

test("limpa resíduos Word, estilos, entidades e quebras literais sem apagar o texto", () => {
  assert.equal(cleanHtml('<!--[if gte mso 9]><xml>lixo</xml><![endif]--><style>body {x:1}</style><p>Furto&nbsp;simples.</p><br>A\\nB'), "Furto simples.\n\nA\nB");
  assert.equal(cleanHtml("2 &lt; 3 e 4 &gt; 1"), "2 < 3 e 4 > 1");
});
test("Q0099 perde formatação Word mantendo as alternativas jurídicas", async () => {
  const qs = (await readFile(new URL("../anexos/questoes.jsonl", import.meta.url), "utf8")).trim().split("\n").map(l => JSON.parse(l));
  const q = qs.find(q => q.id === "Q0099");
  for (const key of ["B", "C", "D"]) {
    const text = cleanHtml(q.alternativas[key]);
    assert.ok(text.length < 1000);
    assert.match(text, /Filomena praticou/);
    assert.doesNotMatch(text, /OfficeDocumentSettings|MsoNormal/);
  }
});
test("relação aceita pais e filhos, rejeita irmãos e trata fora separadamente", () => {
  assert.equal(relationship("2", "3", index), "ancestral");
  assert.equal(relationship("3", "2", index), "descendente");
  assert.equal(relationship("3", "4", index), "irmao");
  assert.equal(relationship(null, null, index), "fora");
  assert.equal(relationship(null, "3", index), "distinto");
});
test("árvore com ciclos, pais ausentes ou IDs duplicados é rejeitada", () => {
  assert.throws(() => indexThemes([...themes, themes[0]!]));
  assert.throws(() => indexThemes([{ ...themes[0]!, parent_id: "99" }]));
  assert.throws(() => indexThemes([{ ...themes[0]!, parent_id: "1" }]));
});
test("rejeita temas inventados, inativos, evidência falsa e concorrente ausente", () => {
  assert.deepEqual(validateProposal(proposal, question, index), []);
  for (const id of ["999", "5"]) assert.ok(validateProposal({ ...proposal, tema_central_id: id }, question, index).length);
  assert.ok(validateProposal({ ...proposal, evidencias: [{ campo: "enunciado", trecho: "Texto que não existe" }] }, question, index).length);
  assert.ok(validateProposal({ ...proposal, concorrentes_ids: [] }, question, index).length);
  assert.deepEqual(validateProposal({ ...proposal, evidencias: [{ campo: "alternativa:A", trecho: "Furto simples." }] }, question, index), []);
});
test("valida por ID, conserva itens válidos e sinaliza ausentes, duplicados e desconhecidos", () => {
  const raw = JSON.stringify({ resultados: [proposal, { ...proposal, id: "Q0002" }, { ...proposal, id: "Q0002" }, { id: "Q0003" }, { ...proposal, id: "Q9999" }] });
  const result = parseBatch(raw, ProposalSchema, ["Q0001", "Q0002", "Q0003", "Q0004"]);
  assert.equal(result.valid.length, 1);
  assert.equal(Object.keys(result.errors).length, 3);
  assert.deepEqual(result.unexpected, ["Q9999"]);
  assert.equal(parseBatch("não é JSON", ProposalSchema, ["Q0001"]).valid.length, 0);
});
test("publicação requer três sustentações e ausência de pendência material", () => {
  assert.equal(decide(proposal, verdict, question, index, { allowRootPublication: false })?.decisao, "publicar");
  for (const field of ["tema_central", "evidencia_textual", "distincao_de_concorrentes"] as const) {
    assert.equal(decide(proposal, { ...verdict, [field]: { ...rubric, avaliacao: "incerto" } }, question, index, { allowRootPublication: false })?.decisao, "revisar");
  }
  assert.equal(decide({ ...proposal, incertezas: ["Texto incompleto"] }, verdict, question, index, { allowRootPublication: false })?.decisao, "revisar");
  assert.equal(decide(proposal, { ...verdict, tema_alternativo_id: "4" }, question, index, { allowRootPublication: false })?.decisao, "revisar");
  assert.equal(decide({ ...proposal, tema_central_id: "1" }, verdict, question, index, { allowRootPublication: false })?.decisao, "revisar");
});
test("fora precisa de sustentação; proposta fora contestada sem alternativa fica pendente", () => {
  const outside = { ...proposal, tema_central_id: null, fora: true };
  assert.equal(decide(outside, { ...verdict, fora_sustentado: true }, question, index, { allowRootPublication: false })?.decisao, "fora");
  assert.equal(decide(outside, verdict, question, index, { allowRootPublication: false }), null);
  assert.equal(decide(outside, { ...verdict, tema_alternativo_id: "3" }, question, index, { allowRootPublication: false })?.decisao, "revisar");
  assert.ok(validateVerdict({ ...verdict, extras_sustentados_ids: ["4"] }, proposal, index).length);
  assert.ok(validateVerdict({ ...verdict, fora_sustentado: true }, proposal, index).length);
});
test("padrão individual usa v3 e modelos distintos; lotes anteriores continuam disponíveis", async () => {
  const config = await getConfig(), swapped = await getConfig(undefined, true);
  assert.equal(config.batchSize, 1);
  assert.equal(config.maxAttemptsPerStage, 5);
  assert.equal(config.requestsPerMinute, 18);
  assert.throws(() => ConfigSchema.parse({ ...config, requestsPerMinute: 21 }));
  assert.equal(config.classifierPrompt, "classificador.v3.md");
  assert.equal(config.classifierModel, "nvidia/nemotron-3.5-super-vl:free");
  assert.equal(config.classifierModel, swapped.judgeModel);
  const data = { themes, questions: Array.from({ length: 61 }, (_, i) => ({ ...question, id: `Q${String(i + 1).padStart(4, "0")}` })) } as Prepared;
  assert.equal(batchIds(data.questions.map(q => q.id), data, config, {}).length, 61);
  const previous = await getConfig(resolveRoot("config/piloto-10-juiz-nemotron-3.5.json"));
  assert.equal(previous.maxAttemptsPerStage, 1);
  assert.deepEqual(batchIds(data.questions.map(q => q.id), data, previous, {}).map(b => b.length), [10, 10, 10, 10, 10, 10, 1]);
  assert.throws(() => ConfigSchema.parse({ ...config, maxRetries: 1 }), /não multiplicar/);
  assert.throws(() => ConfigSchema.parse({ ...config, batchSize: 10 }), /uma|batchSize/);
});
test("grafo faz duas chamadas por lote, salva após cada etapa e retoma só o juiz", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-test-"));
  try {
    const config = { ...await getConfig(), retryBaseDelayMs: 0 };
    const data = { version: 1, inputHashes: {}, questions: [question], themes, cleaning: [] } satisfies Prepared;
    const roles: string[] = [], snapshots: Record<string, RecordState>[] = [];
    const deps = { config, data, prompts: { classifier: "classificar", judge: "julgar" }, logger: new Logger(dir),
      save: async (records: Record<string, RecordState>) => { snapshots.push(structuredClone(records)); },
      caller: { call: (async (role, _model, _messages, _schema, _ids, beforeSend) => { await beforeSend?.("fixture"); roles.push(role); return JSON.stringify({ resultados: [role === "classifier" ? proposal : verdict] }); }) satisfies ModelCaller["call"] } };
    const graph = createGraph(deps);
    const result = await graph.invoke({ ids: [question.id], records: { [question.id]: { id: question.id, errors: [] } } });
    assert.deepEqual(roles, ["classifier", "judge"]);
    assert.equal(result.records[question.id]!.decision?.decisao, "publicar");
    assert.equal(snapshots[0]![question.id]!.attempts?.classifier, 1);
    assert.equal(snapshots.find(snapshot => snapshot[question.id]!.proposal)?.[question.id]!.proposal?.tema_central_id, "3");
    roles.length = 0;
    await graph.invoke({ ids: [question.id], records: { [question.id]: { id: question.id, proposal, errors: [] } } });
    assert.deepEqual(roles, ["judge"]);
    assert.equal(JSON.stringify(snapshots).includes("disciplina_origem"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("cliente não realiza chamada quando orçamento é zero", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-budget-"));
  try {
    const client = new OpenRouterClient({ ...await getConfig(), maxCalls: 0 }, new Logger(dir));
    await assert.rejects(client.call("classifier", "model:free", [], ProposalSchema, ["Q0001"]), StopRun);
    assert.equal(client.calls, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("registros removem credenciais e intervalos vazios não inventam precisão", () => {
  assert.deepEqual(redact({ key: "sk-or-v1-exemplo123", message: "ok" }), { key: "[REDACTED]", message: "ok" });
  assert.equal(wilson(0, 0), null);
  const interval = wilson(10, 10)!;
  assert.ok(interval[0] < 0.95); // ten agreements cannot establish the 95% target
});
test("avaliação conta fora equivocado como erro e não declara 100% sem publicações", () => {
  const row: ComparisonRow = { id: "Q0001", decisao: "revisar", tema_proposto: "3", tema_final: "3", tema_referencia: "3", relacao_proposta: "exato", relacao_final: "exato", referencia_limitada: false, raiz: false, exposicao_previa: false, aviso_entrada: false };
  const result = metrics([row, { ...row, id: "Q0002", tema_proposto: null, relacao_proposta: "distinto" }], 359);
  assert.equal(result.classifierAgreementBeforeFilter, 0.5);
  assert.equal(result.classifierAgreementDenominator, 2);
  assert.equal(result.publishedAgreement, null);
  assert.equal(result.coverageOf359, 0);
  assert.equal(metrics([{ ...row, decisao: "publicar", relacao_final: "irmao" }], 359).publishedAgreement, 0);
});
test("exportação não preenche pendências com classificações da referência", async () => {
  const parent = resolveRoot("output/experiments");
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(path.join(parent, "test-pending-"));
  try {
    const config = await getConfig();
    await atomicJson(`${dir}/manifest.json`, { config, inputHashes: {} });
    await atomicJson(`${dir}/records.json`, { Q0001: { id: "Q0001", errors: [] } });
    const data = { version: 1, inputHashes: {}, questions: [question], themes, cleaning: [] } satisfies Prepared;
    await assert.rejects(exportDelivery(path.basename(dir), data, "declared"), /Entrega bloqueada/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("transporte conta tentativas, registra consumo e rejeita resposta truncada", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-transport-"));
  const originalFetch = globalThis.fetch;
  try {
    const config = { ...await getConfig(), minIntervalMs: 0, maxRetries: 0, maxCalls: 2, reasoningByModel: { "model:free": { enabled: false as const } } };
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)).reasoning, { enabled: false });
      calls++;
      return new Response(JSON.stringify({ model: "model:free", provider: "fake", usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0 }, choices: [{ message: { content: '{"resultados":[]}' }, finish_reason: calls === 1 ? "stop" : "length" }] }), { status: 200 });
    };
    const client = new OpenRouterClient(config, new Logger(dir), null, unthrottled);
    assert.equal(await client.call("classifier", "model:free", [], ProposalSchema, ["Q0001"]), '{"resultados":[]}');
    await assert.rejects(client.call("judge", "model:free", [], ProposalSchema, ["Q0001"]), /incompleta/);
    await assert.rejects(client.call("judge", "model:free", [], ProposalSchema, ["Q0001"]), /Orçamento/);
    assert.equal(calls, 2);
    assert.equal(client.calls, 2);
    const requests = await readFile(`${dir}/requests.jsonl`, "utf8");
    assert.equal(requests.includes("Authorization"), false);
    assert.match(await readFile(`${dir}/events.jsonl`, "utf8"), /prompt_tokens/);
  } finally { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); }
});
test("consulta prévia respeita os níveis reais e permite ativar raciocínio no juiz", async () => {
  const config = await getConfig(resolveRoot("config/piloto-10-raciocinio.json"));
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const models = [
    { id: config.classifierModel, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["reasoning", "reasoning_effort", "structured_outputs"], reasoning: { supported_efforts: ["medium", "low", "none"], mandatory: false } },
    { id: config.judgeModel, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["reasoning", "structured_outputs"], reasoning: { mandatory: false } },
  ];
  try {
    process.env.OPENROUTER_API_KEY = "fixture-only";
    globalThis.fetch = async input => new Response(JSON.stringify({ data: String(input).endsWith("/models") ? models : { free_model_daily_requests: { used: 0, limit: 50, remaining: 50 } } }), { status: 200 });
    assert.deepEqual(config.reasoningByModel[config.judgeModel], { enabled: true });
    assert.equal((await preflight(config)).models[0]?.reasoning?.supported_efforts?.[0], "medium");
    await assert.rejects(preflight({ ...config, reasoningByModel: { [config.classifierModel]: { effort: "high" } } }), /Esforço high não é aceito/);
    models[0]!.reasoning.mandatory = true;
    await assert.rejects(preflight({ ...config, reasoningByModel: { [config.classifierModel]: { enabled: false } } }), /Raciocínio obrigatório/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test("individual corrige falhas técnicas até a quinta tentativa e não repete parecer válido de revisão", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-individual-"));
  const originalFetch = globalThis.fetch;
  try {
    const config = { ...await getConfig(), minIntervalMs: 0, retryBaseDelayMs: 0, maxCalls: 10 };
    let saved: Record<string, RecordState> = {}, classifier = 0, judge = 0;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const isClassifier = body.model === config.classifierModel;
      const role = isClassifier ? "classifier" : "judge";
      const attempt = isClassifier ? ++classifier : ++judge;
      assert.equal(saved.Q0001!.attempts?.[role], attempt, "contador deve estar salvo antes do envio");
      assert.equal(body.max_tokens, 32000, "questão isolada recebe o teto completo");
      assert.equal(JSON.parse(body.messages[1].content).questoes.length, 1);
      if (!isClassifier && attempt === 1) throw new DOMException("timeout simulado", "TimeoutError");
      let content = JSON.stringify({ resultados: [isClassifier ? proposal : { ...verdict, tema_central: { ...rubric, avaliacao: "incerto" } }] });
      if (isClassifier && attempt === 2) content = "{json inválido";
      if (isClassifier && attempt === 3) content = JSON.stringify({ resultados: [{ ...proposal, evidencias: [{ campo: "enunciado", trecho: "Trecho inventado pelo modelo" }] }] });
      if (isClassifier && attempt === 4) content = JSON.stringify({ resultados: [proposal, { ...proposal, id: "Q9999" }] });
      if (isClassifier && attempt === 5) assert.match(JSON.stringify(body.messages), /falha_tecnica_anterior/);
      return new Response(JSON.stringify({ model: body.model, usage: { cost: 0 }, choices: [{ finish_reason: isClassifier && attempt === 1 ? "length" : "stop", message: { content } }] }));
    };
    const logger = new Logger(dir);
    const caller = new OpenRouterClient(config, logger, null, unthrottled);
    const graph = createGraph({ config, data: { version: 1, inputHashes: {}, themes, questions: [question], cleaning: [] }, prompts: { classifier: "classificar", judge: "julgar" }, logger, caller, save: async records => { saved = structuredClone(records); } });
    const result = await graph.invoke({ ids: [question.id], records: { Q0001: { id: question.id, errors: [] } } });
    assert.deepEqual(result.records.Q0001!.attempts, { classifier: 5, judge: 2 });
    assert.equal(result.records.Q0001!.decision?.decisao, "revisar");
    assert.equal(caller.calls, 7);
    await graph.invoke({ ids: [question.id], records: result.records });
    assert.equal(caller.calls, 7, "revisão válida não autoriza novos pareceres");
  } finally { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); }
});

test("limite persiste entre retomadas, orçamento não gasta tentativa e falha de uma questão não bloqueia outra", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-resume-cap-"));
  const originalFetch = globalThis.fetch;
  try {
    const config = { ...await getConfig(), minIntervalMs: 0, retryBaseDelayMs: 0, maxCalls: 2 };
    const second = { ...question, id: "Q0002" };
    let saved: Record<string, RecordState> = { Q0001: { id: question.id, errors: [] }, Q0002: { id: second.id, errors: [] } }, requests = 0;
    globalThis.fetch = async () => { requests++; throw new TypeError("rede indisponível"); };
    const logger = new Logger(dir);
    const graphFor = (maxCalls: number) => createGraph({ config: { ...config, maxCalls }, data: { version: 1, inputHashes: {}, themes, questions: [question, second], cleaning: [] }, prompts: { classifier: "classificar", judge: "julgar" }, logger, caller: new OpenRouterClient({ ...config, maxCalls }, logger, null, unthrottled), save: async records => { saved = structuredClone(records); } });
    await assert.rejects(graphFor(2).invoke({ ids: [question.id], records: saved }), /Orçamento/);
    assert.equal(saved.Q0001!.attempts?.classifier, 2);
    let result = await graphFor(20).invoke({ ids: [question.id], records: saved });
    assert.equal(result.records.Q0001!.attempts?.classifier, 5);
    assert.equal(requests, 5);
    assert.equal(result.records.Q0001!.proposal, undefined);
    result = await graphFor(20).invoke({ ids: [question.id], records: result.records });
    assert.equal(requests, 5, "retomar não renova as cinco tentativas");
    await graphFor(20).invoke({ ids: [second.id], records: result.records });
    assert.equal(requests, 10, "a próxima questão conserva seu próprio orçamento");
    assert.equal(saved.Q0002!.attempts?.classifier, 5);
  } finally { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); }
});

test("juiz esgota cinco tentativas HTTP sem refazer proposta; autenticação inválida interrompe sem repetição", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-judge-retry-"));
  const originalFetch = globalThis.fetch;
  try {
    const config = { ...await getConfig(), minIntervalMs: 0, retryBaseDelayMs: 0, maxCalls: 20 };
    let requests = 0, saved: Record<string, RecordState> = { Q0001: { id: question.id, proposal, attempts: { classifier: 1 }, errors: [] } };
    const logger = new Logger(dir);
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.equal(JSON.parse(String(init?.body)).model, config.judgeModel);
      return new Response("indisponível", { status: 503, headers: { "retry-after": "0" } });
    };
    const makeGraph = () => createGraph({ config, data: { version: 1, inputHashes: {}, themes, questions: [question], cleaning: [] }, prompts: { classifier: "classificar", judge: "julgar" }, logger, caller: new OpenRouterClient(config, logger, null, unthrottled), save: async records => { saved = structuredClone(records); } });
    const result = await makeGraph().invoke({ ids: [question.id], records: saved });
    assert.deepEqual(result.records.Q0001!.proposal, proposal);
    assert.deepEqual(result.records.Q0001!.attempts, { classifier: 1, judge: 5 });
    assert.equal(result.records.Q0001!.verdict, undefined);
    assert.equal(requests, 5);
    globalThis.fetch = async () => { requests++; return new Response("não autorizado", { status: 401 }); };
    await assert.rejects(makeGraph().invoke({ ids: [question.id], records: { Q0001: { id: question.id, errors: [] } } }), /401/);
    assert.equal(requests, 6);
    assert.equal(saved.Q0001!.attempts?.classifier, 1);
  } finally { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); }
});
