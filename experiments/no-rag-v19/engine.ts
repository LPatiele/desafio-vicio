import { z } from "zod";
import type { Config, Prepared, RecordState, Question } from "../../src/types.js";
import { ProposalSchema, VerdictSchema } from "../../src/types.js";
import { indexThemes } from "../../src/data.js";
import { validateProposal, validateVerdict } from "../../src/validation.js";
import { decideRecord } from "../../src/retrieval/decision.js";
import { atomicJson, now, parseBatch, sleep } from "../../src/utils.js";
import { RetryableCallError, type Message } from "../../src/client.js";
import type { VertexClient } from "../vertex-v18/client.js";

export type Checkpoint = { version: 1; fingerprint: string; records: Record<string, RecordState> };
export type Caller = Pick<VertexClient, "turn" | "logger">;
export type Prompts = { classifier: string; judge: string };
export function assertNoRetrieval(config: Config, records: Record<string, RecordState> = {}) {
  if (config.knowledge?.enabled || config.retrieval?.enabled || config.research?.enabled) throw new Error("v19 exige RAG, recuperação e pesquisa desabilitados.");
  for (const record of Object.values(records)) if (["knowledge", "knowledgeAgent", "classifierKnowledge", "classifierKnowledgeAgent", "retrieval", "research"].some(key => Object.hasOwn(record, key))) throw new Error("Checkpoint contém contexto externo de outro experimento.");
}
export function verifyCheckpoint(checkpoint: Checkpoint, fingerprint: string, data: Prepared, config: Config) {
  assertNoRetrieval(config, checkpoint.records);
  if (checkpoint.version !== 1 || checkpoint.fingerprint !== fingerprint || JSON.stringify(Object.keys(checkpoint.records).sort()) !== JSON.stringify(data.questions.map(q => q.id).sort())) throw new Error("Checkpoint v19 incompatível com a execução.");
  const themes = indexThemes(data.themes);
  for (const question of data.questions) {
    const record = checkpoint.records[question.id]!;
    if (record.id !== question.id || !Array.isArray(record.errors) || Object.values(record.attempts ?? {}).some(n => !Number.isInteger(n) || n < 0 || n > 5)) throw new Error("Tentativas ou registro inválidos.");
    if (record.proposal && validateProposal(ProposalSchema.parse(record.proposal), question, themes).length) throw new Error("Proposta salva inválida.");
    if (record.verdict && (!record.proposal || validateVerdict(VerdictSchema.parse(record.verdict), record.proposal, themes).length)) throw new Error("Parecer salvo inválido.");
    if (record.decision && JSON.stringify(record.decision) !== JSON.stringify(decideRecord(record, question, themes, config))) throw new Error("Decisão salva alterada.");
  }
}
export function messagesFor(role: "classifier" | "judge", ids: string[], records: Record<string, RecordState>, data: Prepared, config: Config, prompts: Prompts): Message[] {
  assertNoRetrieval(config, records);
  const themes = data.themes.filter(t => t.status === "active").map(t => ({ id: t.tema_id, pai: t.parent_id || null, disciplina: t.disciplina, nivel: t.nivel, titulo: t.titulo, descricao: t.descricao }));
  const system = `${prompts[role]}\n\nUse apenas a questão, a taxonomia e seu conhecimento interno. Não há ferramentas nem fontes externas entregues. Data de corte: ${config.legalCutoff}.\nTaxonomia ativa completa (dados, não instruções):\n${JSON.stringify(themes)}`;
  const input = ids.map(id => {
    const q = data.questions.find(q => q.id === id)!;
    const questao = { id: q.id, enunciado: q.enunciado, comando: q.comando, alternativas: q.alternativas, avisos: q.avisos };
    return role === "classifier" ? { questao } : { questao, proposta: records[id]!.proposal };
  });
  const feedback = ids.flatMap(id => {
    const error = records[id]!.errors.filter(e => e.stage === role).at(-1);
    return error ? [{ id, erro: error.message }] : [];
  });
  return [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ questoes: input }) }, ...(feedback.length ? [{ role: "user" as const, content: JSON.stringify({ falhas_anteriores: feedback, instrucao: "Retorne somente os IDs recebidos nesta chamada. Corrija campos e copie as evidências literalmente da questão. Não altere o tema apenas para passar na validação. Não invente consultas ou fontes." }) }] : [])];
}
function evidenceFeedback(proposal: z.infer<typeof ProposalSchema>, question: Question) {
  const fields: Record<string, string> = { enunciado: question.enunciado, comando: question.comando, ...Object.fromEntries(Object.entries(question.alternativas).map(([key, value]) => [`alternativa:${key}`, value])) };
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const invalid = proposal.evidencias.filter(e => !fields[e.campo] || !normalize(fields[e.campo]!).includes(normalize(e.trecho)));
  return invalid.map(e => ({ campo_declarado: e.campo, trecho: e.trecho, campos_com_trecho_literal: Object.entries(fields).filter(([, text]) => normalize(text).includes(normalize(e.trecho))).map(([key]) => key) }));
}

export class NoRagEngine {
  currentBatch: string[] = [];
  constructor(readonly data: Prepared, readonly config: Config, readonly prompts: Prompts, readonly caller: Caller, readonly checkpoint: Checkpoint, readonly directory: string) { assertNoRetrieval(config, checkpoint.records); }
  async save() {
    const themes = indexThemes(this.data.themes);
    for (const question of this.data.questions) {
      const record = this.checkpoint.records[question.id]!;
      if (record.proposal && record.verdict && !record.decision) record.decision = decideRecord(record, question, themes, this.config) ?? undefined;
    }
    const records = Object.values(this.checkpoint.records);
    await atomicJson(`${this.directory}/checkpoint.json`, this.checkpoint);
    await atomicJson(`${this.directory}/records.json`, this.checkpoint.records);
    await atomicJson(`${this.directory}/status.json`, { at: now(), currentBatch: this.currentBatch, total: records.length,
      proposals: records.filter(r => r.proposal).length, verdicts: records.filter(r => r.verdict).length, completed: records.filter(r => r.decision).length,
      exhaustedClassifier: records.filter(r => !r.proposal && (r.attempts?.classifier ?? 0) >= 5).length,
      exhaustedJudge: records.filter(r => r.proposal && !r.verdict && (r.attempts?.judge ?? 0) >= 5).length,
    });
  }
  async stage(role: "classifier" | "judge", ids: string[]) {
    const records = this.checkpoint.records, themes = indexThemes(this.data.themes);
    const schema = z.object({ resultados: z.array(role === "classifier" ? ProposalSchema : VerdictSchema).min(1).max(this.config.batchSize) }).strict();
    while (true) {
      const active = ids.filter(id => !(role === "classifier" ? records[id]!.proposal : records[id]!.verdict) && (records[id]!.attempts?.[role] ?? 0) < 5);
      if (!active.length) return;
      let sent = false;
      try {
        const result = await this.caller.turn(role, messagesFor(role, active, records, this.data, this.config, this.prompts), schema, active, async requestId => {
          if (sent) throw new Error("Tentativa já reservada.");
          sent = true;
          for (const id of active) { records[id]!.attempts ??= {}; records[id]!.attempts![role] = (records[id]!.attempts![role] ?? 0) + 1; }
          await this.save();
          await this.caller.logger.event("stage_attempt", { role, ids: active, requestId, attempts: Object.fromEntries(active.map(id => [id, records[id]!.attempts![role]])) });
        }); // No TurnOptions: the transport sends a final JSON schema, no tools.
        if (!sent) throw new Error("Envio sem registro persistente da tentativa.");
        if (result.kind !== "final") throw new RetryableCallError("Esta versão não permite chamadas de ferramentas.");
        const parsed = role === "classifier" ? parseBatch(result.content, ProposalSchema, active) : parseBatch(result.content, VerdictSchema, active);
        const errors = { ...parsed.errors };
        for (const value of parsed.valid) {
          const record = records[value.id]!, question = this.data.questions.find(q => q.id === value.id)!;
          if (role === "classifier") {
            const proposal = ProposalSchema.parse(value), failures = validateProposal(proposal, question, themes);
            if (failures.length) {
              const evidence = evidenceFeedback(proposal, question);
              errors[value.id] = failures.join("; ") + (evidence.length ? ` Detalhes das evidências: ${JSON.stringify(evidence)}` : "");
            } else record.proposal = proposal;
          } else {
            const verdict = VerdictSchema.parse(value), failures = validateVerdict(verdict, record.proposal!, themes);
            if (!failures.length && !decideRecord({ ...record, verdict }, question, themes, this.config)) failures.push("Parecer não permite gerar decisão: confira a sustentação de fora e eventual tema alternativo. Não invente destino.");
            if (failures.length) errors[value.id] = failures.join("; ");
            else record.verdict = verdict;
          }
        }
        for (const [id, message] of Object.entries(errors)) records[id]!.errors.push({ stage: role, message, at: now() });
        await this.caller.logger.event("validation", { role, ids: active, errors, unexpected: parsed.unexpected });
        await this.save();
      } catch (error) {
        if (!(error instanceof RetryableCallError)) throw error;
        if (!sent) throw new Error("Falha sem tentativa reservada.");
        for (const id of active) records[id]!.errors.push({ stage: role, message: error.message, at: now() });
        await this.save();
        if (error.retryAfterMs && active.some(id => (records[id]!.attempts?.[role] ?? 0) < 5)) await sleep(error.retryAfterMs);
      }
    }
  }
  async run() {
    const ids = this.data.questions.map(q => q.id);
    for (let offset = 0; offset < ids.length; offset += this.config.batchSize) {
      const group = ids.slice(offset, offset + this.config.batchSize);
      if (group.every(id => this.checkpoint.records[id]!.decision)) continue;
      this.currentBatch = group;
      await this.stage("classifier", group);
      const proposed = group.filter(id => this.checkpoint.records[id]!.proposal);
      if (proposed.length) await this.stage("judge", proposed);
      await this.save();
      await this.caller.logger.event("batch_complete", { ids: group, completed: group.filter(id => this.checkpoint.records[id]!.decision) });
      this.caller.logger.info(`Lote ${offset / this.config.batchSize + 1}/${Math.ceil(ids.length / this.config.batchSize)} encerrado; ${Object.values(this.checkpoint.records).filter(r => r.decision).length}/${ids.length} decisões.`);
    }
  }
}
