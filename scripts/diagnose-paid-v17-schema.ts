import "dotenv/config";
import { z } from "zod";
import { getConfig } from "../src/config.js";
import { ProposalSchema } from "../src/types.js";
import { Logger } from "../src/logger.js";
import { atomicJson, now, resolveRoot } from "../src/utils.js";
import { SuiteBudget, ReactiveClient } from "../experiments/paid-v17/client.js";

const config = await getConfig(resolveRoot("config/individual-v16-projeto3.json"));
config.direct!.classifier.maxOutputTokens = 1024;
config.direct!.classifier.reasoningEffort = "low";
const root = resolveRoot("output/paid-v17/paid-v17-359");
const logger = new Logger(`${root}/diagnostics/schema`);
const client = new ReactiveClient(config, logger, new SuiteBudget(`${root}/spend.json`, 30), `${root}/cooldowns`, {});
const results = [];
for (const bounded of [true, false]) {
  const schema = z.object({ resultados: bounded ? z.array(ProposalSchema).min(1).max(30) : z.array(ProposalSchema).min(1) }).strict();
  try {
    const result = await client.turn("classifier", [{ role: "user", content: "Teste sintético de compatibilidade de esquema, sem questões reais. Gere apenas um registro fictício com id Q0000, fora true e tema_central_id null. Demais campos conforme contrato. Não há classificação real ou consulta jurídica nesta chamada." }], schema, [], async requestId => { await logger.event("synthetic_schema_probe", { requestId, bounded, realQuestionAttemptsConsumed: 0 }); });
    results.push({ bounded, result: result.kind });
  } catch (error) { results.push({ bounded, error: (error as Error).message }); }
}
await atomicJson(`${root}/diagnostics/schema/summary.json`, { at: now(), results, budget: await client.budget.summary() });
console.log(JSON.stringify(results));
