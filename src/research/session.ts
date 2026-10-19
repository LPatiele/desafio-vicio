import path from "node:path";
import type { ResearchBackend } from "../mcp/lexml-client.js";
import type { Config } from "../types.js";
import type { Logger } from "../logger.js";
import { atomicJson, exists, hash, now, readJson } from "../utils.js";
import { normalizeEvidence, type EvidenceResult, type ResearchOperation, type ResearchState } from "./evidence.js";

export class ResearchSession {
  constructor(readonly backend: ResearchBackend, readonly config: NonNullable<Config["research"]>, readonly logger: Logger, readonly directory: string) {}
  async completePending(state: ResearchState, save: () => Promise<void>) {
    for (const op of state.operations) {
      if (op.state !== "complete") {
        try {
          const args = this.backend.registry.arguments(op.name, op.rawArguments);
          if (op.args && JSON.stringify(op.args) !== JSON.stringify(args)) throw new Error("Argumentos salvos divergem da solicitação original.");
          op.args = args;
          op.cacheKey = hash(JSON.stringify({ backend: this.backend.identity, name: op.name, args: op.args }));
          const file = path.join(this.directory, "cache", `${op.cacheKey}.json`);
          if (await exists(file)) {
            const cached = await readJson<{ raw: unknown; rawHash: string }>(file);
            if (hash(JSON.stringify(cached.raw)) !== cached.rawHash) throw new Error("Snapshot de pesquisa alterado.");
            const normalized = normalizeEvidence(cached.raw, this.config.maxResultCharacters);
            if (!["ok", "empty"].includes(normalized.status)) throw new Error("Cache de pesquisa contém falha.");
            op.result = normalized; op.cacheHit = true;
          }
          const started = Date.now();
          while (!op.result && op.attempts < this.config.maxToolAttempts) {
            op.attempts++;
            await save();
            let raw: unknown;
            try { raw = await this.backend.call(op.name, op.args); }
            catch (error) { raw = { error: { type: /timeout|timed out|request timed/i.test((error as Error).message) ? "timeout" : "network_error", message: (error as Error).message } }; }
            const result = normalizeEvidence(raw, this.config.maxResultCharacters);
            await this.logger.event("mcp_call", { toolCallId: op.toolCallId, name: op.name, args: op.args, attempt: op.attempts, status: result.status, at: now() });
            if (["ok", "empty"].includes(result.status)) await atomicJson(file, { raw, rawHash: hash(JSON.stringify(raw)), retrievedAt: now() });
            if (!result.retryable || op.attempts >= this.config.maxToolAttempts) op.result = result;
          }
          op.durationMs = Date.now() - started;
          op.result ??= { status: "error", payload: { error: "Orçamento MCP esgotado após interrupção." }, sources: [], retryable: false };
        } catch (error) {
          op.result = { status: "invalid", payload: { error: (error as Error).message }, sources: [], retryable: false };
        }
        op.state = "complete";
        await save();
      }
      if (!state.messages.some(m => m.role === "tool" && m.tool_call_id === op.toolCallId)) {
        const content = JSON.stringify(op.result);
        const previousCharacters = state.messages.filter(m => m.role === "tool").reduce((n, m) => n + m.content.length, 0);
        if (previousCharacters + content.length > this.config.maxQuestionCharacters) op.result = { status: "oversized", payload: { error: "Limite de conteúdo por questão atingido." }, sources: [], retryable: false };
        state.messages.push({ role: "tool", tool_call_id: op.toolCallId, content: JSON.stringify(op.result) });
        await save();
      }
    }
  }
  successfulSearch(state: ResearchState) { return state.operations.some(o => o.name === this.backend.registry.searchName && ["ok", "empty"].includes(o.result?.status ?? "")); }
}
