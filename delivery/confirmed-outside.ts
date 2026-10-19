import type { Config, Decision, Prepared, Question, RecordState, Theme } from "../src/types.js";
import { validateProposal, validateVerdict } from "../src/validation.js";
import { decideRecord } from "../src/retrieval/decision.js";
import { indexThemes } from "../src/data.js";
import { verifyCheckpoint, type Checkpoint } from "../experiments/no-rag-v19/engine.js";

export const CONFIRMED_OUTSIDE_POLICY = "judge-confirms-outside-v1" as const;

/** Publication rules remain the original ones. A fully affirmative, alert-free
 * judge can settle a classifier's doubt about an otherwise valid outside proposal. */
export function decideConfirmedOutside(record: RecordState, question: Question, themes: Map<string, Theme>, config: Config): Decision | null {
  if (config.knowledge?.enabled || config.retrieval?.enabled || config.research?.enabled) return null;
  const ordinary = decideRecord(record, question, themes, config);
  if (ordinary) return ordinary;
  const p = record.proposal, v = record.verdict;
  if (!p || !v || !p.fora || p.tema_central_id !== null || !p.incertezas.length || question.avisos.length || v.alertas.length || !v.fora_sustentado || v.tema_alternativo_id !== null || p.extras_ids.length || v.extras_sustentados_ids.length) return null;
  if (validateProposal(p, question, themes).length || validateVerdict(v, p, themes).length) return null;
  if ([v.tema_central, v.evidencia_textual, v.distincao_de_concorrentes].some(r => r.avaliacao !== "sustentado")) return null;
  return { id: p.id, decisao: "fora", tema_central_id: null, extras_ids: [], confianca_declarada: p.confianca_declarada,
    motivo: `${p.justificativa} Dúvida de escopo do classificador resolvida pelo juiz: ${v.distincao_de_concorrentes.justificativa}`.slice(0, 1500) };
}

export function verifyConfirmedOutside(checkpoint: Checkpoint, fingerprint: string, data: Prepared, config: Config) {
  const undecided = structuredClone(checkpoint);
  for (const r of Object.values(undecided.records)) delete r.decision;
  // Reuse all original input, schema, active-ID, evidence and no-RAG checks.
  verifyCheckpoint(undecided, fingerprint, data, config);
  const themes = indexThemes(data.themes);
  for (const q of data.questions) {
    const r = checkpoint.records[q.id]!;
    if (r.decision && JSON.stringify(r.decision) !== JSON.stringify(decideConfirmedOutside(r, q, themes, config))) throw new Error(`Decisão diverge da política de fora confirmado: ${q.id}.`);
  }
}
