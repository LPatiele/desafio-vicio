import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getConfig } from "../src/config.js";
import { ConfigSchema, type Prepared, type Proposal, type RecordState, type Verdict } from "../src/types.js";
import { ContextService, citedSources, loadOriginalLabels, planContext, validateContextCheckpoint } from "../src/retrieval/context.js";
import { LexmlApi, cqlQuery, failedResult, parseSru, type ApiSearch } from "../src/retrieval/lexml-api.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { atomicJson, readJson, resolveRoot } from "../src/utils.js";
import { loadData, indexThemes } from "../src/data.js";
import { createGraph } from "../src/graph.js";
import { Logger } from "../src/logger.js";
import type { ModelCaller } from "../src/client.js";

const unthrottled = { acquire: async () => {}, deferUntil: async (_at: number) => {} };
const xml = `<?xml version="1.0"?><srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:srw_dc="info:srw/schema/1/dc-schema"><srw:numberOfRecords>8</srw:numberOfRecords><srw:records><srw:record><srw:recordData><srw_dc:dc><urn>urn:lex:br:federal:lei:1940-12-07;2848</urn><dc:title>Código Penal</dc:title><dc:description>Texto de teste, não consulta jurídica real.</dc:description><dc:subject>Penal</dc:subject><dc:subject>Patrimônio</dc:subject><dc:date>1940-12-07</dc:date></srw_dc:dc></srw:recordData></srw:record></srw:records></srw:searchRetrieveResponse>`;
const emptyXml = '<searchRetrieveResponse><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>';
const theme = { tema_id: "furto", parent_id: "", disciplina: "Penal", nivel: 1, titulo: "Furto", caminho: "Furto", descricao: "Subtração sem violência", status: "active" };
const question = { id: "Q0001", enunciado: "Subtraiu um bem sem violência.", comando: "Assinale a correta.", alternativas: { A: "Furto simples.", B: "Roubo simples." }, avisos: [] };
const proposal: Proposal = { id: question.id, tema_central_id: theme.tema_id, fora: false, extras_ids: [], concorrentes_ids: ["roubo"], evidencias: [{ campo: "enunciado", trecho: "Subtraiu um bem sem violência." }], justificativa: "A subtração sem violência caracteriza furto.", incertezas: [], confianca_declarada: 0.95 };
const rubric = { avaliacao: "sustentado" as const, justificativa: "A questão exige conhecimento sobre furto." };
const verdict: Verdict = { id: question.id, tema_central: rubric, evidencia_textual: rubric, distincao_de_concorrentes: rubric, tema_alternativo_id: null, fora_sustentado: false, extras_sustentados_ids: [], alertas: [] };
const data: Prepared = { version: 1, inputHashes: {}, questions: [question], themes: [theme, { ...theme, tema_id: "roubo", titulo: "Roubo", descricao: "Subtração com violência" }], cleaning: [] };
const label = { disciplina: "Penal", assunto: "Crimes patrimoniais" };
const labels = new Map([[question.id, label]]);
const cfg = () => getConfig(resolveRoot("config/individual-v5-contexto-api.json"));
function fixture(status: "ok" | "empty" | "challenge" | "network_error", config: Awaited<ReturnType<typeof cfg>>, count: { value: number } = { value: 0 }): ApiSearch {
  return { search: async (terms, reserve) => {
    await reserve(); count.value++;
    const base = failedResult(terms, config.retrieval!.maximumRecords, status, "Falha simulada.");
    if (status === "ok") return { ...base, ...parseSru(xml, 5), error: null, httpStatus: 200 };
    if (status === "empty") return { ...base, total: 0, error: null, httpStatus: 200 };
    return { ...base, retryable: status === "network_error" };
  } };
}
test("SRU normaliza namespaces, URN, resumo e assuntos; vazio válido é distinto de falha", () => {
  const result = parseSru(xml, 5);
  assert.equal(result.total, 8);
  assert.equal(result.documents[0]!.title, "Código Penal");
  assert.deepEqual(result.documents[0]!.subjects, ["Penal", "Patrimônio"]);
  assert.deepEqual(parseSru(emptyXml, 5), { total: 0, documents: [] });
  assert.equal(parseSru(xml.replace("Código Penal", "Verificação de segurança"), 5).documents[0]!.title, "Verificação de segurança");
  for (const invalid of ["<html>Verificação</html>", "<searchRetrieveResponse/>", xml.replace("<urn>", "<other>").replace("</urn>", "</other>"), '<!DOCTYPE x [<!ENTITY y "danger">]>'+emptyXml, "<unclosed>", '<searchRetrieveResponse><numberOfRecords>0</numberOfRecords><diagnostics>erro</diagnostics></searchRetrieveResponse>']) assert.throws(() => parseSru(invalid, 5));
  assert.equal(cqlQuery('lei "X"'), 'cql.serverChoice all "lei \\"X\\""');
  assert.throws(() => cqlQuery("a".repeat(501)));
});
test("cache íntegro evita reserva/envio; metadados alterados e HTML não viram resultados", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lexml-api-"));
  try {
    const config = (await cfg()).retrieval!;
    let calls = 0, reserves = 0;
    const api = new LexmlApi(config, dir, unthrottled, async () => { calls++; return new Response(xml, { headers: { "content-type": "application/xml" } }); });
    assert.equal((await api.search("furto", async () => { reserves++; })).status, "ok");
    assert.equal((await api.search("furto", async () => { reserves++; })).cacheHit, true);
    assert.equal(calls, 1); assert.equal(reserves, 1);
    const file = path.join(dir, (await readdir(dir))[0]!);
    const cached = await readJson<any>(file); cached.result.documents[0].title = "Outra norma"; await atomicJson(file, cached);
    await assert.rejects(() => api.search("furto", async () => {}), /divergem/);
    const html = new LexmlApi(config, dir, unthrottled, async () => new Response('<html><title>Verificação de segurança</title></html>', { headers: { "content-type": "text/html" } }));
    assert.equal((await html.search("roubo", async () => {})).status, "challenge");
    assert.equal((await readdir(dir)).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("HTTP 429 compartilha pausa; resposta excessiva e falha de reserva não enviam dados ao juiz", async () => {
  const config = (await cfg()).retrieval!;
  let paused = 0, sends = 0;
  const api = new LexmlApi(config, path.join(os.tmpdir(), `absent-${crypto.randomUUID()}`), { ...unthrottled, deferUntil: async at => { paused = at; } }, async () => { sends++; return new Response("rate", { status: 429, headers: { "retry-after": "2" } }); });
  const result = await api.search("limite", async () => {});
  assert.equal(result.retryable, true); assert.equal(result.retryAfterMs, 2000); assert.ok(paused > Date.now());
  await assert.rejects(() => api.search("reserva", async () => { throw new Error("disco indisponível"); }));
  assert.equal(sends, 1);
  const large = new LexmlApi({ ...config, maxResponseBytes: 1000 }, path.join(os.tmpdir(), `absent-${crypto.randomUUID()}`), unthrottled, async () => new Response("a".repeat(1001)));
  assert.equal((await large.search("grande", async () => {})).status, "oversized");
});
test("planeja duas hipóteses, deduplica equivalentes e não inventa assunto ausente/fora", () => {
  const index = indexThemes(data.themes);
  assert.equal(planContext(proposal, label, index).queries.length, 2);
  assert.deepEqual(planContext(proposal, { ...label, assunto: "FÚRTO" }, index).queries[0]!.roles, ["classificador", "origem"]);
  const outside = planContext({ ...proposal, fora: true, tema_central_id: null }, { disciplina: null, assunto: null }, index);
  assert.equal(outside.queries.length, 0); assert.equal(outside.notices.length, 2);
});
test("rótulos são lidos do anexo original com hash; referência e dados preparados não se misturam", async () => {
  const prepared = await loadData(), origins = await loadOriginalLabels(prepared);
  assert.equal(origins.size, 359);
  assert.equal(origins.get("Q0001")!.assunto, "Procedimento do Júri");
  assert.equal("assunto_origem" in prepared.questions[0]!, false);
  await assert.rejects(() => loadOriginalLabels({ ...prepared, inputHashes: { ...prepared.inputHashes, questions: "alterado" } }));
});
test("duas buscas deduplicam fontes, mantêm proveniência e retomada não repete HTTP", async () => {
  const config = await cfg(), count = { value: 0 };
  const record: RecordState = { id: question.id, proposal, errors: [] };
  let saves = 0;
  const service = new ContextService(config, data, labels, fixture("ok", config, count));
  await service.collect(record, async () => { saves++; });
  assert.equal(count.value, 2); assert.ok(saves >= 5);
  const rendered = JSON.parse(record.retrieval!.judgeContext!);
  assert.equal(rendered.fontes.length, 1); assert.equal(rendered.fontes[0].consultas.length, 2);
  assert.equal(rendered.rotulo_original.assunto, label.assunto);
  validateContextCheckpoint(record, config, label, service.themes);
  await service.collect(record, async () => {}); assert.equal(count.value, 2);
  record.retrieval!.queries[0]!.terms = "alterado";
  assert.throws(() => validateContextCheckpoint(record, config, label, service.themes));
});
test("retentativas HTTP são persistentes, limitadas e não se renovam após retomada", async () => {
  const config = await cfg(), count = { value: 0 }, record: RecordState = { id: question.id, proposal, errors: [] };
  const service = new ContextService(config, data, labels, fixture("network_error", config, count), async () => {});
  await service.collect(record, async () => {});
  assert.equal(count.value, 4); assert.deepEqual(record.retrieval!.queries.map(q => q.attempts), [2, 2]);
  assert.equal(record.retrieval!.status, "unavailable");
  await service.collect(record, async () => {}); assert.equal(count.value, 4);
  validateContextCheckpoint(record, config, label, service.themes);
  // Simulate termination after reserving the final HTTP attempt, before its response.
  record.retrieval = planContext(proposal, label, service.themes);
  record.retrieval.queries[0]!.attempts = 2;
  await service.collect(record, async () => {});
  assert.equal(count.value, 6); assert.equal(record.retrieval.queries[0]!.result!.status, "exhausted");
});
test("orçamento HTTP total e falha de persistência são respeitados", async () => {
  const config = await cfg(); config.retrieval!.maxRequestsPerQuestion = 2;
  const count = { value: 0 }, record: RecordState = { id: question.id, proposal, errors: [] };
  const service = new ContextService(config, data, labels, fixture("network_error", config, count), async () => {});
  await service.collect(record, async () => {});
  assert.equal(count.value, 2); assert.equal(record.retrieval!.queries[1]!.result!.status, "exhausted");
  const interrupted: RecordState = { id: question.id, proposal, errors: [] }; let saves = 0;
  await assert.rejects(() => service.collect(interrupted, async () => { if (++saves === 2) throw new Error("disco"); }), /disco/);
  assert.equal(count.value, 2);
});
for (const status of ["ok", "empty", "challenge"] as const) test(`grafo completo com API ${status}: dois modelos, contexto só no juiz e política de publicação`, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "context-graph-"));
  try {
    const config = await cfg(); config.retryBaseDelayMs = 0;
    const calls: { role: string; content: string }[] = [], count = { value: 0 };
    const context = new ContextService(config, data, labels, fixture(status, config, count));
    const caller: ModelCaller = { call: async (role, _model, messages, _schema, _ids, reserve) => {
      await reserve?.("fixture"); calls.push({ role, content: JSON.stringify(messages) });
      return JSON.stringify({ resultados: [role === "classifier" ? proposal : verdict] });
    } };
    const result = await createGraph({ config, data, context, caller, logger: new Logger(directory), save: async () => {}, prompts: { classifier: "classifique", judge: "julgue" } }).invoke({ ids: [question.id], records: { [question.id]: { id: question.id, errors: [] } } });
    const record = result.records[question.id]!;
    assert.deepEqual(calls.map(c => c.role), ["classifier", "judge"]);
    assert.doesNotMatch(calls[0]!.content, /rotulo_original|Crimes patrimoniais|contexto_externo/);
    assert.match(calls[1]!.content, /rotulo_original/);
    assert.equal(count.value, 2); assert.ok(record.verdict);
    assert.equal(record.decision!.decisao, status === "challenge" ? "revisar" : "publicar");
    assert.deepEqual(record.decision, decideRecord(record, question, context.themes, config));
    validateContextCheckpoint(record, config, label, context.themes);
    if (status === "ok") {
      const source = JSON.parse(record.retrieval!.judgeContext!).fontes[0].id;
      assert.deepEqual(citedSources({ ...verdict, alertas: [source] }, record.retrieval!), [source]);
    }
    assert.throws(() => citedSources({ ...verdict, alertas: ["S-000000000000"] }, record.retrieval!));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("configuração direta não permite MCP simultâneo ou lote que multiplique orçamento", async () => {
  const config = await cfg();
  assert.throws(() => ConfigSchema.parse({ ...config, batchSize: 10 }));
  assert.throws(() => ConfigSchema.parse({ ...config, research: { enabled: true, command: "python", args: [], sourceLock: "lock" } }));
});
