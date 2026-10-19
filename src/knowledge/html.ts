import { load } from "cheerio";
import { cleanHtml } from "../data.js";
import { hash } from "../utils.js";
import type { Chunk, CorpusPlan, SourceCapture } from "./types.js";

// Explicit publisher URLs, recorded in every capture. No guessed URN→URL conversion.
export const officialHtml: Record<string, string> = {
  organizacoes: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12850.htm",
  armas: "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.826.htm",
  hediondos: "https://www.planalto.gov.br/ccivil_03/leis/l8072.htm",
  temporaria: "https://www.planalto.gov.br/ccivil_03/leis/l7960.htm",
  interceptacao: "https://www.planalto.gov.br/ccivil_03/leis/l9296.htm",
  genocidio: "https://www.planalto.gov.br/ccivil_03/leis/l2889.htm",
  tortura: "https://www.planalto.gov.br/ccivil_03/leis/l9455.htm",
  racismo: "https://www.planalto.gov.br/ccivil_03/leis/l7716.htm",
  idoso: "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm",
  esporte: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14597.htm",
  "discriminacao-trabalho": "https://www.planalto.gov.br/ccivil_03/leis/l9029.htm",
  software: "https://www.planalto.gov.br/ccivil_03/leis/l9609.htm",
  investigacao: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12830.htm",
  identificacao: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12037.htm",
  "protecao-testemunhas": "https://www.planalto.gov.br/ccivil_03/leis/l9807.htm",
  "saude-mental": "https://www.planalto.gov.br/ccivil_03/leis/leis_2001/l10216.htm",
  deficiencia: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm",
  transito: "https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm",
  licitacoes: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm",
  improbidade: "https://www.planalto.gov.br/ccivil_03/leis/l8429.htm",
  "marco-civil": "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm",
  "acesso-informacao": "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm",
  "drogas-historica": "https://www.planalto.gov.br/ccivil_03/leis/l6368.htm",
  "abuso-historico": "https://www.planalto.gov.br/ccivil_03/leis/l4898.htm",
  contravencoes: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3688.htm",
  cpm: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del1001.htm",
  cppm: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del1002.htm",
  cp: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm",
  cpp: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm",
  lep: "https://www.planalto.gov.br/ccivil_03/leis/l7210.htm",
  drogas: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11343.htm",
  "maria-penha": "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm",
  ambientais: "https://www.planalto.gov.br/ccivil_03/leis/l9605.htm",
  lavagem: "https://www.planalto.gov.br/ccivil_03/leis/l9613.htm",
  juizados: "https://www.planalto.gov.br/ccivil_03/leis/l9099.htm",
  eca: "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm",
  terrorismo: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13260.htm",
  "ordem-economica": "https://www.planalto.gov.br/ccivil_03/leis/l8137.htm",
};
export const camaraHtml: Record<string, string> = Object.fromEntries(Object.entries({
  organizacoes: "lei/2013/lei-12850-2-agosto-2013-776714-normaatualizada-pl.html",
  armas: "lei/2003/lei-10826-22-dezembro-2003-490580-normaatualizada-pl.html",
  temporaria: "lei/1989/lei-7960-21-dezembro-1989-365581-normaatualizada-pl.html",
  hediondos: "lei/1990/lei-8072-25-julho-1990-372192-normaatualizada-pl.html",
  interceptacao: "lei/1996/lei-9296-24-julho-1996-349049-normaatualizada-pl.html",
  genocidio: "lei/1950-1959/lei-2889-1-outubro-1956-355184-publicacaooriginal-1-pl.html",
  tortura: "lei/1997/lei-9455-7-abril-1997-349431-normaatualizada-pl.html",
  racismo: "lei/1989/lei-7716-5-janeiro-1989-356354-normaatualizada-pl.html",
  idoso: "lei/2003/lei-10741-1-outubro-2003-497511-normaatualizada-pl.html",
  "discriminacao-trabalho": "lei/1995/lei-9029-13-abril-1995-348798-normaatualizada-pl.html",
  software: "lei/1998/lei-9609-19-fevereiro-1998-364738-normaatualizada-pl.html",
  investigacao: "lei/2013/lei-12830-20-junho-2013-776286-normaatualizada-pl.html",
  identificacao: "lei/2009/lei-12037-1-outubro-2009-591435-normaatualizada-pl.html",
  "protecao-testemunhas": "lei/1999/lei-9807-13-julho-1999-378063-normaatualizada-pl.html",
  "saude-mental": "lei/2001/lei-10216-6-abril-2001-364458-normaatualizada-pl.html",
  deficiencia: "lei/2015/lei-13146-6-julho-2015-781174-normaatualizada-pl.html",
  transito: "lei/1997/lei-9503-23-setembro-1997-372348-normaatualizada-pl.html",
  improbidade: "lei/1992/lei-8429-2-junho-1992-357452-normaatualizada-pl.html",
  "marco-civil": "lei/2014/lei-12965-23-abril-2014-778630-normaatualizada-pl.html",
  "drogas-historica": "lei/1970-1979/lei-6368-21-outubro-1976-357249-publicacaooriginal-1-pl.html",
  "abuso-historico": "lei/1960-1969/lei-4898-9-dezembro-1965-368996-normaatualizada-pl.html",
  contravencoes: "declei/1940-1949/decreto-lei-3688-3-outubro-1941-413573-normaatualizada-pe.html",
  cpm: "declei/1960-1969/decreto-lei-1001-21-outubro-1969-376258-normaatualizada-pe.html",
  cppm: "declei/1960-1969/decreto-lei-1002-21-outubro-1969-376259-normaatualizada-pe.html",
  cp: "declei/1940-1949/decreto-lei-2848-7-dezembro-1940-412868-normaatualizada-pe.html",
  cpp: "declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html",
  lep: "lei/1980-1987/lei-7210-11-julho-1984-356938-normaatualizada-pl.html",
  drogas: "lei/2006/lei-11343-23-agosto-2006-545399-normaatualizada-pl.html",
  "maria-penha": "lei/2006/lei-11340-7-agosto-2006-545133-normaatualizada-pl.html",
  ambientais: "lei/1998/lei-9605-12-fevereiro-1998-365397-normaatualizada-pl.html",
  lavagem: "lei/1998/lei-9613-3-marco-1998-372359-normaatualizada-pl.html",
  juizados: "lei/1995/lei-9099-26-setembro-1995-348608-normaatualizada-pl.html",
  eca: "lei/1990/lei-8069-13-julho-1990-372211-normaatualizada-pl.html",
  terrorismo: "lei/2016/lei-13260-16-marco-2016-782561-publicacaooriginal-149752-pl.html",
  "ordem-economica": "lei/1990/lei-8137-27-dezembro-1990-367271-normaatualizada-pl.html",
}).map(([id, file]) => [id, `https://www2.camara.leg.br/legin/fed/${file}`]));
// Verified alternative publications where the Câmara HTML address is unavailable.
Object.assign(camaraHtml, {
  armas: "https://legis.senado.leg.br/norma/552702/publicacao/34620860",
  investigacao: "https://legis.senado.leg.br/norma/591278/publicacao/15636365",
  deficiencia: "https://legis.senado.leg.br/norma/584958/publicacao/34619049",
});
export function normalizeHtml(html: string, source: SourceCapture, plan: CorpusPlan): Chunk[] {
  if (!source.supplement?.url) throw new Error("HTML sem proveniência.");
  if (/<title[^>]*>[^<]*(seguran|challenge|just a moment)/i.test(html)) throw new Error("HTML de proteção não é legislação.");
  const $ = load(html);
  $("s,strike,del,[style*='line-through']").remove();
  // Mark publisher headings before flattening the DOM. A heading immediately
  // before the next article belongs to that article, not to its predecessor.
  $("p,h1,h2,h3,h4").each((_, node) => {
    const block = $(node), value = block.text().replace(/\s+/g, " ").trim();
    if (!value || /^(?:Art[.\s]|§|Parágrafo|Pena\b|[IVXLCDM]+\s*[-–])/i.test(value)) return;
    const bold = block.find("b,strong").text().replace(/\s+/g, " ").trim();
    const heading = /center/i.test(`${block.attr("align")} ${block.attr("style")}`)
      || /^h[1-4]$/i.test(node.tagName) || (bold.length > 2 && value.startsWith(bold) && (value.length - bold.length < 5 || /^\s*\(/.test(value.slice(bold.length))));
    if (heading) block.prepend("\n⟦H⟧").append("⟦/H⟧\n");
  });
  $("p,div,li,h1,h2,h3,h4,table").prepend("\n");
  const text = cleanHtml($.html());
  const expectedNumber = source.urn?.split(";")[1];
  if (!expectedNumber || !text.slice(0, 12000).replace(/[.\s]/g, "").includes(expectedNumber)) throw new Error("Número da norma não confirmado no cabeçalho HTML.");
  const matches = [...text.matchAll(/(?:^|\n)\s*Art[.\s]+(\d+|[lI]\d{2,})\s*[º°o]?(?:-([A-Z]))?\.?(?=\s|[-–])/g)];
  if (!matches.length) throw new Error("HTML sem artigos reconhecíveis.");
  const allowed = new Set(plan.questions.flatMap(q => q.articles[source.id] ?? []).map(a => a.replaceAll("-", "").toLowerCase()));
  const chunks: Chunk[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!, number = m[1]!.replace(/^[lI](?=\d)/, "1"), article = `${number}${m[2] ? `-${m[2]!.toLowerCase()}` : ""}`;
    if (!allowed.has("*") && !allowed.has(article.replaceAll("-", ""))) continue;
    const before = text.slice(i ? matches[i - 1]!.index! + matches[i - 1]![0].length : 0, m.index);
    const leading = before.match(/(?:\s*⟦H⟧(?:(?!⟦H⟧)[\s\S])*?⟦\/H⟧\s*)+$/)?.[0] ?? "";
    const headings = [...leading.matchAll(/⟦H⟧([\s\S]*?)⟦\/H⟧/g)].map(h => h[1]!.trim());
    const rubric = headings.at(-1)?.replace(/\s*\(.*$/, "").trim();
    const body = text.slice(m.index, matches[i + 1]?.index ?? text.length)
      .replace(/(?:\s*⟦H⟧(?:(?!⟦H⟧)[\s\S])*?⟦\/H⟧\s*)+$/, "")
      .replace(/⟦\/?H⟧/g, "").trim();
    for (let offset = 0; offset < body.length; offset += 5000) {
      const locator = `${source.urn}!art${article}${body.length > 5000 ? `#parte${offset / 5000 + 1}` : ""}`;
      const title = `${source.title} — Art. ${article}${rubric ? ` — ${rubric}` : ""}`;
      const text = body.slice(offset, offset + 5000);
      const metadata = { capturedAt: source.supplement.retrievedAt, articleLabelInSource: m[1], articleNumberNormalized: m[1] !== number, nature: source.supplement.url.includes("publicacaooriginal") ? "publicação original HTML; conferir alterações posteriores" : "texto compilado HTML; trechos riscados removidos", historicalCutoffUnverified: true, legalCutoff: plan.cutoff, validity: "captura versionada; não reconstrói automaticamente redação vigente em data passada" };
      const contentHash = hash(JSON.stringify({ locator, title, text, metadata, url: source.supplement.url }));
      chunks.push({ id: `S-${hash(source.id + contentHash).slice(0, 12)}`, sourceId: source.id, kind: "norma", locator, title, text, versionDate: null, url: source.supplement.url, metadata, contentHash });
    }
  }
  return chunks;
}
