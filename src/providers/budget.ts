import { z } from "zod";
import type { DirectProfile } from "../types.js";
import { StopRun } from "../client.js";
import { atomicJson, exists, readJson, now } from "../utils.js";
import { readdir } from "node:fs/promises";
import path from "node:path";

export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number };
const Amount = z.number().finite().nonnegative();
const Entry = z.object({
  role: z.enum(["classifier", "judge"]), provider: z.enum(["gemini", "openai"]), model: z.string(),
  quotaScope: z.string().optional(),
  at: z.string(), reservedUsd: Amount, actualUsd: Amount.nullable(),
  state: z.enum(["reserved", "settled", "unknown", "not_sent"]),
  usage: z.object({ inputTokens: Amount.int(), cachedInputTokens: Amount.int(), outputTokens: Amount.int(), reasoningTokens: Amount.int() }).optional(),
}).strict();
const Ledger = z.object({ version: z.literal(1), entries: z.record(z.string(), Entry) }).strict().superRefine((state, ctx) => {
  for (const entry of Object.values(state.entries)) {
    if ((entry.state === "settled" || entry.state === "not_sent") !== (entry.actualUsd !== null)) ctx.addIssue({ code: "custom", message: "Liquidação monetária inválida." });
    if (entry.state === "not_sent" && entry.actualUsd !== 0) ctx.addIssue({ code: "custom", message: "Envio cancelado com cobrança inválida." });
  }
});

/** Seed a new daily counter from existing local ledgers, including failures and
 * unknown outcomes. No credential is read; external usage is not observable. */
export async function knownDirectStarts(directory: string, provider: DirectProfile["provider"], model: string, quotaScope = "workspace"): Promise<number[]> {
  let folders;
  try { folders = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const starts = new Map<string, number>();
  for (const folder of folders.filter(f => f.isDirectory())) {
    const file = path.join(directory, folder.name, "spend.json");
    if (!await exists(file)) continue;
    const ledger = Ledger.parse(await readJson(file));
    for (const [id, entry] of Object.entries(ledger.entries)) if (entry.provider === provider && entry.model === model && (entry.quotaScope ?? "workspace") === quotaScope && entry.state !== "not_sent") {
      const at = Date.parse(entry.at);
      if (!Number.isFinite(at)) throw new Error("Data inválida no histórico de chamadas diretas.");
      if (starts.has(id) && starts.get(id) !== at) throw new Error("Reserva duplicada com datas diferentes no histórico.");
      starts.set(id, at);
    }
  }
  return [...starts.values()];
}

export function usageCost(profile: DirectProfile, usage: TokenUsage): number {
  const prices = profile.longContext && usage.inputTokens > profile.longContext.threshold ? profile.longContext : profile;
  return ((usage.inputTokens - usage.cachedInputTokens) * prices.inputUsdPerMillion + usage.cachedInputTokens * prices.cachedInputUsdPerMillion + usage.outputTokens * prices.outputUsdPerMillion) / 1_000_000;
}

// The experiment's run.lock serializes access. Reserved/unknown entries survive
// crashes and remain charged conservatively until explicit billing reconciliation.
export class SpendBudget {
  private constructor(readonly file: string, readonly limitUsd: number, readonly maxCalls: number, private ledger: z.infer<typeof Ledger>) {}
  static async open(file: string, limitUsd: number, maxCalls: number) {
    return new SpendBudget(file, limitUsd, maxCalls, await exists(file) ? Ledger.parse(await readJson(file)) : { version: 1, entries: {} });
  }
  summary() {
    const entries = Object.values(this.ledger.entries);
    const chargedOrReservedUsd = entries.reduce((sum, e) => sum + (e.actualUsd ?? e.reservedUsd), 0);
    return { limitUsd: this.limitUsd, chargedOrReservedUsd, knownCostUsd: entries.reduce((sum, e) => sum + (e.actualUsd ?? 0), 0), unresolved: entries.filter(e => e.actualUsd === null).length, remainingUsd: Math.max(0, this.limitUsd - chargedOrReservedUsd), calls: entries.filter(e => e.state !== "not_sent").length };
  }
  async reserve(requestId: string, role: "classifier" | "judge", model: string, profile: DirectProfile, inputUpperBound: number, quotaScope = "workspace") {
    const summary = this.summary();
    const reservedUsd = usageCost(profile, { inputTokens: inputUpperBound, cachedInputTokens: 0, outputTokens: profile.maxOutputTokens, reasoningTokens: 0 });
    if (summary.calls >= this.maxCalls) throw new StopRun("Limite persistente de chamadas pagas atingido. Estado salvo.");
    if (summary.chargedOrReservedUsd + reservedUsd > this.limitUsd + 1e-9) throw new StopRun(`Orçamento em dólares insuficiente para a próxima chamada: reserva US$ ${reservedUsd.toFixed(4)}, disponível US$ ${summary.remainingUsd.toFixed(4)}. Estado salvo.`);
    if (this.ledger.entries[requestId]) throw new StopRun("Reserva de custo duplicada.");
    this.ledger.entries[requestId] = { role, provider: profile.provider, model, quotaScope, at: now(), reservedUsd, actualUsd: null, state: "reserved" };
    await atomicJson(this.file, this.ledger);
  }
  async settle(requestId: string, profile: DirectProfile, usage: TokenUsage | null, notSent = false) {
    const entry = this.ledger.entries[requestId];
    if (!entry || entry.actualUsd !== null) throw new StopRun("Reserva de custo inexistente ou já liquidada.");
    entry.state = notSent ? "not_sent" : usage ? "settled" : "unknown";
    entry.actualUsd = notSent ? 0 : usage ? usageCost(profile, usage) : null;
    if (usage) entry.usage = usage;
    await atomicJson(this.file, this.ledger);
  }
}
