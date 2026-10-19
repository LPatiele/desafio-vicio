import { z } from "zod";
import type { Config, Prepared, RecordState } from "../../src/types.js";
import { ProposalSchema, VerdictSchema } from "../../src/types.js";
import type { Message } from "../../src/client.js";
import { RetryableCallError } from "../../src/client.js";
import { sharedContext } from "../../src/nodes/especialista.js";
import { indexThemes } from "../../src/data.js";
import { validateProposal, validateVerdict } from "../../src/validation.js";
import { atomicJson, now, parseBatch, sleep } from "../../src/utils.js";
import { LocalContextService, localCitations } from "../../src/knowledge/store.js";
import { localTools, executeLocalTool } from "../../src/knowledge/tools.js";
import { decideRecord } from "../../src/retrieval/decision.js";
import { ReactiveClient } from "./client.js";

export type Operation = { questionId: string; toolCallId: string; name: string; rawArguments: string; result?: string };
export type Session = { ids: string[]; messages: Message[]; rounds: number; operations: Operation[] };
export type Checkpoint = { version: 1; fingerprint: string; records: Record<string, RecordState>; sessions: Record<string, Session> };

export function recoverRetrievalOnly(seed: Checkpoint, oldFingerprint: string, fingerprint: string): Checkpoint {
  if (seed.version !== 1 || seed.fingerprint !== oldFingerprint || Object.values(seed.records).some(r => r.proposal || r.verdict || r.decision || Object.values(r.attempts ?? {}).some(n => !Number.isInteger(n) || n < 0 || n > 5))) throw new Error("Recuperação exige checkpoint original sem propostas, pareceres ou decisões e com tentativas preservadas.");
  return { ...structuredClone(seed), fingerprint };
}

export function toolDefinitions(batch: boolean) {
  return localTools.map(tool => batch ? { type: tool.type, function: { ...tool.function, description: tool.function.description + " Inclua questao_id para vincular exclusivamente à questão informada.", parameters: { ...tool.function.parameters, properties: { ...(tool.function.parameters as any).properties, questao_id: { type: "string", pattern: "^Q[0-9]{4}$" } }, required: [...((tool.function.parameters as any).required ?? []), "questao_id"] } } } : tool);
}

export function routeArguments(raw: string, ids: string[]) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Argumentos de ferramenta inválidos.");
  const questionId = ids.length === 1 ? ids[0]! : parsed.questao_id;
  if (!ids.includes(questionId) || parsed.questao_id !== undefined && parsed.questao_id !== questionId) throw new Error("Ferramenta contém ID ausente ou não solicitado.");
  const args = { ...parsed }; delete args.questao_id;
  return { questionId, rawArguments: JSON.stringify(args) };
}

/** Replay all read-only retrieval, independently per question. Reject a changed
 * SQLite result, cross-question source, duplicate call or fabricated history. */
export function verifySessions(checkpoint: Checkpoint, service: LocalContextService) {
  for (const [key, session] of Object.entries(checkpoint.sessions)) {
    if (!key.endsWith("-classifier")) continue;
    if (new Set(session.ids).size !== session.ids.length || session.rounds > 2) throw new Error("Sessão de lote inválida.");
    const contexts = new Map(session.ids.map(id => [id, service.fromChunks(service.data.questions.find(q => q.id === id)!, null, [], [], "classifier")]));
    const calls = session.messages.flatMap(message => message.role === "assistant" ? message.tool_calls ?? [] : []);
    if (calls.length !== session.operations.length || new Set(calls.map(c => c.id)).size !== calls.length) throw new Error("Histórico de ferramentas inconsistente.");
    for (const [index, operation] of session.operations.entries()) {
      const call = calls[index]!;
      const args = routeArguments(call.function.arguments, session.ids);
      if (call.id !== operation.toolCallId || call.function.name !== operation.name || args.questionId !== operation.questionId || args.rawArguments !== operation.rawArguments) throw new Error("Roteamento de ferramenta alterado.");
      if (operation.result === undefined) continue;
      const id = operation.questionId;
      const used = session.operations.slice(0, index).filter(o => o.questionId === id).reduce((n, o) => n + (o.result?.length ?? 0), 0);
      const replay = executeLocalTool(service, service.data.questions.find(q => q.id === id)!, null, contexts.get(id)!, operation, used, "classifier");
      if (replay.result !== operation.result) throw new Error("Consulta salva difere da base congelada.");
      const replies = session.messages.filter(m => m.role === "tool" && m.tool_call_id === call.id);
      if (replies.length !== 1 || replies[0]!.content !== wireResult(operation, session.ids.length > 1)) throw new Error("Resposta de ferramenta alterada.");
      contexts.set(id, replay.context);
    }
    for (const [id, context] of contexts) if (JSON.stringify(context) !== JSON.stringify(checkpoint.records[id]!.classifierKnowledge)) throw new Error("Contexto recuperado mudou de questão.");
  }
}
const wireResult = (operation: Operation, batch: boolean) => batch ? JSON.stringify({ questao_id: operation.questionId, ...JSON.parse(operation.result!) }) : operation.result!;

export class BatchEngine {
  constructor(readonly data: Prepared, readonly config: Config, readonly batchSize: number, readonly prompts: { classifier: string; judge: string }, readonly service: LocalContextService, readonly client: ReactiveClient, readonly checkpoint: Checkpoint, readonly directory: string) {}
  async save() {
    const themes = indexThemes(this.data.themes);
    for (const question of this.data.questions) {
      const record = this.checkpoint.records[question.id]!;
      if (record.proposal && record.verdict && !record.decision) record.decision = decideRecord(record, question, themes, this.config) ?? undefined;
    }
    await atomicJson(`${this.directory}/checkpoint.json`, this.checkpoint);
    await atomicJson(`${this.directory}/records.json`, this.checkpoint.records);
  }
  async completeTools(session: Session) {
    for (const operation of session.operations.filter(o => o.result === undefined)) {
      const record = this.checkpoint.records[operation.questionId]!;
      const question = this.data.questions.find(q => q.id === record.id)!;
      const used = session.operations.filter(o => o.questionId === record.id).reduce((n, o) => n + (o.result?.length ?? 0), 0);
      const result = executeLocalTool(this.service, question, null, record.classifierKnowledge!, operation, used, "classifier");
      record.classifierKnowledge = result.context; operation.result = result.result;
      session.messages.push({ role: "tool", tool_call_id: operation.toolCallId, content: wireResult(operation, session.ids.length > 1) });
      await this.save();
      await this.client.logger.event("local_tool_result", { id: record.id, role: "classifier", ...operation });
    }
  }
  async stage(role: "classifier" | "judge", ids: string[], key: string) {
    const records = this.checkpoint.records, themes = indexThemes(this.data.themes);
    const schema = z.object({ resultados: z.array(role === "classifier" ? ProposalSchema : VerdictSchema).min(1).max(this.batchSize) }).strict();
    let session = this.checkpoint.sessions[key];
    if (!session) {
      if (role === "classifier") for (const id of ids) records[id]!.classifierKnowledge = this.service.fromChunks(this.data.questions.find(q => q.id === id)!, null, [], [], "classifier");
      const input = ids.map(id => ({ questao: this.data.questions.find(q => q.id === id), ...(role === "judge" ? { proposta: records[id]!.proposal } : {}), contexto_externo: JSON.parse((role === "classifier" ? records[id]!.classifierKnowledge : records[id]!.knowledge)!.judgeContext) }));
      const contract = z.toJSONSchema(schema, { target: "draft-7" }); delete contract.$schema;
      let system = `${this.prompts[role]}\n\n${sharedContext(this.data, this.config)}`;
      if (role === "classifier") system += `\nContrato da saída final (JSON, após consultar a base): ${JSON.stringify(contract)}`;
      if (ids.length > 1) system += `\nAdaptação de lote v17: são ${ids.length} questões independentes. Retorne um registro por ID. Nunca transfira evidências ou fontes entre questões. ${role === "classifier" ? "Toda chamada de ferramenta exige questao_id. Comece buscando referências para CADA questão. Há até duas rodadas de ferramentas, quatro operações por questão e no máximo duas operações por questão em uma rodada. Pode fazer várias chamadas na mesma rodada, uma para cada questão. Orçamento de documentos e caracteres é individual por questão." : "Cada contexto_externo pertence somente ao ID que o acompanha; cite apenas fontes entregues para esse ID."}`;
      session = { ids, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ questoes: input }) }], rounds: 0, operations: [] };
      this.checkpoint.sessions[key] = session; await this.save();
    }
    if (role === "classifier") await this.completeTools(session);
    while (true) {
      const active = ids.filter(id => !(role === "classifier" ? records[id]!.proposal : records[id]!.verdict) && (records[id]!.attempts?.[role] ?? 0) < 5);
      if (!active.length) return;
      const remaining = Math.min(...active.map(id => 5 - (records[id]!.attempts?.[role] ?? 0)));
      const final = role === "judge" || session.rounds >= 2 || remaining <= 1;
      let sent = false;
      try {
        const result = await this.client.turn(role, session.messages, schema, active, async requestId => {
          if (sent) throw new Error("Envio duplicado na mesma tentativa.");
          sent = true;
          for (const id of active) { records[id]!.attempts ??= {}; records[id]!.attempts![role] = (records[id]!.attempts![role] ?? 0) + 1; }
          await this.save();
          await this.client.logger.event("stage_attempt", { role, ids: active, requestId, attempts: Object.fromEntries(active.map(id => [id, records[id]!.attempts![role]])) });
        }, role === "classifier" ? { tools: toolDefinitions(ids.length > 1), choice: session.rounds === 0 && !final ? { type: "function", function: { name: "buscar_referencias" } } : "auto", final } : undefined);
        if (!sent) throw new Error("Tentativa não persistida antes do envio.");
        if (result.kind === "tools") {
          if (role !== "classifier" || final) throw new RetryableCallError("Ferramenta fora da etapa de consultas.");
          const operations: Operation[] = result.message.tool_calls.map(call => {
            let route;
            try { route = routeArguments(call.function.arguments, session!.ids); }
            catch (error) { throw new RetryableCallError((error as Error).message); }
            if (!active.includes(route.questionId)) throw new RetryableCallError("Consulta para questão já finalizada ou não solicitada.");
            return { ...route, name: call.function.name, toolCallId: call.id };
          });
          for (const id of active) {
            if (operations.filter(o => o.questionId === id).length > 2 || session.operations.filter(o => o.questionId === id).length + operations.filter(o => o.questionId === id).length > 4) throw new RetryableCallError("Limite individual de ferramentas excedido.");
          }
          if (operations.some(o => session!.operations.some(old => old.toolCallId === o.toolCallId))) throw new RetryableCallError("ID de ferramenta repetido.");
          session.messages.push(result.message); session.rounds++; session.operations.push(...operations);
          await this.save(); await this.completeTools(session); continue;
        }
        session.messages.push(result.message);
        const parsed = role === "classifier" ? parseBatch(result.content, ProposalSchema, active) : parseBatch(result.content, VerdictSchema, active);
        const errors = { ...parsed.errors };
        for (const value of parsed.valid) {
          const record = records[value.id]!;
          const failures: string[] = [];
          if (role === "classifier") {
            if (!session.operations.some(o => o.questionId === value.id && o.result && ["buscar_referencias", "consultar_dispositivo"].includes(o.name) && !JSON.parse(o.result).erro)) failures.push("Proposta sem consulta válida para este ID.");
            failures.push(...validateProposal(ProposalSchema.parse(value), this.data.questions.find(q => q.id === value.id)!, themes));
            if (/S-[a-f0-9]{12}\b/.test(JSON.stringify(value))) failures.push("Proposta inclui IDs S- reservados ao histórico.");
            if (!failures.length) record.proposal = ProposalSchema.parse(value);
          } else {
            const verdict = VerdictSchema.parse(value);
            failures.push(...validateVerdict(verdict, record.proposal!, themes));
            try { const citations = localCitations(verdict, record.knowledge!); if (!failures.length) { record.verdict = verdict; record.knowledge!.sourcesUsed = citations; } }
            catch (error) { failures.push((error as Error).message); }
          }
          if (failures.length) errors[value.id] = failures.join("; ");
        }
        for (const [id, message] of Object.entries(errors)) records[id]!.errors.push({ stage: role, message, at: now() });
        await this.client.logger.event("validation", { role, ids: active, errors, unexpected: parsed.unexpected });
        await this.save();
        const pending = active.filter(id => !(role === "classifier" ? records[id]!.proposal : records[id]!.verdict));
        if (pending.length) session.messages.push({ role: "user", content: JSON.stringify({ ids_pendentes: pending, falhas: errors, instrucao: "Responda somente para os IDs pendentes; preserve os registros válidos. Corrija formato, consulta e evidências sem trocar o tema apenas para passar na validação." }) });
        await this.save();
      } catch (error) {
        if (!(error instanceof RetryableCallError)) throw error;
        if (!sent) throw new Error("Falha técnica sem reserva de tentativa.");
        for (const id of active) records[id]!.errors.push({ stage: role, message: error.message, at: now() });
        session.messages.push({ role: "user", content: JSON.stringify({ ids_pendentes: active, falha_tecnica: error.message, instrucao: "Corrija a resposta para os IDs pendentes. Não altere o enquadramento só para passar na validação." }) });
        await this.save();
        if (error.retryAfterMs && active.some(id => (records[id]!.attempts?.[role] ?? 0) < 5)) await sleep(error.retryAfterMs);
      }
    }
  }
  async run() {
    const ids = this.data.questions.map(q => q.id);
    for (let offset = 0; offset < ids.length; offset += this.batchSize) {
      const group = ids.slice(offset, offset + this.batchSize);
      if (group.every(id => this.checkpoint.records[id]!.decision)) continue;
      await this.stage("classifier", group, `${offset}-classifier`);
      const proposed = group.filter(id => this.checkpoint.records[id]!.proposal);
      for (const id of proposed) await this.service.collect(this.checkpoint.records[id]!, () => this.save());
      if (proposed.length) await this.stage("judge", proposed, `${offset}-judge`);
      const themes = indexThemes(this.data.themes);
      for (const id of proposed) {
        const record = this.checkpoint.records[id]!;
        if (record.verdict && !record.decision) record.decision = decideRecord(record, this.data.questions.find(q => q.id === id)!, themes, this.config) ?? undefined;
      }
      await this.save();
      await this.client.logger.event("batch_complete", { ids: group, completed: group.filter(id => this.checkpoint.records[id]!.decision) });
    }
  }
}
