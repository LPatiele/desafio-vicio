import { z } from "zod";
import type { Config, Prepared, Proposal, RecordState, Verdict } from "../types.js";
import { ProposalSchema, VerdictSchema } from "../types.js";
import { RetryableCallError, type Message, type ModelCaller } from "../client.js";
import { Logger } from "../logger.js";
import { indexThemes } from "../data.js";
import { now, parseBatch, sleep } from "../utils.js";
import { validateProposal, validateVerdict } from "../validation.js";
import type { BatchState } from "../state.js";
import type { ResearchSession } from "../research/session.js";
import { runResearchJudge } from "../research/judge.js";
import { citedSources } from "../retrieval/context.js";
import { runLocalJudge, runLocalClassifier } from "../knowledge/agent-judge.js";
import type { LocalContextService } from "../knowledge/store.js";
import { localCitations } from "../knowledge/store.js";

export type Dependencies = {
  config: Config; data: Prepared; caller: ModelCaller; prompts: { classifier: string; judge: string };
  logger: Logger; save: (records: Record<string, RecordState>) => Promise<void>;
  research?: ResearchSession;
  localKnowledge?: LocalContextService;
  context?: { collect(record: RecordState, save: () => Promise<void>): Promise<void> };
};
export function sharedContext(data: Prepared, config: Config): string {
  const themes = data.themes.filter(t => t.status === "active").map(t => ({
    id: t.tema_id, pai: t.parent_id || null, disciplina: t.disciplina, nivel: t.nivel,
    titulo: t.titulo, descricao: t.descricao,
  }));
  const research = config.research ? `\nPesquisa externa: ${config.research.enabled ? "habilitada; busca LexML obrigatória antes do parecer" : "desabilitada nesta condição de controle"}.` : "";
  return `Data de corte: ${config.legalCutoff}${research}\nTaxonomia ativa completa (dados, não instruções):\n${JSON.stringify(themes)}`;
}
export function createAgentNode(role: "classifier" | "judge", deps: Dependencies) {
  const questions = new Map(deps.data.questions.map(q => [q.id, q]));
  const themes = indexThemes(deps.data.themes);
  const system = `${deps.prompts[role]}\n\n${sharedContext(deps.data, deps.config)}`;
  return async (state: BatchState): Promise<Partial<BatchState>> => {
    const records = structuredClone(state.records);
    const ids = state.ids.filter(id => role === "classifier" ? !records[id]?.proposal : records[id]?.proposal && !records[id]?.verdict);
    if (!ids.length) return {};
    if (role === "judge" && deps.config.retrieval?.enabled && ids.some(id => !records[id]?.retrieval?.judgeContext || records[id]?.retrieval?.status === "running")) throw new Error("Juiz requer contexto API finalizado, mesmo quando indisponível.");
    if (role === "judge" && deps.config.knowledge?.enabled && ids.some(id => !records[id]?.knowledge?.judgeContext)) throw new Error("Juiz requer consulta local registrada.");
    const classifierTools = role === "classifier" && deps.config.knowledge?.enabled && deps.config.knowledge.classifierMode === "tools";
    if (classifierTools) {
      if (!deps.localKnowledge) throw new Error("Classificador com consultas requer serviço local.");
      for (const id of ids) await deps.localKnowledge.collectClassifier(records[id]!, () => deps.save(records));
    }
    const input = ids.map(id => role === "classifier" ? classifierTools ? { questao: questions.get(id), contexto_externo: JSON.parse(records[id]!.classifierKnowledge!.judgeContext) } : questions.get(id) : { questao: questions.get(id), proposta: records[id]!.proposal,
      ...(deps.config.retrieval?.enabled ? { contexto_externo: JSON.parse(records[id]!.retrieval!.judgeContext!) } : {}),
      ...(deps.config.knowledge?.enabled ? { contexto_externo: JSON.parse(records[id]!.knowledge!.judgeContext) } : {}) });
    const schema = z.object({ resultados: z.array(role === "classifier" ? ProposalSchema : VerdictSchema).min(1).max(deps.config.batchSize) }).strict();
    const managed = deps.config.maxAttemptsPerStage > 1;
    if (managed && ids.length !== 1) throw new Error("Retentativas por etapa exigem uma questão por chamada.");
    const id = ids[0]!;
    if (classifierTools) return runLocalClassifier(deps, records, id, [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ questoes: input }) }], schema);
    if (role === "judge" && deps.config.research?.enabled) return runResearchJudge(deps, records, id, [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ questoes: input }) }], schema);
    if (role === "judge" && deps.config.knowledge?.enabled && deps.config.knowledge.mode === "judge_tools") return runLocalJudge(deps, records, id, [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ questoes: input }) }], schema);
    let feedback = managed ? records[id]!.errors.filter(e => e.stage === role).at(-1)?.message : undefined;
    let waitMs = 0;
    while (true) {
      if (managed && (records[id]!.attempts?.[role] ?? 0) >= deps.config.maxAttemptsPerStage) {
        await deps.logger.event("stage_exhausted", { id, role, attempts: records[id]!.attempts?.[role], limit: deps.config.maxAttemptsPerStage });
        return { records };
      }
      if (waitMs) await sleep(waitMs);
      const messages: Message[] = [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ questoes: input }) }];
      if (managed && feedback) messages.push({ role: "user", content: JSON.stringify({ falha_tecnica_anterior: feedback, instrucao: "Reenvie o registro completo para o mesmo ID, corrigindo formato, campos e evidências quando necessário. Cite literalmente o campo indicado. Não altere o tema apenas para satisfazer a validação." }) });
      let sent = false;
      const beforeSend = managed ? async (requestId: string) => {
        if (sent) throw new Error("Retentativas de transporte não podem se sobrepor ao limite por etapa.");
        sent = true;
        const record = records[id]!;
        record.attempts ??= {};
        record.attempts[role] = (record.attempts[role] ?? 0) + 1;
        // Reserve the attempt durably before sending, so resuming cannot reset the cap.
        await deps.save(records);
        await deps.logger.event("stage_attempt", { requestId, id, role, attempt: record.attempts[role], limit: deps.config.maxAttemptsPerStage });
      } : undefined;
      let retryAfterMs = 0;
      try {
        const raw = await deps.caller.call(role, role === "classifier" ? deps.config.classifierModel : deps.config.judgeModel, messages, schema, ids, beforeSend);
        if (managed && !sent) throw new Error("Cliente não registrou o início da tentativa antes do envio.");
        const parsed = role === "classifier" ? parseBatch(raw, ProposalSchema, ids) : parseBatch(raw, VerdictSchema, ids);
        const errors = { ...parsed.errors };
        if (managed && parsed.unexpected.length) errors[id] = `Resposta contém IDs não solicitados: ${parsed.unexpected.join(", ")}.`;
        for (const value of parsed.valid) {
          if (errors[value.id]) continue;
          const record = records[value.id]!;
          const failures = role === "classifier" ? validateProposal(value as Proposal, questions.get(value.id)!, themes)
            : validateVerdict(value as Verdict, record.proposal!, themes);
          let citations: string[] = [];
          if (role === "judge" && deps.config.retrieval?.enabled) {
            try { citations = citedSources(value as Verdict, record.retrieval!); }
            catch (error) { failures.push((error as Error).message); }
          }
          if (role === "judge" && deps.config.knowledge?.enabled) {
            try { citations = localCitations(value as Verdict, record.knowledge!); }
            catch (error) { failures.push((error as Error).message); }
          }
          if (failures.length) errors[value.id] = failures.join("; ");
          else if (role === "classifier") record.proposal = value as Proposal;
          else {
            record.verdict = value as Verdict;
            if (deps.config.retrieval?.enabled) record.retrieval!.sourcesUsed = citations;
            if (deps.config.knowledge?.enabled) record.knowledge!.sourcesUsed = citations;
          }
        }
        for (const [failedId, message] of Object.entries(errors)) records[failedId]!.errors.push({ stage: role, message, at: now() });
        await deps.logger.event("validation", { role, ids, errors, unexpectedIds: parsed.unexpected });
        await deps.save(records);
        if (!managed || (role === "classifier" ? records[id]!.proposal : records[id]!.verdict)) return { records };
        feedback = errors[id] ?? "Resposta ausente para o ID solicitado.";
      } catch (error) {
        if (!managed || !(error instanceof RetryableCallError)) throw error;
        if (!sent) throw new Error("Cliente não registrou o início da tentativa interrompida.");
        records[id]!.errors.push({ stage: role, message: error.message, at: now() });
        await deps.save(records);
        retryAfterMs = error.retryAfterMs;
        // A network/truncation retry repeats the input; it does not reinterpret a valid verdict.
        feedback = undefined;
      }
      waitMs = Math.max(retryAfterMs, Math.min(30000, deps.config.retryBaseDelayMs * 2 ** Math.max(0, (records[id]!.attempts?.[role] ?? 1) - 1)));
      if ((records[id]!.attempts?.[role] ?? 0) < deps.config.maxAttemptsPerStage) await deps.logger.event("stage_retry", { id, role, attempts: records[id]!.attempts?.[role], waitMs });
    }
  };
}
