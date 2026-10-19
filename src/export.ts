import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { Prepared } from "./types.js";
import { loadExperiment, loadReference, type Calibration } from "./evaluation.js";
import { atomicJson, csvCell, hash, now, readJson, resolveRoot } from "./utils.js";

const ForecastSchema = z.object({
  precision: z.number().min(0).max(1), precisionLow: z.number().min(0).max(1), precisionHigh: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1), coverageLow: z.number().min(0).max(1), coverageHigh: z.number().min(0).max(1),
  explanation: z.string().min(40),
}).strict();
export async function exportDelivery(name: string, data: Prepared, confidence: string, forecastFile?: string) {
  if (!["calibrated", "declared"].includes(confidence)) throw new Error("confidence: calibrated ou declared.");
  const experiment = await loadExperiment(name, data);
  const pending = data.questions.filter(q => !experiment.records[q.id]?.decision).map(q => q.id);
  if (pending.length) throw new Error(`Entrega bloqueada: ${pending.length} questões pendentes (${pending.slice(0, 8).join(", ")}).`);
  let calibration: Calibration | null = null;
  if (confidence === "calibrated") {
    calibration = await readJson<Calibration>(`${experiment.directory}/calibration.json`);
    const reference = await loadReference(data);
    if (calibration.fingerprint !== experiment.manifest.fingerprint || calibration.referenceHash !== reference.hash || calibration.splitHash !== hash(await readFile(resolveRoot("output/split.json"), "utf8"))) throw new Error("Calibração pertence a outra configuração, divisão ou referência.");
  }
  const header = ["id", "decisao", "tema_central_id", "extras_ids", "confianca", "motivo"];
  const rows = data.questions.map(q => {
    const d = experiment.records[q.id]!.decision!;
    const value = d.decisao === "fora" ? 0 : confidence === "declared" ? d.confianca_declarada : calibration?.groups[d.decisao]?.estimate;
    if (value == null) throw new Error(`Sem amostra suficiente para estimar confiança de ${d.decisao}. Use mais desenvolvimento ou escolha --confidence declared explicitamente.`);
    return [d.id, d.decisao, d.tema_central_id, d.extras_ids.join(";"), value.toFixed(4), d.motivo].map(csvCell).join(",");
  });
  const dir = resolveRoot("output/delivery", name);
  const forecast = forecastFile ? ForecastSchema.parse(await readJson(forecastFile)) : null;
  if (forecast && !(forecast.precisionLow <= forecast.precision && forecast.precision <= forecast.precisionHigh && forecast.coverageLow <= forecast.coverage && forecast.coverage <= forecast.coverageHigh)) throw new Error("Previsões fora dos intervalos.");
  await mkdir(resolveRoot("output/delivery"), { recursive: true });
  // Deliveries are immutable snapshots: never leave a stale forecast beside a new CSV.
  await mkdir(dir);
  await writeFile(`${dir}/publicacao.csv`, [header.join(","), ...rows].join("\n") + "\n");
  if (forecast) {
    await writeFile(`${dir}/previsao.txt`, `precisao_prevista: ${forecast.precision.toFixed(4)}\nprecisao_intervalo: ${forecast.precisionLow.toFixed(4)}-${forecast.precisionHigh.toFixed(4)}\ncobertura_prevista: ${forecast.coverage.toFixed(4)}\ncobertura_intervalo: ${forecast.coverageLow.toFixed(4)}-${forecast.coverageHigh.toFixed(4)}\n\n${forecast.explanation}\n`);
  }
  await atomicJson(`${dir}/exportacao.json`, { createdAt: now(), fingerprint: experiment.manifest.fingerprint, confidenceMode: confidence, calibration,
    warning: confidence === "declared" ? "Confiança subjetiva do classificador, não calibrada. Não constitui evidência de 95%." : "Estimativa de concordância com referência provisória, não precisão jurídica validada.",
    forecastGenerated: !!forecast, forecastSourceHash: forecastFile ? hash(await readFile(forecastFile, "utf8")) : null });
  return { directory: dir, rows: rows.length, forecastGenerated: !!forecast, confidence };
}
