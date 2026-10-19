import { cp, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { loadData, indexThemes } from "../../src/data.js";
import { VerdictSchema } from "../../src/types.js";
import { atomicJson, exists, hash, now, parseBatch, readJson, resolveRoot } from "../../src/utils.js";
import { checkInherited } from "./repair-plan.js";
import type { Checkpoint } from "../no-rag-v19/engine.js";
import { CONFIRMED_OUTSIDE_POLICY, decideConfirmedOutside, verifyConfirmedOutside } from "../../delivery/confirmed-outside.js";
import { finalize } from "../../delivery/finalize.js";
import { report } from "../paid-v17/report.js";

async function main() {
  const previous = resolveRoot("output/individual-v20/pro-judge-v20-359-repair-1");
  if (await exists(`${previous}/run.lock`)) throw new Error("Aguarde os modelos encerrarem a recuperação.");
  const suite = "pro-judge-v20-359-repair-1-final", root = resolveRoot("output/individual-v20", suite);
  if (await exists(root)) throw new Error("Derivação já existe; não sobrescreva um resultado histórico.");
  const parent = await readJson<any>(`${previous}/manifest.json`), data = await loadData(), themes = indexThemes(data.themes);
  const originalText = await readFile(`${previous}/checkpoint.json`, "utf8"), checkpoint = JSON.parse(originalText) as Checkpoint;
  const before = structuredClone(checkpoint);
  const rows = (await readFile(`${previous}/requests.jsonl`, "utf8")).trim().split("\n").map(l => JSON.parse(l));
  const promotions = [];
  for (const record of Object.values(checkpoint.records).filter(r => !r.decision)) {
    if (!record.proposal) throw new Error(`Proposta pendente: ${record.id}.`);
    const q = data.questions.find(q => q.id === record.id)!;
    const starts = rows.filter(r => r.phase === "start" && r.role === "judge" && r.ids.includes(record.id));
    for (const start of starts) {
      const response = rows.find(r => r.phase === "response" && r.requestId === start.requestId && r.status === 200);
      if (!response) continue;
      const raw = JSON.parse(response.body), content = (raw.candidates?.[0]?.content?.parts ?? []).filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("");
      const parsed = parseBatch(content, VerdictSchema, [record.id]);
      const verdict = parsed.valid[0];
      if (!verdict) continue;
      const decision = decideConfirmedOutside({ ...record, verdict }, q, themes, parent.config);
      if (!decision || decision.decisao !== "fora") continue;
      const sent = JSON.parse(start.body.contents[0].parts[0].text).questoes.find((item: any) => item.questao.id === record.id);
      if (JSON.stringify(sent.proposta) !== JSON.stringify(record.proposal)) throw new Error("Parecer recebido para outra proposta.");
      record.verdict = verdict; record.decision = decision;
      promotions.push({ id: record.id, requestId: start.requestId, stageAttempt: starts.indexOf(start) + 1,
        selection: "Primeiro parecer elegível em ordem de recebimento; chamadas posteriores permanecem no histórico.", responseHash: hash(response.body), proposalHash: hash(JSON.stringify(record.proposal)),
        previousFailure: record.errors, rule: CONFIRMED_OUTSIDE_POLICY, inferenceCalls: 0 });
      break;
    }
    if (!record.decision) throw new Error(`Sem resposta que permita resolver ${record.id} pela política documentada.`);
  }
  const original = await readJson<Checkpoint>(`${parent.parent}/checkpoint.json`);
  checkInherited(original, checkpoint.records);
  // Existing successful records in the recovery also remain byte-identical.
  for (const r of Object.values(before.records).filter(r => r.decision)) if (JSON.stringify(r) !== JSON.stringify(checkpoint.records[r.id])) throw new Error("Decisão recuperada alterada.");
  const policySources: Record<string, string> = {};
  for (const file of ["delivery/confirmed-outside.ts", "delivery/finalize.ts", "experiments/individual-v20/finish-recovery.ts"]) policySources[file] = hash(await readFile(resolveRoot(file), "utf8"));
  const fingerprint = hash(JSON.stringify({ parentFingerprint: parent.fingerprint, checkpointHash: hash(originalText), policy: CONFIRMED_OUTSIDE_POLICY, policySources, promotions }));
  checkpoint.fingerprint = fingerprint;
  verifyConfirmedOutside(checkpoint, fingerprint, data, parent.config);
  await mkdir(root, { recursive: true });
  for (const file of ["requests.jsonl", "events.jsonl", "prompts.json", "recovery-context.json"]) await cp(`${previous}/${file}`, `${root}/${file}`);
  await atomicJson(`${root}/manifest.json`, { ...parent, suite, fingerprint, decisionPolicy: CONFIRMED_OUTSIDE_POLICY, inferenceParent: previous,
    inferenceParentFingerprint: parent.fingerprint, inferenceParentCheckpointHash: hash(originalText), policySources, createdAt: now(), newInferenceCalls: 0 });
  await atomicJson(`${root}/decision-policy.json`, { at: now(), policy: CONFIRMED_OUTSIDE_POLICY, promotions, originalRecoveryPreserved: previous,
    explanation: "A dúvida de escopo do classificador pode ser resolvida por parecer que sustente as três rubricas e fora, sem alertas, alternativa ou problemas de entrada. Publicações mantêm a regra original." });
  await atomicJson(`${root}/checkpoint.json`, checkpoint); await atomicJson(`${root}/records.json`, checkpoint.records);
  const result = await report(root, data, checkpoint.records, null, 0, now());
  await atomicJson(`${root}/report.json`, { ...result, offlineDecisionPolicy: CONFIRMED_OUTSIDE_POLICY, inferenceParent: previous, newInferenceCalls: 0 });
  const delivery = await finalize(suite, suite, { version: 20, decisionPolicy: CONFIRMED_OUTSIDE_POLICY });
  await cp(`${root}/decision-policy.json`, `${delivery.directory}/decision-policy.json`);
  const csv = await readFile(delivery.rootCsv, "utf8"), current = resolveRoot("publicacao.csv"), previousCsv = await readFile(current, "utf8");
  const backup = resolveRoot(`output/delivery/root-history/${hash(previousCsv)}.csv`);
  await mkdir(resolveRoot("output/delivery/root-history"), { recursive: true });
  if (!await exists(backup)) await writeFile(backup, previousCsv);
  if (await readFile(backup, "utf8") !== previousCsv) throw new Error("Backup do CSV anterior inválido.");
  await writeFile(`${current}.repair.tmp`, csv); await rename(`${current}.repair.tmp`, current);
  await atomicJson(resolveRoot("output/delivery/current.json"), { at: now(), source: delivery.directory, csvHash: hash(csv), previousHash: hash(previousCsv), previousCsvBackup: backup });
  return { delivery, rootCsvUpdated: current, promotions, previousCsvBackup: backup };
}
main().then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
