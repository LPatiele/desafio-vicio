// Local packaging only. Does not read credentials or make inference requests.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadData } from "../src/data.js";
import { loadReference } from "../src/evaluation.js";
import { atomicJson, hash, readJson, resolveRoot } from "../src/utils.js";
import { bundle, saveBundle, reproduce } from "../reproduction/bundle.js";

const source = resolveRoot("output/individual-v20/pro-judge-v20-359-repair-1-final");
const manifest = await readJson<any>(`${source}/manifest.json`), data = await loadData(), ref = await loadReference(data, "analise-propria-v2");
const text = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const config = structuredClone(manifest.config); config.direct.quotaScope = "reproducao-offline";
const policy = await readJson<any>(`${source}/decision-policy.json`);
policy.originalRecoveryPreserved = "output/individual-v20/pro-judge-v20-359-repair-1";
const csv = await readFile(`${source}/publicacao.csv`, "utf8");
const offline = bundle("offline-delivery-v1", { "prepared.json": text(data), "checkpoint.json": await readFile(`${source}/checkpoint.json`, "utf8"),
  "config.json": text(config), "reference.json": text(ref.items), "prompts.json": await readFile(`${source}/prompts.json`, "utf8"),
  "decision-policy.json": text(policy), "publicacao.csv": csv },
  { sourceSuite: manifest.suite, fingerprint: manifest.fingerprint, decisionPolicy: manifest.decisionPolicy, referenceVersion: "analise-propria-v2", referenceHash: ref.hash,
    expectedCsvSha256: hash(csv), sanitized: true, validationScope: "Revalida dados empacotados, propostas, pareceres, decisões e CSV. Auditoria de requisições privadas consta da entrega original; este pacote não contém logs de rede." });
reproduce(offline);

const base = resolveRoot("output/no-rag-v19/model-only-v19-359"), old = await readJson<any>(`${base}/manifest.json`);
const baseConfig = structuredClone(old.config); baseConfig.direct.quotaScope = "vertex-projeto-exemplo-global"; baseConfig.batchSize = 1;
const vertex = { project: "projeto-exemplo", location: "global", apiVersion: "v1", classifierModel: old.config.classifierModel, judgeModel: old.config.judgeModel,
  creditName: null, creditEligibilityVerified: false,
  pricing: Object.fromEntries(["classifier", "judge"].map(role => [role, { inputUsdPerMillion: baseConfig.direct[role].inputUsdPerMillion,
    cachedInputUsdPerMillion: baseConfig.direct[role].cachedInputUsdPerMillion, outputUsdPerMillion: baseConfig.direct[role].outputUsdPerMillion,
    source: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing", verifiedAt: "2026-10-19T00:00:00.000Z" }])) };
const template = { config: baseConfig, vertex, classifierModel: old.classifierModel, inputHashes: old.inputHashes, promptHashes: old.promptHashes,
  description: "Projeção pública para inicializar uma execução v20 nova; não é o manifesto privado nem o resultado integral da v19." };
const requests = (await readFile(`${base}/requests.jsonl`, "utf8")).trim().split("\n").map(l => JSON.parse(l)).filter(r => r.phase === "start").map(r => ({ phase: "start", role: r.role, body: r.body }));
const events = (await readFile(`${base}/events.jsonl`, "utf8")).trim().split("\n").map(l => JSON.parse(l)).filter(r => r.type === "usage").map(r => ({ type: "usage", data: { role: r.data.role, usage: r.data.usage } }));
const baseline = bundle("vertex-baseline-template-v1", { "template.json": text(template), "prompts.json": await readFile(`${base}/prompts.json`, "utf8"),
  "records.json": await readFile(`${base}/records.json`, "utf8"), "requests.jsonl": requests.map(r => JSON.stringify(r)).join("\n") + "\n", "events.jsonl": events.map(r => JSON.stringify(r)).join("\n") + "\n" },
  { purpose: "Configuração, prompts e projeções estatísticas usadas pelo estimador offline da v20. Propostas anteriores não são copiadas para as novas classificações.", sanitized: true });

// Exclude specific account/project/credit IDs and local absolute paths from public copies.
const privateValues = [old.vertex.project, manifest.vertex.project, old.vertex.creditName, manifest.vertex.creditName, old.vertex.billingAccountDisplayName, manifest.vertex.billingAccountDisplayName].filter(Boolean);
for (const candidate of [offline, baseline]) {
  const body = JSON.stringify(candidate);
  if (privateValues.some(value => body.includes(value)) || /sk-or-v1-|AIza[0-9A-Za-z_-]{20}|\/Users\//.test(body)) throw new Error("Identificador privado detectado no pacote público.");
}
await saveBundle(resolveRoot("reproducao/v20-entrega.json.gz"), offline);
await saveBundle(resolveRoot("reproducao/vertex-baseline.json.gz"), baseline);
const publicPrompts = JSON.parse(offline.files["prompts.json"]!);
await mkdir(resolveRoot("reproducao/prompts"), { recursive: true });
await writeFile(resolveRoot("reproducao/prompts/classificador.v3.md"), publicPrompts.classifier);
await writeFile(resolveRoot("reproducao/prompts/juiz.v3.md"), publicPrompts.judge);
await writeFile(resolveRoot("reproducao/publicacao-v19.csv"), await readFile(resolveRoot("output/delivery/model-only-v19-359/publicacao.csv"), "utf8"));
await atomicJson(resolveRoot("reproducao/manifesto.json"), { version: 1, date: "2026-10-19", files: Object.fromEntries(await Promise.all(["v20-entrega.json.gz", "vertex-baseline.json.gz"].map(async f => [f, createHash("sha256").update(await readFile(resolveRoot("reproducao", f))).digest("hex")]))),
  csvSha256: hash(csv), sourceSuite: manifest.suite, referenceVersion: "analise-propria-v2", privateNetworkLogsIncluded: false });
console.log(JSON.stringify({ packaged: ["reproducao/v20-entrega.json.gz", "reproducao/vertex-baseline.json.gz"], rows: 359, csvSha256: hash(csv) }));
