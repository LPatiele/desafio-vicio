import { readFile, writeFile, appendFile } from "node:fs/promises";
import { parse } from "dotenv";
import { loadData } from "../src/data.js";
import { loadExperiment, loadReference } from "../src/evaluation.js";
import { atomicJson, exists, hash, now, resolveRoot } from "../src/utils.js";

const dir = resolveRoot("output/migrations/direct-api-v1");
const before = JSON.parse(await readFile(`${dir}/before/hashes.json`, "utf8")) as Record<string, string>;
const protectedSources = new Set(["src/validation.ts", "src/retrieval/decision.ts", "src/data.ts", "src/graph.ts", "src/knowledge/database.ts", "src/knowledge/store.ts"]);
const protectedFiles = Object.keys(before).filter(file => file.startsWith("src/agents/") || file.startsWith("config/") || protectedSources.has(file));
const changedProtected = [];
for (const file of protectedFiles) if (hash(await readFile(resolveRoot(file), "utf8")) !== before[file]) changedProtected.push(file);
const data = await loadData(), reference = await loadReference(data, "analise-propria-v2");
const historical = [];
for (const name of ["local-penal50-v9-control", "local-penal50-v9-classifier-tools"]) {
  const experiment = await loadExperiment(name, data);
  historical.push({ name, records: Object.keys(experiment.records).length, decisions: Object.values(experiment.records).filter(record => record.decision).length, databaseHash: experiment.manifest.knowledgeIdentity?.databaseHash });
}
const env = parse(await readFile(resolveRoot(".env"), "utf8"));
const credentials = { geminiPresent: Boolean((env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim()), openaiPresent: Boolean(env.OPENAI_API_KEY?.trim()) };
const tests = await readFile(`${dir}/tests.log`, "utf8"), typecheck = await readFile(`${dir}/typecheck.log`, "utf8");
const realAttempts = [];
for (const name of ["pagos-v10-gemini-openai", "pagos-v10-juiz-isolado"]) {
  const root = resolveRoot("output/experiments", name);
  if (!await exists(`${root}/last-run.json`)) continue;
  const summary = JSON.parse(await readFile(`${root}/last-run.json`, "utf8"));
  const requests = (await readFile(`${root}/requests.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const errors = requests.filter(row => row.phase === "response" && row.status >= 400).map(row => ({ status: row.status, error: JSON.parse(row.body).error }));
  realAttempts.push({ name, summary, errors });
}
const blockedByBilling = realAttempts.some(attempt => attempt.errors.some(row => row.error?.code === "credit_balance_exhausted" || /free_tier/.test(JSON.stringify(row.error?.details ?? []))));
const validation = { at: now(), protectedFiles: protectedFiles.length, changedProtected, preserved: changedProtected.length === 0, referenceHash: reference.hash, historicalCheckpointsValidated: historical, credentials, tests: { passed: Number(tests.match(/pass (\d+)/)?.[1]), failed: Number(tests.match(/fail (\d+)/)?.[1]), logHash: hash(tests) }, typecheck: { noDiagnostics: !typecheck.trim(), logHash: hash(typecheck) }, realInferenceStatus: blockedByBilling ? "bloqueada_por_faturamento_google_e_saldo_openai" : credentials.geminiPresent && credentials.openaiPresent ? "credenciais_presentes; verificar preflight e orçamento antes da inferência" : "bloqueada_por_credenciais_ausentes_no_env_salvo", realAttempts, secretsCopiedToBackup: false };
if (!validation.preserved || validation.tests.failed !== 0 || !validation.typecheck.noDiagnostics) throw new Error("Validação da migração falhou; consulte logs e arquivos protegidos.");
await atomicJson(`${dir}/validacao.json`, validation);
await writeFile(`${dir}/relatorio.md`, `# Migração para APIs diretas\n\nImplementado o transporte Google Gemini e OpenAI Responses, com classificador Gemini 3.1 Pro Preview e juiz GPT-5.2 com snapshot fixado. A configuração nova é config/individual-v10-gemini-openai.json.\n\nValidação: ${validation.tests.passed} testes aprovados, nenhum teste falhou; TypeScript sem diagnósticos. O teste de integração usa SQLite real e respostas simuladas das APIs: consulta, proposta, recuperação automática do juiz, parecer e decisão foram concluídos, inclusive após interrupção e retomada. Isso não demonstra execução dos modelos reais.\n\nPreservação: ${protectedFiles.length} arquivos protegidos continuam com os hashes anteriores, incluindo prompts, configurações antigas, preparação, grafo, busca e motor de decisão. Os dois experimentos v9 foram carregados e validados sem reescrever seus registros. A cópia anterior está em before/, sem .env.\n\nNovos controles: orçamento em dólares e chamadas persistentes por experimento, reservas conservadoras para consumo desconhecido, limites de chamadas e tokens por API, até cinco tentativas por etapa e continuidade nativa em checkpoints v2.\n\nEstado da validação real: ${validation.realInferenceStatus}. GEMINI_API_KEY/GOOGLE_API_KEY presente no arquivo salvo: ${credentials.geminiPresent}; OPENAI_API_KEY presente: ${credentials.openaiPresent}. Somente presença foi registrada, sem valores.\n\nA simulação pelos tokens históricos estima aproximadamente US$ 4,23 para dez questões e US$ 19,85 para cinquenta; os novos modelos podem consumir quantidades diferentes. O teto inicial da configuração é US$ 10, ajustável por --budget-usd. A execução real depende das credenciais e do orçamento definido.\n\nResultados de qualidade e conferência jurídica das citações só poderão ser produzidos a partir dos pareceres dos modelos reais; não há alegação de ganho de precisão com base nos testes simulados.\n`);
if (realAttempts.length) await appendFile(`${dir}/relatorio.md`, `\n## Tentativas reais\n\n${realAttempts.map(attempt => `- ${attempt.name}: ${attempt.summary.calls} envios nesta invocação, ${attempt.summary.completed} questões concluídas; ${attempt.summary.stopped}`).join("\n")}\n\n[Diagnóstico dos bloqueios, correção e próxima execução](teste-real.md).\n`);
console.log(JSON.stringify(validation, null, 2));
