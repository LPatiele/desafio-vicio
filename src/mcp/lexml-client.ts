import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { Config } from "../types.js";
import { hash, readJson, resolveRoot } from "../utils.js";
import { ToolRegistry, type McpTool } from "./tool-registry.js";

export type SourceLock = { status: "verified"; repository: string; revision: string; cwd: string; command: string; args: string[]; files: Record<string, string>; environment?: { file: string; sha256: string } };
export async function verifySourceLock(config: NonNullable<Config["research"]>): Promise<SourceLock> {
  let lock: SourceLock;
  try { lock = await readJson<SourceLock>(resolveRoot(config.sourceLock)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("MCP LexML não provisionado: falta o lock de uma cópia verificada do servidor. Obtenha a distribuição original, revise o código e execute mcp:pin. Consulte output/integration/lexml-mcp/source-availability.json para o bloqueio de download registrado.");
    throw error;
  }
  if (lock.status !== "verified" || !/^[a-f0-9]{40}$/.test(lock.revision) || lock.command !== config.command || JSON.stringify(lock.args) !== JSON.stringify(config.args) || path.resolve(resolveRoot(), lock.cwd) !== path.resolve(resolveRoot(), config.cwd ?? ".") || !lock.files || !Object.keys(lock.files).length) throw new Error("Lock do servidor MCP ausente, incompatível ou não verificado.");
  const root = path.resolve(resolveRoot(), lock.cwd);
  for (const [file, expected] of Object.entries(lock.files)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep) || hash(await readFile(target, "utf8")) !== expected) throw new Error(`Fonte MCP mudou: ${file}`);
  }
  if (config.environmentLock && (!lock.environment || lock.environment.file !== config.environmentLock || hash(await readFile(resolveRoot(lock.environment.file), "utf8")) !== lock.environment.sha256)) throw new Error("Lock do ambiente Python mudou.");
  return lock;
}
export function serverEnvironment(timeoutMs: number): Record<string, string> {
  const env: Record<string, string> = { LEXML_TIMEOUT: String(timeoutMs / 1000), JURIDICO_HTTP_TIMEOUT: String(Math.max(0.1, timeoutMs / 1000 - 3)), JURIDICO_MAX_RETRIES: "1", PYTHONUNBUFFERED: "1", UV_OFFLINE: "1" };
  for (const key of ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]) if (process.env[key]) env[key] = process.env[key]!;
  return env;
}
export type ResearchBackend = {
  registry: ToolRegistry;
  identity: unknown;
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  close?: () => Promise<void>;
};
export class LexmlClient implements ResearchBackend {
  readonly client = new Client({ name: "classificacao-topicos-juridicos", version: "0.1.0" });
  registry!: ToolRegistry;
  identity: unknown;
  private constructor(readonly config: NonNullable<Config["research"]>) {}
  static async connect(config: NonNullable<Config["research"]>): Promise<LexmlClient> {
    const lock = await verifySourceLock(config);
    const connection = new LexmlClient(config);
    const transport = new StdioClientTransport({ command: config.command, args: config.args, cwd: resolveRoot(config.cwd ?? "."), env: serverEnvironment(config.toolTimeoutMs), stderr: "pipe", maxBufferSize: 1_000_000 });
    // Drain logs without forwarding untrusted stderr or inherited credentials.
    transport.stderr?.on("data", () => {});
    try {
      await connection.client.connect(transport, { timeout: config.toolTimeoutMs });
      const tools: McpTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const result = await connection.client.listTools(cursor ? { cursor } : {}, { timeout: config.toolTimeoutMs });
        tools.push(...result.tools as McpTool[]);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      if (cursor) throw new Error("Catálogo MCP excedeu cinco páginas.");
      connection.registry = new ToolRegistry(tools);
      if (config.provider === "ehrodan/lexmcp" && connection.registry.searchName !== "pesquisar_lexml") throw new Error("Servidor não anunciou a ferramenta do MCP alternativo.");
      connection.identity = { source: lock, server: connection.client.getServerVersion(), tools };
      return connection;
    } catch (error) { await connection.close(); throw error; }
  }
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!["lexml_search", "lexml_resolve_urn", "lexml_explain", "pesquisar_lexml", "resolver_urn_lexml"].includes(name)) throw new Error("Ferramenta MCP bloqueada.");
    return this.client.callTool({ name, arguments: args }, { timeout: this.config.toolTimeoutMs });
  }
  async close() { await this.client.close(); }
}
