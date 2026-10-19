import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, expressionFor, searchDatabase } from "../src/knowledge/database.js";
import { normalizeNorm, normalizePrecedents, normalizeDoctrine } from "../src/knowledge/normalize.js";
import { normalizeHtml } from "../src/knowledge/html.js";
import { hashBytes, readPlan } from "../src/knowledge/import.js";
import { KnowledgeStore, LocalContextService, localCitations } from "../src/knowledge/store.js";
import { PlanSchema, SnapshotSchema, type CorpusPlan, type Snapshot, type SourceCapture } from "../src/knowledge/types.js";
import { inspectSnapshot } from "../src/knowledge/inspect.js";
import type { Config, Prepared, Proposal, RecordState, Verdict } from "../src/types.js";
import { getConfig } from "../src/config.js";
import { atomicJson, hash, resolveRoot } from "../src/utils.js";
import { createGraph } from "../src/graph.js";
import { Logger } from "../src/logger.js";
import { decideRecord } from "../src/retrieval/decision.js";
import type { ModelCaller } from "../src/client.js";
import { StopRun } from "../src/client.js";
import { DirectClient } from "../src/providers/direct.js";
import { SpendBudget } from "../src/providers/budget.js";

const urn = "urn:lex:br:federal:decreto.lei:1940-12-07;2848";
const source: SourceCapture = { id: "cp", kind: "norma", title: "Código Penal", urn, url: "https://normas.leg.br/api/public/normas", retrievedAt: "2026-10-17T00:00:00Z", status: "ok", httpStatus: 200, bodyHash: null, rawFile: "cp.body.json", error: null };
const question = { id: "Q0001", enunciado: "Subtraiu um bem sem violência.", comando: "Assinale a correta.", alternativas: { A: "Furto simples.", B: "Roubo simples." }, avisos: [] };
const data: Prepared = { version: 1, inputHashes: { questions: "fixture", themes: "fixture" }, questions: Array.from({ length: 50 }, (_, i) => ({ ...question, id: `Q${String(i + 1).padStart(4, "0")}` })), themes: [{ tema_id: "furto", parent_id: "", nivel: 1, titulo: "Furto", caminho: "Furto", disciplina: "Penal", descricao: "Subtração sem violência", status: "active" }, { tema_id: "roubo", parent_id: "", nivel: 1, titulo: "Roubo", caminho: "Roubo", disciplina: "Penal", descricao: "Subtração com violência", status: "active" }], cleaning: [] };
const plan: CorpusPlan = { version: 1, id: "fixture", cutoff: "2026-10-16", selection: { experiment: "fixture", recordsHash: "fixture", inputHashes: data.inputHashes }, sources: [{ id: "cp", kind: "norma", title: source.title, urn }], questions: data.questions.map(q => ({ id: q.id, topics: "Furto", sources: ["cp"], articles: { cp: ["155"] }, gaps: q.id === "Q0002" ? ["Falta doutrina"] : [] })) };
const tree = { legislationIdentifier: urn, hasPart: { name: "Dos crimes contra o patrimônio", hasPart: { legislationIdentifier: `${urn}!art155_cpt`, workExample: [{ legislationDate: "1940-12-07", temporalCoverage: "1940-12-07/2000-01-01", text: "Texto antigo de furto." }, { legislationDate: "2000-01-02", text: "Subtrair, para si ou para outrem, coisa alheia móvel: furto." }] } } };
const proposal: Proposal = { id: question.id, tema_central_id: "furto", fora: false, extras_ids: [], concorrentes_ids: ["roubo"], evidencias: [{ campo: "enunciado", trecho: question.enunciado }], justificativa: "Subtração de um bem sem violência caracteriza o tema.", incertezas: [], confianca_declarada: 0.9 };
const rubric = { avaliacao: "sustentado" as const, justificativa: "A subtração sem violência sustenta esse destino." };
const verdict: Verdict = { id: question.id, tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric, tema_alternativo_id: null, fora_sustentado: false, extras_sustentados_ids: [], alertas: [] };
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "knowledge-"));
  await mkdir(`${dir}/raw`);
  const raw = JSON.stringify(tree), capture = { ...source, bodyHash: hash(raw) };
  await writeFile(`${dir}/raw/cp.body.json`, raw);
  const chunks = normalizeNorm(tree, capture, plan), text = chunks.map(c => JSON.stringify(c)).join("\n") + "\n";
  await writeFile(`${dir}/chunks.jsonl`, text); await atomicJson(`${dir}/plan.json`, plan);
  createDatabase(`${dir}/corpus.sqlite`, plan, [capture], chunks);
  const manifest: Snapshot = { version: 1, id: plan.id, createdAt: source.retrievedAt, cutoff: plan.cutoff, planHash: hash(await readFile(`${dir}/plan.json`, "utf8")), inputHashes: data.inputHashes, database: "corpus.sqlite", databaseHash: hashBytes(await readFile(`${dir}/corpus.sqlite`)), chunksFile: "chunks.jsonl", chunksHash: hash(text), importerHash: "fixture", counts: { sources: 1, successfulSources: 1, chunks: chunks.length, questions: 50 }, scope: plan.questions, captures: [capture], rawFiles: [{ path: "raw/cp.body.json", hash: hash(raw) }] };
  await atomicJson(`${dir}/manifest.json`, manifest);
  const config = await getConfig(resolveRoot("config/individual-v6-local.json"));
  const store = await KnowledgeStore.open(`${dir}/manifest.json`, data);
  const labels = new Map(data.questions.map(q => [q.id, { disciplina: "Penal", assunto: "Furto" }]));
  const service = new LocalContextService(store, data, labels, config);
  return { dir, manifest, config, store, labels, service, dispose: async () => { store.close(); await rm(dir, { recursive: true, force: true }); } };
}
test("APIs diretas completam Gemini → SQLite → OpenAI após retomar sem repetir a consulta", async () => {
  const f = await fixture();
  const oldGoogle = process.env.GEMINI_API_KEY, oldOpenAI = process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "GOOGLE_FIXTURE"; process.env.OPENAI_API_KEY = "OPENAI_FIXTURE";
  try {
    const paid = await getConfig(resolveRoot("config/individual-v10-gemini-openai.json"));
    paid.retryBaseDelayMs = 0;
    const service = new LocalContextService(f.store, data, f.labels, paid);
    let records: Record<string, RecordState> = { [question.id]: { id: question.id, errors: [] } };
    const file = `${f.dir}/checkpoint.json`, spending = `${f.dir}/spend.json`;
    const save = async (value: typeof records) => { records = structuredClone(value); await atomicJson(file, records); };
    let googleCalls = 0, openaiCalls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      const body = JSON.parse(init!.body as string);
      if (String(url).includes("googleapis.com")) {
        googleCalls++;
        if (googleCalls === 1) return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ thoughtSignature: "continuidade-fixture", functionCall: { name: "buscar_referencias", args: { consulta: "furto coisa alheia" } } }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110 } }));
        assert.equal(googleCalls, 2);
        assert.match(JSON.stringify(body), /continuidade-fixture/);
        assert.match(JSON.stringify(body.contents.at(-1)), /functionResponse|coisa alheia/);
        return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify({ resultados: [proposal] }) }] } }], usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 30, totalTokenCount: 180 } }));
      }
      openaiCalls++;
      assert.match(String(url), /api\.openai\.com\/v1\/responses$/);
      assert.match(JSON.stringify(body), /coisa alheia/);
      assert.doesNotMatch(JSON.stringify(body), /continuidade-fixture|functionResponse/);
      return new Response(JSON.stringify({ status: "completed", model: paid.judgeModel, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ resultados: [verdict] }) }] }], usage: { input_tokens: 150, output_tokens: 50 } }));
    };
    const limiter = () => ({ acquire: async () => {}, deferUntil: async () => {} });
    const deps = { config: paid, data, prompts: { classifier: "Classifique", judge: "Julgue" }, logger: new Logger(f.dir), save, context: service, localKnowledge: service };
    const first = new DirectClient(paid, deps.logger, await SpendBudget.open(spending, 10, 1), fetcher, limiter);
    await assert.rejects(createGraph({ ...deps, caller: first }).invoke({ ids: [question.id], records }), StopRun);
    assert.equal(records[question.id]!.classifierKnowledgeAgent?.version, 2);
    assert.equal(records[question.id]!.classifierKnowledgeAgent?.operations.length, 1);
    records = JSON.parse(await readFile(file, "utf8"));
    const second = new DirectClient(paid, deps.logger, await SpendBudget.open(spending, 10, 5), fetcher, limiter);
    const graph = createGraph({ ...deps, caller: second });
    const result = await graph.invoke({ ids: [question.id], records });
    assert.equal(result.records[question.id]!.decision?.decisao, "publicar");
    assert.deepEqual(result.records[question.id]!.attempts, { classifier: 2, judge: 1 });
    assert.equal(googleCalls, 2); assert.equal(openaiCalls, 1);
    await graph.invoke({ ids: [question.id], records: result.records });
    assert.equal(googleCalls + openaiCalls, 3);
    service.validateClassifier(result.records[question.id]!);
    service.validate(result.records[question.id]!);
    const tampered = structuredClone(result.records[question.id]!);
    const native = tampered.classifierKnowledgeAgent!.messages.find(m => m.role === "assistant" && m.tool_calls?.length);
    if (native?.role !== "assistant") throw new Error("Chamada ausente na fixture");
    (native.providerState!.payload[0] as any).parts[0].functionCall.args.consulta = "consulta adulterada";
    assert.throws(() => service.validateClassifier(tampered), /continuidade nativa/);
  } finally {
    if (oldGoogle === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGoogle;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAI;
    await f.dispose();
  }
});
test("normalização escolhe versão pela data e conserva texto, dispositivo e proveniência", () => {
  const chunks = normalizeNorm(tree, source, plan);
  assert.equal(chunks.length, 1); assert.match(chunks[0]!.text, /coisa alheia/); assert.doesNotMatch(chunks[0]!.text, /Texto antigo/);
  assert.match(chunks[0]!.locator, /!art155/); assert.equal(chunks[0]!.metadata.cutoff, plan.cutoff);
  assert.match(normalizeNorm(tree, source, { ...plan, cutoff: "1990-01-01" })[0]!.text, /Texto antigo/);
  assert.deepEqual(normalizeNorm({ ...tree, legislationIdentifier: "inventado" }, source, plan), []);
  const variant = structuredClone(tree) as any;
  variant.hasPart.hasPart.workExample[1].temporalCoverage = ["2000-01-02/2026-12-31"];
  assert.equal(normalizeNorm(variant, source, plan).length, 1);
  variant.hasPart.hasPart.workExample[1].temporalCoverage = { startDate: "2000-01-02" };
  assert.equal(normalizeNorm(variant, source, plan).length, 1);
});
test("HTML remove redação riscada e separa artigo acrescido, sem confundir metadados com vigência", () => {
  const html = '<html><h1>Decreto-Lei 2.848</h1><p>Art. 155. <s>Texto antigo</s> Subtrair coisa alheia.</p><p>Art. 156. Outro tipo.</p></html>';
  const capture = { ...source, supplement: { url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm", retrievedAt: source.retrievedAt, bodyHash: "fixture", rawFile: "cp-html.body.json", httpStatus: 200, error: null, encoding: "utf-8" } };
  const chunks = normalizeHtml(html, capture, plan);
  assert.equal(chunks.length, 1); assert.doesNotMatch(chunks[0]!.text, /antigo|Outro tipo/);
  assert.equal(chunks[0]!.metadata.historicalCutoffUnverified, true);
  assert.throws(() => normalizeHtml('<html><title>Verificação de segurança</title></html>', capture, plan));
  const p = { ...plan, questions: plan.questions.map(q => ({ ...q, articles: { cp: ["3-a"] } })) };
  assert.match(normalizeHtml('<h1>Decreto-Lei 2.848</h1><p>Art. 3º-A. Regra nova.</p>', capture, p)[0]!.locator, /art3-a/);
  const typoPlan = { ...plan, questions: plan.questions.map(q => ({ ...q, articles: { cp: ["197"] } })) };
  const typo = normalizeHtml('<h1>Decreto-Lei 2.848</h1><p>Art. l97. Constranger alguém.</p>', capture, typoPlan)[0]!;
  assert.match(typo.locator, /!art197/); assert.match(typo.text, /Art\. l97/); assert.equal(typo.metadata.articleNumberNormalized, true);
});
test("BNP distingue tese de questão submetida e rejeita dados inválidos/futuros", () => {
  const src = { ...source, kind: "precedente" as const, query: "Tribunal do Júri" };
  const result = normalizePrecedents({ total: 1, resultados: [{ id: "stj-sum-191", orgao: "STJ", tipo: "SUM", nr: 191, tese: "Tese de teste", situacao: "Vigente", ultimaAtualizacao: "01/01/2026" }] }, src, plan.cutoff);
  assert.equal(result.length, 1); assert.equal(result[0]!.metadata.status, "Vigente");
  assert.throws(() => normalizePrecedents({ erro: "falhou" }, src, plan.cutoff));
  assert.equal(normalizePrecedents({ total: 1, resultados: [{ id: "future", orgao: "STJ", tipo: "SUM", nr: 1, tese: "Tese futura", ultimaAtualizacao: "18/10/2026" }] }, src, plan.cutoff).length, 0);
});
test("SQLite é real, busca com FTS5/BM25, preserva acentos e abre somente para leitura", async () => {
  const f = await fixture();
  try {
    assert.equal(f.store.search("FURTO").chunks.length, 1);
    assert.equal(f.store.search("patrimonio").chunks.length, 1);
    assert.equal(f.store.search("xxyyzz").chunks.length, 0);
    assert.equal(expressionFor('"; DROP TABLE chunks; --'), '"drop" OR "table" OR "chunks"');
    assert.throws(() => f.store.db.exec("DELETE FROM chunks"), /readonly/);
    assert.equal((await readFile(`${f.dir}/corpus.sqlite`)).subarray(0, 15).toString(), "SQLite format 3");
    assert.throws(() => searchDatabase(f.store.db, "Furto", 100));
  } finally { await f.dispose(); }
});
test("snapshot confere hashes dos documentos brutos, plano e banco", async () => {
  const f = await fixture();
  try {
    await writeFile(`${f.dir}/raw/cp.body.json`, "alterado");
    await assert.rejects(() => KnowledgeStore.open(`${f.dir}/manifest.json`, data), /Fonte bruta/);
    await writeFile(`${f.dir}/raw/cp.body.json`, JSON.stringify(tree));
    await writeFile(`${f.dir}/corpus.sqlite`, "alterado");
    await assert.rejects(() => KnowledgeStore.open(`${f.dir}/manifest.json`, data), /Banco congelado/);
  } finally { await f.dispose(); }
});
test("busca não ocupa o contexto com o mesmo texto capturado em consultas diferentes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "knowledge-dedup-"));
  try {
    const original = normalizeNorm(tree, source, plan)[0]!;
    createDatabase(`${dir}/test.sqlite`, plan, [source], [original, { ...original, id: "S-000000000001" }]);
    const db = new DatabaseSync(`${dir}/test.sqlite`, { readOnly: true });
    try { assert.equal(searchDatabase(db, "Furto", 5).chunks.length, 1); }
    finally { db.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("contexto local congela consulta e fontes, respeita recorte e rejeita citação inventada", async () => {
  const f = await fixture();
  try {
    let saves = 0; const record: RecordState = { id: question.id, proposal, errors: [] };
    await f.service.collect(record, async () => { saves++; });
    assert.equal(saves, 1); assert.equal(record.knowledge!.status, "retrieved");
    assert.ok(record.knowledge!.judgeContext.length <= f.config.knowledge!.maxContextCharacters);
    f.service.validate(record);
    await f.service.collect(record, async () => { saves++; }); assert.equal(saves, 1);
    assert.throws(() => localCitations({ ...verdict, alertas: ["S-000000000000"] }, record.knowledge!));
    assert.throws(() => f.store.gapsFor("Q0051"), /recorte/);
    record.knowledge!.judgeContext = "{}"; assert.throws(() => f.service.validate(record));
  } finally { await f.dispose(); }
});
test("RAG simples chega ao parecer com duas chamadas e envia documentos somente ao juiz", async () => {
  const f = await fixture();
  try {
    const roles: string[] = [], inputs: string[] = [];
    const caller: ModelCaller = { call: async (role, _model, messages, _schema, _ids, reserve) => {
      await reserve?.("fixture"); roles.push(role); inputs.push(JSON.stringify(messages));
      return JSON.stringify({ resultados: [role === "classifier" ? proposal : verdict] });
    } };
    const graph = createGraph({ config: f.config, data, caller, context: f.service, prompts: { classifier: "classificar", judge: "julgar" }, logger: new Logger(f.dir), save: async () => {} });
    const result = await graph.invoke({ ids: [question.id], records: { [question.id]: { id: question.id, errors: [] } } });
    const record = result.records[question.id]!;
    assert.deepEqual(roles, ["classifier", "judge"]);
    assert.doesNotMatch(inputs[0]!, /contexto_externo|coisa alheia móvel|rotulo_original/);
    assert.match(inputs[1]!, /contexto_externo/); assert.match(inputs[1]!, /coisa alheia/);
    assert.equal(record.decision!.decisao, "publicar"); f.service.validate(record);
    const gapRecord = { ...record, id: "Q0002", proposal: { ...proposal, id: "Q0002" }, verdict: { ...verdict, id: "Q0002" }, knowledge: f.service.make(data.questions[1]!, { ...proposal, id: "Q0002" }) };
    assert.equal(decideRecord(gapRecord, data.questions[1]!, new Map(data.themes.map(t => [t.tema_id, t])), f.config)!.decisao, "publicar");
  } finally { await f.dispose(); }
});
test("plano do recorte contém exatamente os 50 IDs e fontes oficiais, sem referência própria", async () => {
  const { plan } = await readPlan(resolveRoot("knowledge/plans/penal50-v1.json"));
  assert.equal(plan.questions.length, 50); assert.equal(plan.sources.length, 40);
  assert.deepEqual(plan.questions.map(q => q.id), Array.from({ length: 50 }, (_, i) => `Q${String(i + 1).padStart(4, "0")}`));
  assert.equal(plan.questions.filter(q => q.gaps.length).length, 3);
  assert.doesNotMatch(JSON.stringify(plan), /tema_referencia|referencia\.jsonl|referencias\/analise/);
});

test("plano e manifesto aceitam 359 questões e rejeitam IDs/contagens inconsistentes", async () => {
  const questions = Array.from({ length: 359 }, (_, i) => ({ ...plan.questions[0]!, id: `Q${String(i + 1).padStart(4, "0")}` }));
  assert.equal(PlanSchema.parse({ ...plan, questions }).questions.length, 359);
  const f = await fixture();
  try {
    assert.equal(SnapshotSchema.parse({ ...f.manifest, counts: { ...f.manifest.counts, questions: 359 }, scope: questions }).scope.length, 359);
    assert.throws(() => SnapshotSchema.parse({ ...f.manifest, counts: { ...f.manifest.counts, questions: 359 } }), /inconsistente/);
    assert.throws(() => SnapshotSchema.parse({ ...f.manifest, scope: f.manifest.scope.map(q => ({ ...q, id: "Q0001" })) }), /inconsistente/);
    assert.equal(SnapshotSchema.parse(f.manifest).scope.length, 50);
  } finally { await f.dispose(); }
});

test("lacuna ou busca vazia não veta publicação; dúvida temática e checkpoints continuam valendo", async () => {
  const f = await fixture();
  try {
    const q = data.questions[1]!, p = { ...proposal, id: q.id }, v = { ...verdict, id: q.id };
    const knowledge = f.service.fromChunks(q, p, [], []);
    assert.equal(knowledge.status, "empty"); assert.ok(knowledge.gaps.length);
    const r: RecordState = { id: q.id, proposal: p, verdict: v, knowledge, errors: [] };
    const themes = new Map(data.themes.map(t => [t.tema_id, t]));
    assert.equal(decideRecord(r, q, themes, f.config)?.decisao, "publicar");
    assert.equal(decideRecord({ ...r, knowledge: undefined }, q, themes, f.config), null);
    assert.equal(decideRecord({ ...r, verdict: { ...v, tema_alternativo_id: "roubo" } }, q, themes, f.config)?.decisao, "revisar");
    assert.equal(decideRecord({ ...r, verdict: { ...v, tema_central: { ...rubric, avaliacao: "incerto" } } }, q, themes, f.config)?.decisao, "revisar");
  } finally { await f.dispose(); }
});

test("inspeção offline exporta registros reais e texto escapado, sem modificar SQLite", async () => {
  const f = await fixture();
  try {
    const before = hashBytes(await readFile(`${f.dir}/corpus.sqlite`));
    const result = await inspectSnapshot(`${f.dir}/manifest.json`, data, `${f.dir}/inspection`);
    const html = await readFile(result.file, "utf8");
    assert.equal(result.questions, 50); assert.equal(result.sources, 1);
    assert.match(html, /Subtrair, para si/); assert.match(html, /Questões e cobertura/);
    assert.doesNotMatch(html, /\/\*__CORPUS__\*\/null/);
    assert.equal(hashBytes(await readFile(`${f.dir}/corpus.sqlite`)), before);
  } finally { await f.dispose(); }
});

test("livros conservam página PDF, autoria/título e proveniência; texto vazio exige OCR", () => {
  const book = { ...source, kind: "doutrina" as const, id: "livro", title: "Livro de teste — autoria", url: "file:///livro.pdf", license: "Uso local" };
  const pages = { pages: [{ page: 12, text: "A teoria do etiquetamento examina processos de criminalização e mecanismos de controle social. ".repeat(35) }] };
  const chunks = normalizeDoctrine(pages, book);
  assert.ok(chunks.length > 1); assert.equal(chunks[0]!.metadata.pdfPage, 12);
  assert.match(chunks[0]!.title, /autoria/); assert.equal(chunks[0]!.url, "file:///livro.pdf#page=12");
  assert.throws(() => normalizeDoctrine({ pages: [{ page: 1, text: "" }] }, book), /OCR/);
});

test("segmentação HTML separa rubrica seguinte sem apagar subtítulo interno", () => {
  const capture = { ...source, supplement: { url: "https://www2.camara.leg.br/cp", retrievedAt: source.retrievedAt, rawFile: null, bodyHash: null, httpStatus: 200, error: null, encoding: "utf-8" } };
  const localPlan = { ...plan, questions: plan.questions.map(q => ({ ...q, articles: { cp: ["316", "332", "333", "197"] } })) };
  const html = '<h1>Código Penal 2848</h1><p align="center">Dos crimes contra a organização do trabalho</p><p><b>Atentado contra a liberdade de trabalho</b></p><p>Art. l97 - Constranger alguém.</p><p><b>Concussão</b></p><p>Art. 316 - Exigir vantagem.</p><p><b>Excesso de exação</b></p><p>§ 1º Se o funcionário exige tributo.</p><p><b>Tráfico de influência</b></p><p>Art. 332 - Solicitar vantagem a pretexto de influir.</p><p><b>Corrupção ativa</b></p><p>Art. 333 - Oferecer vantagem.</p>';
  const chunks = normalizeHtml(html, capture, localPlan);
  const traffic = chunks.find(c => c.locator.endsWith("!art332"))!;
  assert.match(traffic.title, /Tráfico de influência/); assert.doesNotMatch(traffic.text, /Corrupção ativa/);
  assert.match(chunks.find(c => c.locator.endsWith("!art316"))!.text, /Excesso de exação/);
  assert.match(chunks.find(c => c.locator.endsWith("!art197"))!.title, /liberdade de trabalho/);
});

test("juiz escolhe busca e leitura, cita somente documentos entregues e checkpoint é reproduzível", async () => {
  const f = await fixture();
  try {
    Object.assign(f.config.knowledge!, { mode: "judge_tools", maxToolCalls: 4, maxToolRounds: 2 });
    f.config.retryBaseDelayMs = 0;
    let turns = 0;
    const caller: ModelCaller = { call: async () => { throw new Error("Proposta já importada"); }, turn: async (_role, _model, messages, _schema, _ids, reserve, options) => {
      await reserve(`t${++turns}`);
      const tool = (name: string, args: object) => ({ kind: "tools" as const, message: { role: "assistant" as const, content: null, tool_calls: [{ id: `c${turns}`, index: 0, type: "function" as const, function: { name, arguments: JSON.stringify(args) } }] } });
      if (turns === 1) { assert.equal(typeof options.choice, "object"); return tool("buscar_referencias", { consulta: "furto subtrair" }); }
      const sources = messages.filter(m => m.role === "tool").flatMap(m => JSON.parse(m.content!).fontes ?? []);
      const id = sources[0].id;
      if (turns === 2) return tool("ler_referencia", { id });
      assert.equal(options.final, true);
      const value = { ...verdict, tema_central: { ...rubric, justificativa: `Subtrair coisa alheia caracteriza furto, conforme ${id}.` } };
      const content = JSON.stringify({ resultados: [value] });
      return { kind: "final", content, message: { role: "assistant", content } };
    } };
    const graph = createGraph({ config: f.config, data, caller, context: f.service, localKnowledge: f.service, prompts: { classifier: "classificar", judge: "julgar" }, logger: new Logger(f.dir), save: async () => {} });
    const result = await graph.invoke({ ids: [question.id], records: { [question.id]: { id: question.id, proposal, errors: [] } } });
    const record = result.records[question.id]!;
    assert.equal(turns, 3); assert.equal(record.attempts?.judge, 3); assert.equal(record.knowledgeAgent!.operations.length, 2);
    assert.equal(record.decision!.decisao, "publicar"); assert.equal(record.knowledge!.sourcesUsed.length, 1);
    assert.deepEqual(record.knowledge!.queries.map(q => q.role), ["juiz"]);
    f.service.validate(record);
    record.knowledgeAgent!.operations[0]!.result = "alterado";
    assert.throws(() => f.service.validate(record), /reproduzida/);
  } finally { await f.dispose(); }
});

test("retomada conserva consultas e cinco envios totais incluem ferramentas e falhas", async () => {
  const { RetryableCallError, StopRun } = await import("../src/client.js");
  const f = await fixture();
  try {
    Object.assign(f.config.knowledge!, { mode: "judge_tools", maxToolCalls: 4, maxToolRounds: 2 }); f.config.retryBaseDelayMs = 0;
    let saved: Record<string, RecordState> = {}, calls = 0;
    const base = { config: f.config, data, context: f.service, localKnowledge: f.service, prompts: { classifier: "classificar", judge: "julgar" }, logger: new Logger(f.dir), save: async (records: Record<string, RecordState>) => { saved = structuredClone(records); } };
    const first: ModelCaller = { call: async () => "", turn: async (_r, _m, _msgs, _s, _ids, reserve) => {
      if (calls) throw new StopRun("Orçamento de execução");
      await reserve("first"); calls++;
      return { kind: "tools", message: { role: "assistant", content: null, tool_calls: [{ id: "persisted", type: "function", function: { name: "buscar_referencias", arguments: '{"consulta":"furto"}' } }] } };
    } };
    await assert.rejects(() => createGraph({ ...base, caller: first }).invoke({ ids: [question.id], records: { [question.id]: { id: question.id, proposal, errors: [] } } }), /Orçamento/);
    assert.equal(saved[question.id]!.knowledgeAgent!.operations[0]!.state, "complete"); f.service.validate(saved[question.id]!);
    const failure: ModelCaller = { call: async () => "", turn: async (_r, _m, messages, _s, _ids, reserve) => {
      assert.equal(messages.filter(m => m.role === "tool").length, 1);
      await reserve(`retry${++calls}`); throw new RetryableCallError("falha simulada");
    } };
    const result = await createGraph({ ...base, caller: failure }).invoke({ ids: [question.id], records: saved });
    const record = result.records[question.id]!;
    assert.equal(calls, 5); assert.equal(record.attempts!.judge, 5); assert.equal(record.verdict, undefined);
    assert.equal(record.knowledgeAgent!.status, "exhausted"); assert.equal(record.knowledgeAgent!.operations.length, 1); f.service.validate(record);
  } finally { await f.dispose(); }
});

test("ferramentas rejeitam SQL, documentos desconhecidos e argumentos fora do contrato", async () => {
  const { executeLocalTool } = await import("../src/knowledge/tools.js");
  const f = await fixture();
  try {
    const empty = f.service.fromChunks(question, proposal, [], []);
    for (const [name, args] of [["sql", { sql: "DROP TABLE chunks" }], ["ler_referencia", { id: "S-000000000000" }], ["buscar_referencias", { consulta: "furto", sql: "SELECT *" }]] as const) {
      const result = executeLocalTool(f.service, question, proposal, empty, { name, rawArguments: JSON.stringify(args) }, 0);
      assert.equal(JSON.parse(result.result).status, "erro"); assert.deepEqual(result.context, empty);
    }
    const result = executeLocalTool(f.service, question, proposal, empty, { name: "consultar_dispositivo", rawArguments: '{"diploma":"cp","artigo":"155"}' }, 0);
    assert.equal(JSON.parse(result.result).status, "recuperado"); assert.equal(result.context.chunks.length, 1);
  } finally { await f.dispose(); }
});

test("classificador consulta SQLite e juiz recebe só sua recuperação automática", async () => {
  const f = await fixture();
  try {
    Object.assign(f.config.knowledge!, { mode: "automatic", classifierMode: "tools", maxToolCalls: 4, maxToolRounds: 2 });
    f.labels.set(question.id, { disciplina: "ROTULO_ORIGINAL_SECRETO", assunto: "ROTULO_ORIGINAL_SECRETO" });
    let turns = 0; const roles: string[] = [];
    const caller: ModelCaller = {
      call: async (role, _model, messages, _schema, _ids, reserve) => {
        assert.equal(role, "judge"); await reserve?.("judge"); roles.push(role);
        const text = JSON.stringify(messages);
        assert.match(text, /ROTULO_ORIGINAL_SECRETO/);
        assert.doesNotMatch(text, /CONSULTA_PRIVADA|tool_call_id/);
        const input = JSON.parse(messages[1]!.content!).questoes[0];
        assert.equal(input.contexto_externo.consultas.length, 4);
        return JSON.stringify({ resultados: [verdict] });
      },
      turn: async (role, _model, messages, _schema, _ids, reserve) => {
        assert.equal(role, "classifier"); await reserve(`c${++turns}`); roles.push(role);
        assert.doesNotMatch(JSON.stringify(messages), /ROTULO_ORIGINAL_SECRETO|rotulo_original|tema_referencia|resposta_proposta/);
        if (turns === 1) return { kind: "tools", message: { role: "assistant", content: null, tool_calls: [{ id: "classifier-search", type: "function", function: { name: "buscar_referencias", arguments: '{"consulta":"furto CONSULTA_PRIVADA"}' } }] } };
        assert.match(JSON.stringify(messages), /coisa alheia/);
        const content = JSON.stringify({ resultados: [proposal] }); return { kind: "final", content, message: { role: "assistant", content } };
      },
    };
    const graph = createGraph({ config: f.config, data, caller, context: f.service, localKnowledge: f.service, prompts: { classifier: "classificar", judge: "julgar" }, logger: new Logger(f.dir), save: async () => {} });
    const result = await graph.invoke({ ids: [question.id], records: { [question.id]: { id: question.id, errors: [] } } });
    const record = result.records[question.id]!;
    assert.deepEqual(roles, ["classifier", "classifier", "judge"]);
    assert.deepEqual(record.attempts, { classifier: 2, judge: 1 });
    assert.equal(record.classifierKnowledgeAgent!.status, "complete"); assert.equal(record.knowledgeAgent, undefined);
    assert.equal(record.decision!.decisao, "publicar");
    assert.equal(record.classifierKnowledge!.queries.length, 1); assert.equal(record.knowledge!.queries.length, 4);
    f.service.validateClassifier(record); f.service.validate(record);
    record.classifierKnowledgeAgent!.operations[0]!.rawArguments = '{"consulta":"outra"}';
    assert.throws(() => f.service.validateClassifier(record), /difere/);
  } finally { await f.dispose(); }
});

test("cinco tentativas do classificador incluem consulta, persistem e não criam fora em falha", async () => {
  const { RetryableCallError, StopRun } = await import("../src/client.js");
  const f = await fixture();
  try {
    Object.assign(f.config.knowledge!, { mode: "automatic", classifierMode: "tools" }); f.config.retryBaseDelayMs = 0;
    let saved: Record<string, RecordState> = {}, calls = 0;
    const base = { config: f.config, data, context: f.service, localKnowledge: f.service, prompts: { classifier: "classificar", judge: "julgar" }, logger: new Logger(f.dir), save: async (r: Record<string, RecordState>) => { saved = structuredClone(r); } };
    const caller: ModelCaller = { call: async () => { throw new Error("Juiz não deve executar sem proposta"); }, turn: async (role, _m, _messages, _s, _ids, reserve) => {
      assert.equal(role, "classifier");
      if (calls === 1) throw new StopRun("Pausa de execução");
      await reserve(`c${++calls}`);
      return { kind: "tools", message: { role: "assistant", content: null, tool_calls: [{ id: "persisted-c", type: "function", function: { name: "buscar_referencias", arguments: '{"consulta":"furto"}' } }] } };
    } };
    await assert.rejects(() => createGraph({ ...base, caller }).invoke({ ids: [question.id], records: { [question.id]: { id: question.id, errors: [] } } }), /Pausa/);
    f.service.validateClassifier(saved[question.id]!);
    const failures: ModelCaller = { call: caller.call, turn: async (role, _m, messages, _s, _ids, reserve) => {
      assert.equal(role, "classifier"); assert.equal(messages.filter(m => m.role === "tool").length, 1);
      await reserve(`c${++calls}`); throw new RetryableCallError("falha simulada");
    } };
    const result = await createGraph({ ...base, caller: failures }).invoke({ ids: [question.id], records: saved });
    const record = result.records[question.id]!;
    assert.equal(calls, 5); assert.equal(record.classifierKnowledgeAgent!.status, "exhausted");
    assert.equal(record.proposal, undefined); assert.equal(record.verdict, undefined); assert.equal(record.decision, undefined);
    f.service.validateClassifier(record);
    await createGraph({ ...base, caller: failures }).invoke({ ids: [question.id], records: result.records }); assert.equal(calls, 5);
  } finally { await f.dispose(); }
});

test("condição do classificador com ferramentas rejeita importação de propostas antigas", async () => {
  const { runExperiment } = await import("../src/runner.js");
  const f = await fixture();
  try {
    f.config.knowledge!.classifierMode = "tools";
    await assert.rejects(() => runExperiment("fixture-classifier-tools", data, f.config, [question.id], "exploratorio", true, "individual-v3-invertido-50"), /propostas novas/);
  } finally { await f.dispose(); }
});
