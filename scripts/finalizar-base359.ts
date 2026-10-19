import { readFile, mkdir, copyFile } from "node:fs/promises";
import { PlanSchema } from "../src/knowledge/types.js";
import { atomicJson, exists, resolveRoot } from "../src/utils.js";
const previous = resolveRoot("output/knowledge/staging/desafio359-v4");
const draft = JSON.parse(await readFile(`${previous}/plan.json`, "utf8"));
const originals = (await readFile(resolveRoot("anexos/questoes.jsonl"), "utf8")).trim().split("\n").map(s => JSON.parse(s));
draft.id = "desafio359-v5";
draft.sources = draft.sources.filter((s: any) => s.id !== "criminologia-ufba");
draft.sources.push(
  { id: "cnj-427", kind: "norma", title: "Resolução CNJ 427/2021 — proteção de vítimas e testemunhas", urn: "urn:lex:br:conselho.nacional.justica:resolucao:2021-10-20;427", url: "https://atos.cnj.jus.br/atos/detalhar/4190" },
  { id: "cnj-467", kind: "norma", title: "Resolução CNJ 467/2022 — porte de armas da Polícia Judicial", urn: "urn:lex:br:conselho.nacional.justica:resolucao:2022-06-28;467", url: "https://atos.cnj.jus.br/atos/detalhar/4650" },
);
for (const q of draft.questions) {
  const theory = q.sources.includes("criminologia-ufba") || originals.find((o: any) => o.id === q.id)?.disciplina_origem === "Criminologia";
  q.sources = q.sources.filter((s: string) => s !== "criminologia-ufba");
  if (theory) q.gaps.push("Material doutrinário ainda não incorporado: aguarda os livros indicados pela usuária; associação preliminar, conferir capítulos após a importação.");
  if (q.id === "Q0051") { q.sources.push("identificacao"); q.articles.identificacao = ["*"]; }
  if (q.id === "Q0132") { q.sources.push("cnj-427"); q.articles["cnj-427"] = ["*"]; }
  if (q.id === "Q0178") { q.sources.push("cnj-467"); q.articles["cnj-467"] = ["*"]; }
  if (q.id === "Q0142") q.gaps.push("Isenções estaduais do ITCD: CF delimita a matéria, mas a Lei paraense 5.529/1989 ainda não foi incorporada; não afirmar cobertura integral da regra de isenção.");
  q.sources = [...new Set(q.sources)].sort();
}
const plan = PlanSchema.parse(draft), dir = resolveRoot("output/knowledge/staging", plan.id);
if (await exists(dir)) throw new Error("Plano final já existe; preservar versão.");
await mkdir(dir, { recursive: true });
await atomicJson(resolveRoot("knowledge/plans", `${plan.id}.json`), plan); await atomicJson(`${dir}/plan.json`, plan);
for (const source of plan.sources) {
  const file = `${previous}/${source.id}.json`; if (!await exists(file)) continue;
  const capture = JSON.parse(await readFile(file, "utf8"));
  await atomicJson(`${dir}/${source.id}.json`, capture);
  if (capture.rawFile && await exists(`${previous}/${capture.rawFile}`)) await copyFile(`${previous}/${capture.rawFile}`, `${dir}/${capture.rawFile}`);
  if (capture.supplement?.rawFile && await exists(`${previous}/${capture.supplement.rawFile}`)) await copyFile(`${previous}/${capture.supplement.rawFile}`, `${dir}/${capture.supplement.rawFile}`);
}
console.log(JSON.stringify({ id: plan.id, questions: plan.questions.length, sources: plan.sources.length, declaredGaps: plan.questions.filter(q => q.gaps.length).length }));
