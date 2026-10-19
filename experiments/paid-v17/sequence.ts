export const conditionOrder = (condition: string): number[] => condition === "all" ? [30, 20, 10, 1] : condition === "batches" ? [30, 20, 10] : [Number(condition.slice(1))];

export function assertBudgetScope(sizes: number[], budget: number, authorization: { totalBudgetUsd: number; allowedConditions: string[] }) {
  if (!Number.isFinite(authorization.totalBudgetUsd) || authorization.totalBudgetUsd <= 0 || budget > authorization.totalBudgetUsd || !Array.isArray(authorization.allowedConditions) || sizes.some(size => !authorization.allowedConditions.includes(`b${size}`))) throw new Error("Condições ou teto excedem a autorização financeira registrada. B1 requer orçamento próprio autorizado.");
}

export function baselineReady(ids: string[], records: Record<string, { decision?: unknown }>, running: boolean) {
  return !running && ids.every(id => !!records[id]?.decision);
}

/** A failed or externally blocked condition stops the queue. Item-level
 * exhaustion is reported separately and does not discard the other tests. */
export async function runSequential<T extends { stopped: string | null }>(sizes: number[], task: (size: number) => Promise<T>) {
  const results: PromiseSettledResult<T>[] = [];
  for (const size of sizes) {
    try {
      const value = await task(size); results.push({ status: "fulfilled", value });
      if (value.stopped) break;
    } catch (reason) { results.push({ status: "rejected", reason }); break; }
  }
  return { results, queued: sizes.slice(results.length).map(size => `b${size}`) };
}
