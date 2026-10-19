import type { Config, Decision, Proposal, Question, Theme, Verdict } from "./types.js";

export function validateProposal(p: Proposal, q: Question, themes: Map<string, Theme>): string[] {
  const errors: string[] = [];
  const active = (id: string) => themes.get(id)?.status === "active";
  if (p.id !== q.id) errors.push("Questão não corresponde à proposta.");
  if (p.fora !== (p.tema_central_id === null)) errors.push("fora e tema_central_id incompatíveis.");
  if (p.tema_central_id !== null && !active(p.tema_central_id)) errors.push("Tema central inexistente ou inativo.");
  for (const field of ["extras_ids", "concorrentes_ids"] as const) {
    if (new Set(p[field]).size !== p[field].length) errors.push(`${field} duplicados.`);
    if (p[field].some(id => !active(id) || id === p.tema_central_id)) errors.push(`${field} inválidos.`);
  }
  if (p.fora && p.extras_ids.length) errors.push("fora não pode conter extras.");
  if (!p.concorrentes_ids.length) errors.push("Informar ao menos um concorrente ou ramo próximo descartado.");
  for (const e of p.evidencias) {
    const source = e.campo === "enunciado" ? q.enunciado : e.campo === "comando" ? q.comando
      : e.campo.startsWith("alternativa:") ? q.alternativas[e.campo.slice(12)] : undefined;
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    if (!source || !normalize(source).includes(normalize(e.trecho))) errors.push(`Evidência não localizada em ${e.campo}.`);
  }
  return errors;
}
export function validateVerdict(v: Verdict, p: Proposal, themes: Map<string, Theme>): string[] {
  const errors: string[] = [];
  if (v.id !== p.id) errors.push("Parecer de outra questão.");
  if (v.tema_alternativo_id !== null && themes.get(v.tema_alternativo_id)?.status !== "active") errors.push("Tema alternativo inválido.");
  if (new Set(v.extras_sustentados_ids).size !== v.extras_sustentados_ids.length || v.extras_sustentados_ids.some(id => !p.extras_ids.includes(id))) errors.push("Extra sustentado não proposto ou duplicado.");
  if (!p.fora && v.fora_sustentado) errors.push("Parecer contraditório: fora sustentado para proposta dentro da árvore.");
  if (v.fora_sustentado && v.tema_alternativo_id !== null) errors.push("fora sustentado com tema alternativo.");
  return errors;
}
export function decide(p: Proposal, v: Verdict, q: Question, themes: Map<string, Theme>, config: Pick<Config, "allowRootPublication">): Decision | null {
  if (validateProposal(p, q, themes).length || validateVerdict(v, p, themes).length) return null;
  const reasons: string[] = [];
  for (const field of ["tema_central", "evidencia_textual", "distincao_de_concorrentes"] as const) {
    if (v[field].avaliacao !== "sustentado") reasons.push(`${field}: ${v[field].avaliacao} — ${v[field].justificativa}`);
  }
  reasons.push(...q.avisos, ...p.incertezas, ...v.alertas);
  if (!config.allowRootPublication && p.tema_central_id && themes.get(p.tema_central_id)?.nivel === 0) reasons.push("Tema raiz requer revisão de especificidade.");
  if (v.tema_alternativo_id && v.tema_alternativo_id !== p.tema_central_id) reasons.push(`Juiz sugere ${v.tema_alternativo_id}.`);
  if (p.extras_ids.some(id => !v.extras_sustentados_ids.includes(id))) reasons.push("Extras sem sustentação do juiz.");
  if (p.fora && !v.fora_sustentado) reasons.push("Ausência de enquadramento não confirmada.");
  const acceptedOutside = p.fora && !reasons.length && v.fora_sustentado;
  // Review requires a valid suggested theme. An unresolved outside proposal stays pending.
  const theme = acceptedOutside ? null : p.tema_central_id ?? v.tema_alternativo_id;
  if (!acceptedOutside && !theme) return null;
  return {
    id: p.id, decisao: acceptedOutside ? "fora" : reasons.length ? "revisar" : "publicar",
    tema_central_id: theme, extras_ids: acceptedOutside ? [] : v.extras_sustentados_ids,
    confianca_declarada: p.confianca_declarada,
    motivo: (acceptedOutside ? p.justificativa : reasons.join("; ")).slice(0, 1500),
  };
}
