import type { Config, Question, RecordState, Theme } from "../types.js";
import { decide } from "../validation.js";

export function decideRecord(record: RecordState, question: Question, themes: Map<string, Theme>, config: Config) {
  if (!record.proposal || !record.verdict) return null;
  if (config.knowledge?.enabled && !record.knowledge) return null;
  if (config.retrieval?.enabled && (!record.retrieval || record.retrieval.status === "running")) return null;
  const decision = decide(record.proposal, record.verdict, question, themes, config);
  // Coverage gaps are context for the judge, not an automatic publication veto.
  // Keep integrity/checkpoint requirements above; uncertainty in the verdict is
  // still handled by decide(), like any other material classification doubt.
  if (decision?.decisao === "publicar" && config.retrieval?.enabled && config.retrieval.requireApiSuccessForPublication && record.retrieval?.status !== "complete") {
    return { ...decision, decisao: "revisar" as const, motivo: `${decision.motivo} Contexto API indisponível ou incompleto; publicação exige sucesso das consultas planejadas.` };
  }
  return decision;
}
