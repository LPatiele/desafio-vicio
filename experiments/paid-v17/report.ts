import type { Prepared, RecordState } from "../../src/types.js";
import { indexThemes, relationship, loadData } from "../../src/data.js";
import { loadReference, metrics, type ComparisonRow } from "../../src/evaluation.js";
import { atomicJson, now } from "../../src/utils.js";

/** Evaluation reference is loaded only for reporting, never for model input. */
export async function report(directory: string, data: Prepared, records: Record<string, RecordState>, stopped: string | null, calls: number, startedAt: string) {
  const universe = await loadData();
  const reference = await loadReference(universe, "analise-propria-v2"), themes = indexThemes(data.themes);
  const rows: ComparisonRow[] = reference.items.map(ref => {
    const r = records[ref.id], proposed = r?.proposal?.tema_central_id ?? null, final = r?.decision?.tema_central_id ?? null;
    return { id: ref.id, decisao: r?.decision?.decisao ?? null, tema_proposto: proposed, tema_final: final, tema_referencia: ref.classificacao.tema_id,
      relacao_proposta: r?.proposal ? relationship(proposed, ref.classificacao.tema_id, themes) : null,
      relacao_final: r?.decision ? relationship(final, ref.classificacao.tema_id, themes) : null,
      referencia_limitada: ref.conferencia.possui_ressalva || !!ref.conferencia.fontes_pendentes.length || !!ref.classificacao.limite_especifico,
      raiz: ref.classificacao.nivel === 0 || !!final && themes.get(final)?.nivel === 0,
      exposicao_previa: ref.exposicao_previa_a_rotulos_ou_pilotos, aviso_entrada: !!data.questions.find(q => q.id === ref.id)?.avisos.length };
  }).filter(row => data.questions.some(q => q.id === row.id));
  const result = { at: now(), startedAt, durationSeconds: (Date.now() - Date.parse(startedAt)) / 1000, stopped, callsThisInvocation: calls,
    completed: rows.filter(row => row.decisao).length, pending: rows.filter(row => !row.decisao).map(row => row.id),
    referenceHash: reference.hash, referenceVersion: "analise-propria-v2", overall: metrics(rows, universe.questions.length), rows,
    caution: "Concordância com referência provisória, sem garantia de precisão jurídica de 95%. Compare qualidade nos mesmos IDs concluídos. Execuções concorrentes compartilham capacidade do servidor; tempos não medem desempenho isolado. O contrato de ferramenta inclui roteamento por ID nos lotes, e o teto de saída é escalado e limitado a 65536 tokens." };
  await atomicJson(`${directory}/report.json`, result); return result;
}
