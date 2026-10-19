// Build documentary scope from the challenge inputs, never from evaluation labels.
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { loadData } from "../src/data.js";
import { atomicJson, exists, hash, resolveRoot } from "../src/utils.js";
import { PlanSchema, type CorpusPlan, type SourcePlan, type SourceCapture } from "../src/knowledge/types.js";

const data = await loadData();
const oldDir = resolveRoot("output/knowledge/snapshots/penal50-v3");
const old: CorpusPlan = JSON.parse(await readFile(`${oldDir}/plan.json`, "utf8"));
const manifest = JSON.parse(await readFile(`${oldDir}/manifest.json`, "utf8"));
const additions: [string, string, string, string][] = [
  ["organizacoes", "Organizações criminosas — Lei 12.850/2013", "2013-08-02", "12850"],
  ["armas", "Estatuto do Desarmamento", "2003-12-22", "10826"],
  ["hediondos", "Crimes hediondos", "1990-07-25", "8072"],
  ["temporaria", "Prisão temporária", "1989-12-21", "7960"],
  ["interceptacao", "Interceptação de comunicações", "1996-07-24", "9296"],
  ["genocidio", "Genocídio", "1956-10-01", "2889"],
  ["tortura", "Crimes de tortura", "1997-04-07", "9455"],
  ["racismo", "Crimes de racismo", "1989-01-05", "7716"],
  ["idoso", "Estatuto da Pessoa Idosa", "2003-10-01", "10741"],
  ["esporte", "Lei Geral do Esporte", "2023-06-14", "14597"],
  ["discriminacao-trabalho", "Práticas discriminatórias no trabalho", "1995-04-13", "9029"],
  ["software", "Proteção de programas de computador", "1998-02-19", "9609"],
  ["investigacao", "Investigação criminal pelo delegado de polícia", "2013-06-20", "12830"],
  ["identificacao", "Identificação criminal", "2009-10-01", "12037"],
  ["protecao-testemunhas", "Proteção de vítimas e testemunhas", "1999-07-13", "9807"],
  ["saude-mental", "Proteção das pessoas com transtornos mentais", "2001-04-06", "10216"],
  ["deficiencia", "Estatuto da Pessoa com Deficiência", "2015-07-06", "13146"],
  ["transito", "Código de Trânsito Brasileiro", "1997-09-23", "9503"],
  ["licitacoes", "Lei de Licitações e Contratos Administrativos", "2021-04-01", "14133"],
  ["improbidade", "Improbidade administrativa", "1992-06-02", "8429"],
  ["marco-civil", "Marco Civil da Internet", "2014-04-23", "12965"],
  ["acesso-informacao", "Lei de Acesso à Informação", "2011-11-18", "12527"],
  ["drogas-historica", "Lei 6.368/1976 — histórica, revogada", "1976-10-21", "6368"],
  ["abuso-historico", "Lei 4.898/1965 — histórica, revogada", "1965-12-09", "4898"],
];
const sources: SourcePlan[] = [...old.sources, ...additions.map(([id, title, date, number]) => ({ id: id!, kind: "norma" as const, title: title!, urn: `urn:lex:br:federal:lei:${date};${number}` })),
  { id: "contravencoes", kind: "norma", title: "Lei das Contravenções Penais", urn: "urn:lex:br:federal:decreto.lei:1941-10-03;3688" },
  { id: "cpm", kind: "norma", title: "Código Penal Militar", urn: "urn:lex:br:federal:decreto.lei:1969-10-21;1001" },
  { id: "cppm", kind: "norma", title: "Código de Processo Penal Militar", urn: "urn:lex:br:federal:decreto.lei:1969-10-21;1002" },
  { id: "criminologia-ufba", kind: "doutrina", title: "Criminologia — Thais Bandeira e Daniela Portugal, UFBA, 2017", url: "https://repositorio.ufba.br/bitstream/ri/24396/4/Livro_Criminologia.pdf", license: "CC BY-NC-SA 4.0; atribuição: Thais Bandeira, Daniela Portugal, UFBA/SEAD, 2017; excertos mantidos sob a mesma licença" },
];
const normNumbers = sources.filter(s => s.urn).map(s => [s, s.urn!.split(";")[1]!] as const);
const hints: [RegExp, string[]][] = [
  [/organiza[cç][aã]o criminosa|organiza[cç][oõ]es criminosas|colabora[cç][aã]o premiada/i, ["organizacoes"]],
  [/arma[s]? de fogo|desarmamento/i, ["armas"]], [/hediond/i, ["hediondos"]],
  [/pris[aã]o tempor[aá]ria/i, ["temporaria"]], [/intercepta[cç]/i, ["interceptacao"]],
  [/genoc[ií]dio/i, ["genocidio"]], [/tortura|confessar.*cabe[cç]a/i, ["tortura"]],
  [/racis|ofensas raciais|inj[uú]ria racial/i, ["racismo"]], [/idos[oa]|sexagen[aá]ri/i, ["idoso"]],
  [/esport|futebol|partida.*[aá]rbitro/i, ["esporte"]], [/gravidez.*trabalho|teste.*gravidez/i, ["discriminacao-trabalho"]],
  [/programa de computador|software/i, ["software"]], [/investiga[cç][aã]o.*delegado/i, ["investigacao"]],
  [/identifica[cç][aã]o criminal|perfil gen[eé]tico/i, ["identificacao"]], [/prote[cç][aã]o.*testemunh/i, ["protecao-testemunhas"]],
  [/transtorno mental|manicomial/i, ["saude-mental", "deficiencia"]], [/ve[ií]culo automotor|c[oó]digo de tr[aâ]nsito/i, ["transito"]],
  [/licita[cç]/i, ["licitacoes"]], [/improbidade/i, ["improbidade"]], [/marco civil/i, ["marco-civil"]],
  [/acesso [aà] informa[cç][aã]o/i, ["acesso-informacao"]], [/contraven[cç]|pris[aã]o simples/i, ["contravencoes"]],
  [/justi[cç]a militar|garantia da lei e da ordem|penal militar/i, ["cpm", "cppm"]],
  [/execu[cç][aã]o penal|remi[cç][aã]o|apenad|regime disciplinar|falta grave|egresso/i, ["lep"]],
  [/drogas|entorpecente|tr[aá]fico il[ií]cito/i, ["drogas"]], [/maria da penha|viol[eê]ncia dom[eé]stica/i, ["maria-penha"]],
  [/ambiental|ambiente|fauna|flora/i, ["ambientais"]], [/lavagem|oculta[cç][aã]o de bens/i, ["lavagem"]],
  [/juizado|transa[cç][aã]o penal|menor potencial ofensivo|suspens[aã]o condicional do processo/i, ["juizados"]],
  [/crian[cç]a|adolescente|ato infracional/i, ["eca"]], [/abuso de autoridade/i, ["abuso"]],
  [/terrorismo|terrorista/i, ["terrorismo"]], [/ordem tribut[aá]ria|rela[cç][oõ]es de consumo|cartel/i, ["ordem-economica"]],
];
const questions = data.questions.map(q => {
  const text = [q.enunciado, q.comando, ...Object.values(q.alternativas)].join(" ");
  const theoretical = /criminolog|baratta|foucault|lombroso|labell?ing|etiquetamento|anomia|escola de chicago|vera regina|liszt|garantismo|jakobs|roxin|welzel|ofend[ií]culo/i.test(text);
  const selected = new Set<string>(["cp", "cpp", "cf"]);
  if (theoretical) selected.add("criminologia-ufba");
  const compact = text.replace(/[.\s]/g, "");
  for (const [s, number] of normNumbers) if (new RegExp(`(?:Lei|lei|Decreto-Lei)(?:n[º°o]?|número)?${number}(?:/|de)`).test(compact)) selected.add(s.id);
  for (const [pattern, ids] of hints) if (pattern.test(text)) ids.forEach(id => selected.add(id));
  const prior = old.questions.find(old => old.id === q.id);
  for (const id of prior?.sources ?? []) if (id.startsWith("bnp-")) selected.add(id);
  return { id: q.id, topics: q.enunciado.replace(/\s+/g, " ").slice(0, 180), sources: [...selected].sort(), articles: Object.fromEntries([...selected].filter(id => sources.find(s => s.id === id)?.kind === "norma").map(id => [id, ["*"]])), gaps: [] };
});
const plan = PlanSchema.parse({ version: 1, id: "desafio359-v4", cutoff: "2026-10-16", selection: { experiment: "anexos-completos-sem-rotulos-de-avaliacao", recordsHash: data.inputHashes.questions, inputHashes: data.inputHashes }, sources, questions });
const file = resolveRoot("knowledge/plans/desafio359-v4.json");
if (await exists(file)) throw new Error("Plano já existe; não sobrescrever curadoria congelada.");
await atomicJson(file, plan);
const staging = resolveRoot("output/knowledge/staging", plan.id);
await mkdir(staging, { recursive: true });
await atomicJson(`${staging}/plan.json`, plan);
for (const capture of manifest.captures as SourceCapture[]) {
  await atomicJson(`${staging}/${capture.id}.json`, capture);
  if (capture.rawFile) await copyFile(`${oldDir}/raw/${capture.rawFile}`, `${staging}/${capture.rawFile}`);
  if (capture.supplement?.rawFile && !capture.supplement.error) await copyFile(`${oldDir}/raw/${capture.supplement.rawFile}`, `${staging}/${capture.supplement.rawFile}`);
}
await atomicJson(resolveRoot("output/knowledge/base359-preservacao.json"), { priorSnapshot: oldDir, files: Object.fromEntries(await Promise.all(["manifest.json", "corpus.sqlite", "chunks.jsonl", "plan.json"].map(async f => [f, hash(await readFile(`${oldDir}/${f}`))]))), priorScope: old.questions.length });
console.log(JSON.stringify({ file, questions: questions.length, sources: sources.length, reusedCaptures: manifest.captures.length, theoreticalQuestions: questions.filter(q => q.sources.includes("criminologia-ufba")).length }));
