import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ChunkSchema, LocalContextSchema, SnapshotSchema, type LocalContext, type Snapshot, type Chunk } from "./types.js";
import { hashBytes } from "./import.js";
import { searchDatabase } from "./database.js";
import { hash } from "../utils.js";
import type { Config, Prepared, Proposal, Question, RecordState, Verdict } from "../types.js";
import type { OriginLabel } from "../retrieval/types.js";
import { validateLocalAgent } from "./tools.js";

export class KnowledgeStore {
  private constructor(readonly db: DatabaseSync, readonly manifest: Snapshot, readonly manifestHash: string, readonly chunks: Map<string, Chunk>, readonly directory: string) {}
  static async open(file: string, data?: Prepared): Promise<KnowledgeStore> {
    const raw = await readFile(file, "utf8"), manifest = SnapshotSchema.parse(JSON.parse(raw)), directory = path.dirname(file);
    if (data && JSON.stringify(manifest.inputHashes) !== JSON.stringify(data.inputHashes)) throw new Error("Base local preparada para outras entradas.");
    if (hash(await readFile(`${directory}/plan.json`, "utf8")) !== manifest.planHash) throw new Error("Plano congelado foi alterado.");
    if (hashBytes(await readFile(`${directory}/${manifest.database}`)) !== manifest.databaseHash) throw new Error("Banco congelado foi alterado.");
    const text = await readFile(`${directory}/${manifest.chunksFile}`, "utf8");
    if (hash(text) !== manifest.chunksHash) throw new Error("Textos congelados foram alterados.");
    for (const file of manifest.rawFiles) {
      if (!/^raw\/[a-z0-9-]+\.body\.json$/.test(file.path) || hashBytes(await readFile(`${directory}/${file.path}`)) !== file.hash) throw new Error("Fonte bruta congelada foi alterada.");
    }
    const chunks = text.trim().split("\n").map(line => ChunkSchema.parse(JSON.parse(line)));
    if (chunks.length !== manifest.counts.chunks || new Set(chunks.map(c => c.id)).size !== chunks.length) throw new Error("Contagem/IDs dos documentos inconsistente.");
    const db = new DatabaseSync(`${directory}/${manifest.database}`, { readOnly: true });
    try {
      if ((db.prepare("SELECT count(*) n FROM chunks").get()?.n) !== chunks.length || db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw new Error("Banco inconsistente.");
      return new KnowledgeStore(db, manifest, hash(raw), new Map(chunks.map(c => [c.id, c])), directory);
    } catch (error) { db.close(); throw error; }
  }
  close() { this.db.close(); }
  search(text: string, limit = 5, kind?: Chunk["kind"]) { return searchDatabase(this.db, text, limit, kind); }
  gapsFor(id: string): string[] {
    const scope = this.manifest.scope.find(q => q.id === id);
    if (!scope) throw new Error(`Questão fora do recorte da base: ${id}`);
    const gaps = [...scope.gaps];
    for (const source of scope.sources) {
      const chunks = [...this.chunks.values()].filter(c => c.sourceId === source);
      if (!chunks.length) { gaps.push(`Fonte ${source}: nenhum texto utilizável incorporado.`); continue; }
      for (const article of scope.articles[source] ?? []) {
        if (article !== "*" && !chunks.some(c => c.locator.match(/!art([0-9a-z-]+)/i)?.[1]?.replaceAll("-", "").toLowerCase() === article.replaceAll("-", "").toLowerCase())) gaps.push(`Fonte ${source}: artigo ${article} não incorporado.`);
      }
    }
    return gaps;
  }
}
export function localCitations(verdict: Verdict | Proposal, context: LocalContext): string[] {
  const cited = [...new Set(JSON.stringify(verdict).match(/S-[a-f0-9]{12}\b/g) ?? [])];
  const delivered = new Set(JSON.parse(context.judgeContext).fontes.map((s: { id: string }) => s.id));
  if (cited.some(id => !delivered.has(id))) throw new Error("Parecer cita fonte não fornecida pela base local.");
  return cited;
}
export class LocalContextService {
  constructor(readonly store: KnowledgeStore, readonly data: Prepared, readonly labels: Map<string, OriginLabel>, readonly config: Config) {
    if (config.knowledge?.enabled && config.legalCutoff !== store.manifest.cutoff) throw new Error("Data de corte do juiz difere da base local.");
  }
  make(question: Question, proposal: Proposal): LocalContext {
    const options = this.config.knowledge!;
    const label = this.labels.get(question.id) ?? { disciplina: null, assunto: null };
    const proposed = this.data.themes.find(t => t.tema_id === proposal.tema_central_id);
    const specs = [
      { role: "questao", text: [question.enunciado, question.comando, ...Object.values(question.alternativas)].join(" ") },
      { role: "classificador", text: proposed?.titulo ?? "" },
      { role: "origem", text: label.assunto ?? "" },
      { role: "concorrentes", text: proposal.concorrentes_ids.map(id => this.data.themes.find(t => t.tema_id === id)?.titulo ?? "").join(" ") },
    ];
    const searches = specs.map(q => ({ ...q, ...this.store.search(q.text, options.maxDocuments) }));
    const queries = searches.map(({ role, text, expression }) => ({ role, text, expression }));
    const selected: Chunk[] = [];
    for (let i = 0; i < options.maxDocuments; i++) for (const query of searches) {
      const chunk = query.chunks[i];
      if (chunk && selected.length < options.maxDocuments && !selected.some(c => c.locator === chunk.locator && c.text === chunk.text)) selected.push(chunk);
    }
    return this.fromChunks(question, proposal, selected, queries);
  }
  fromChunks(question: Question, proposal: Proposal | null, selected: Chunk[], queries: LocalContext["queries"], role: "classifier" | "judge" = "judge"): LocalContext {
    const options = this.config.knowledge!;
    const label = this.labels.get(question.id) ?? { disciplina: null, assunto: null };
    const proposed = proposal ? this.data.themes.find(t => t.tema_id === proposal.tema_central_id) : undefined;
    const inputHash = hash(JSON.stringify(role === "classifier" ? { question, role, options } : { question, proposal, label, options }));
    const gaps = this.store.gapsFor(question.id);
    const envelope = { status: "retrieved", base: { id: this.store.manifest.id, manifestHash: this.store.manifestHash, cutoff: this.store.manifest.cutoff }, ...(role === "judge" ? { rotulo_original: label, tema_proposto: proposed ? { id: proposed.tema_id, titulo: proposed.titulo } : null } : {}), consultas: queries.map(q => ({ role: q.role, expression: q.expression })), lacunas: gaps, fontes: [] as Record<string, unknown>[] };
    const chunks: Chunk[] = [];
    for (const chunk of selected.slice(0, options.maxDocuments)) {
      const text = chunk.text.slice(0, 2200);
      const metadata = { ...chunk.metadata }; delete metadata.clauses;
      const clauses = chunk.metadata.clauses as { date?: string; force?: string; type?: string }[] | undefined;
      if (clauses) {
        metadata.versionDates = [...new Set(clauses.map(c => c.date).filter(Boolean))];
        metadata.forceNotes = [...new Set(clauses.map(c => c.force).filter(Boolean))];
        metadata.versionTypes = [...new Set(clauses.map(c => c.type).filter(Boolean))];
      }
      envelope.fontes.push({ id: chunk.id, tipo: chunk.kind, titulo: chunk.title, localizador: chunk.locator, texto: text, truncado: text.length < chunk.text.length, versao_data: chunk.versionDate, url: chunk.url, hash: chunk.contentHash, metadados: metadata });
      if (JSON.stringify(envelope).length > options.maxContextCharacters) envelope.fontes.pop();
      else chunks.push(chunk);
    }
    envelope.status = chunks.length ? "retrieved" : "empty";
    const judgeContext = JSON.stringify(envelope);
    if (judgeContext.length > options.maxContextCharacters) throw new Error("Metadados excedem orçamento de contexto local.");
    return { version: 1, snapshotHash: this.store.manifestHash, inputHash, status: chunks.length ? "retrieved" : "empty", queries, chunks, gaps, judgeContext, sourcesUsed: [] };
  }
  validate(record: RecordState) {
    if (!record.knowledge) { if (record.verdict || record.knowledgeAgent) throw new Error("Parecer/sessão sem recuperação local registrada."); return; }
    if (!record.proposal) throw new Error("Contexto local sem proposta.");
    const saved = LocalContextSchema.parse(record.knowledge);
    const q = this.data.questions.find(q => q.id === record.id);
    if (!q) throw new Error("Questão ausente.");
    const expected = this.config.knowledge?.mode === "judge_tools" ? validateLocalAgent(this, record, q) : this.make(q, record.proposal);
    if (JSON.stringify({ ...saved, sourcesUsed: [] }) !== JSON.stringify(expected)) throw new Error("Contexto local difere da base, entrada ou consulta congelada.");
    if (JSON.stringify(saved.sourcesUsed) !== JSON.stringify(record.verdict ? localCitations(record.verdict, saved) : [])) throw new Error("Citações locais inconsistentes.");
  }
  validateClassifier(record: RecordState) {
    if (!record.classifierKnowledge) {
      if (record.proposal || record.classifierKnowledgeAgent || record.attempts?.classifier) throw new Error("Classificador com consultas sem contexto registrado.");
      return;
    }
    const question = this.data.questions.find(q => q.id === record.id);
    if (!question) throw new Error("Questão ausente.");
    const saved = LocalContextSchema.parse(record.classifierKnowledge);
    const expected = validateLocalAgent(this, record, question, "classifier");
    if (JSON.stringify({ ...saved, sourcesUsed: [] }) !== JSON.stringify(expected) || saved.sourcesUsed.length) throw new Error("Contexto do classificador difere das consultas congeladas.");
    if (record.proposal && JSON.stringify(record.proposal).match(/S-[a-f0-9]{12}\b/)) throw new Error("Proposta inclui IDs de fonte reservados ao histórico de consultas.");
  }
  async collectClassifier(record: RecordState, save: () => Promise<void>) {
    this.validateClassifier(record);
    if (!record.classifierKnowledge) {
      const question = this.data.questions.find(q => q.id === record.id)!;
      record.classifierKnowledge = this.fromChunks(question, null, [], [], "classifier");
      await save();
    }
  }
  async collect(record: RecordState, save: () => Promise<void>) {
    if (!record.proposal) return;
    this.validate(record);
    if (!record.knowledge) {
      const question = this.data.questions.find(q => q.id === record.id)!;
      record.knowledge = this.config.knowledge?.mode === "judge_tools" ? this.fromChunks(question, record.proposal, [], []) : this.make(question, record.proposal);
      await save();
    }
  }
}
export function validateLocalCheckpoint(record: RecordState, config: Config, service?: LocalContextService) {
  if (!config.knowledge?.enabled) { if (record.knowledge || record.knowledgeAgent || record.classifierKnowledge || record.classifierKnowledgeAgent) throw new Error("Contexto local em execução desabilitada."); return; }
  if (config.knowledge.mode !== "judge_tools" && record.knowledgeAgent) throw new Error("Ciclo de ferramentas em modo automático.");
  if (!service) throw new Error("Base local não inicializada.");
  if (config.knowledge.classifierMode === "tools") service.validateClassifier(record);
  else if (record.classifierKnowledge || record.classifierKnowledgeAgent) throw new Error("Contexto do classificador em modo desabilitado.");
  service.validate(record);
}
