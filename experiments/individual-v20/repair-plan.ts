import { hash } from "../../src/utils.js";
import { VerdictSchema, type RecordState, type Verdict } from "../../src/types.js";
import type { Checkpoint } from "../no-rag-v19/engine.js";

export const REPAIR_IDS = ["Q0017", "Q0083", "Q0154", "Q0298", "Q0319"] as const;
export const RECLASSIFY_IDS = REPAIR_IDS.filter(id => id !== "Q0319");

/** New, explicitly authorized recovery cycle; original attempts are immutable. */
export function recoveryRecords(parent: Checkpoint) {
  const pending = Object.values(parent.records).filter(r => !r.decision).map(r => r.id).sort();
  if (JSON.stringify(pending) !== JSON.stringify([...REPAIR_IDS].sort())) throw new Error("Pendências diferem dos cinco IDs autorizados.");
  const records = structuredClone(parent.records);
  for (const id of REPAIR_IDS) {
    const old = records[id]!;
    records[id] = { id, errors: [], ...(id === "Q0319" ? { proposal: old.proposal } : {}) };
    if (!old.proposal || old.verdict || (old.attempts?.judge ?? 0) !== 5) throw new Error(`Histórico inesperado: ${id}.`);
  }
  return records;
}

export function checkInherited(parent: Checkpoint, records: Record<string, RecordState>) {
  if (JSON.stringify(Object.keys(records).sort()) !== JSON.stringify(Object.keys(parent.records).sort())) throw new Error("Universo de IDs alterado.");
  for (const [id, record] of Object.entries(parent.records)) if (!REPAIR_IDS.includes(id as typeof REPAIR_IDS[number]) && hash(JSON.stringify(record)) !== hash(JSON.stringify(records[id]))) throw new Error(`Registro concluído foi alterado: ${id}.`);
  for (const id of REPAIR_IDS) if (Object.values(records[id]!.attempts ?? {}).some(n => n > 5)) throw new Error("Ciclo de recuperação excede cinco tentativas por etapa.");
}

export function recoveryContext(parent: Checkpoint, requests: any[]) {
  return Object.fromEntries(RECLASSIFY_IDS.map(id => {
    const starts = requests.filter(r => r.phase === "start" && r.role === "judge" && r.ids.includes(id));
    let last: Verdict | null = null;
    for (const start of starts) {
      const response = requests.find(r => r.phase === "response" && r.requestId === start.requestId && r.status === 200);
      if (!response) continue;
      const raw = JSON.parse(response.body);
      const text = (raw.candidates?.[0]?.content?.parts ?? []).filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("");
      try { const parsed = JSON.parse(text); last = VerdictSchema.parse(parsed.resultados.find((v: any) => v.id === id)); } catch { /* Only schema-valid prior responses are included. */ }
    }
    if (!last) throw new Error(`Sem parecer anterior recuperável: ${id}.`);
    return [id, { origem: "Ciclo de recuperação autorizado; críticas anteriores dos mesmos modelos, sem gabarito ou referência de avaliação.",
      proposta_anterior: parent.records[id]!.proposal, parecer_anterior_nao_aceito: last,
      falhas_anteriores: parent.records[id]!.errors,
      instrucao: "Reavalie o enquadramento pelo mérito, confrontando a crítica anterior com a questão e toda a taxonomia. O parecer anterior pode estar errado. Emita uma nova proposta completa, sem copiar conclusões automaticamente. Se não houver tema adequado, admita fora; se houver dúvida material, preserve-a. Não remova incertezas nem escolha tema apenas para passar na validação. Não use referência de avaliação ou fontes externas." }];
  }));
}
