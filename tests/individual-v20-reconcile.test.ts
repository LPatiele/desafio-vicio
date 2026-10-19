import test from "node:test";
import assert from "node:assert/strict";
import { confirmed429 } from "../experiments/individual-v20/reconcile.js";

test("libera somente rejeição 429 Gemini Vertex comprovada; preserva falhas de rede e sucesso sem uso", () => {
  const entries: Record<string, any> = {}, rows: any[] = [];
  for (const id of ["rejected", "network", "success", "other-provider", "gemini4", "already-settled"]) {
    const model = id === "gemini4" ? "gemini-4-argon" : "gemini-3.1-pro-preview";
    entries[id] = { actualUsd: id === "already-settled" ? .5 : null, provider: "gemini", model, reservedUsd: 1.07 };
    rows.push({ phase: "start", requestId: id, model, channel: id === "other-provider" ? "direct" : "vertex", endpoint: "https://aiplatform.googleapis.com/" });
    if (id === "network") rows.push({ phase: "network_error", requestId: id });
    else rows.push({ phase: "response", requestId: id, channel: "vertex", status: id === "success" ? 200 : 429, body: JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }) });
  }
  const before = JSON.stringify(entries);
  const result = confirmed429({ entries }, [{ source: "fixture", rows }]);
  assert.deepEqual(result.map(r => r.id), ["rejected"]);
  assert.equal(JSON.stringify(entries), before);
});
