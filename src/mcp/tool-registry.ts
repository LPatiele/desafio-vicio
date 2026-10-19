import { Ajv, type ValidateFunction } from "ajv";
import type { ToolDefinition } from "../client.js";

export type McpTool = { name: string; description?: string; inputSchema: Record<string, unknown> };
export class ToolRegistry {
  readonly definitions: ToolDefinition[];
  readonly validators = new Map<string, ValidateFunction>();
  readonly searchName: "lexml_search" | "pesquisar_lexml";
  readonly resolveName: "lexml_resolve_urn" | "resolver_urn_lexml";
  constructor(tools: McpTool[]) {
    this.searchName = tools.some(t => t.name === "pesquisar_lexml") ? "pesquisar_lexml" : "lexml_search";
    this.resolveName = this.searchName === "pesquisar_lexml" ? "resolver_urn_lexml" : "lexml_resolve_urn";
    const allowed = new Set<string>([this.searchName, this.resolveName]);
    const ajv = new Ajv({ strict: false, allErrors: true });
    this.definitions = tools.filter(t => allowed.has(t.name)).map(t => {
      if (this.validators.has(t.name)) throw new Error(`Ferramenta duplicada: ${t.name}`);
      const schema = structuredClone(t.inputSchema);
      schema.additionalProperties = false;
      this.validators.set(t.name, ajv.compile(schema));
      return { type: "function", function: { name: t.name, description: (t.description ?? t.name).slice(0, 3000), parameters: schema } };
    });
    if (!this.validators.has(this.searchName)) throw new Error("MCP não anunciou ferramenta de busca LexML compatível.");
  }
  arguments(name: string, raw: string): Record<string, unknown> {
    const validator = this.validators.get(name);
    if (!validator) throw new Error(`Ferramenta não permitida: ${name}`);
    if (raw.length > 4000) throw new Error("Argumentos excedem 4000 caracteres.");
    const args: unknown = JSON.parse(raw);
    if (!args || Array.isArray(args) || typeof args !== "object" || !validator(args)) throw new Error(`Argumentos inválidos: ${JSON.stringify(validator.errors)}`);
    const result = args as Record<string, unknown>;
    if (name === "pesquisar_lexml") {
      if (typeof result.termos !== "string" || !result.termos.trim() || result.termos.length > 500) throw new Error("Termos de busca inválidos.");
      if (result.limite !== undefined && (!Number.isInteger(result.limite) || Number(result.limite) < 1 || Number(result.limite) > 5)) throw new Error("Busca limitada a cinco registros.");
      if (result.pagina !== undefined && result.pagina !== 1) throw new Error("Piloto limitado à primeira página.");
      result.limite = 5;
      result.pagina = 1;
    } else if (name === "lexml_search") {
      if (Boolean(result.query) === Boolean(result.filters)) throw new Error("Informe query ou filters, exclusivamente.");
      if (typeof result.query === "string" && result.query.length > 1000) throw new Error("Consulta longa demais.");
      if (result.maximum_records !== undefined && (!Number.isInteger(result.maximum_records) || Number(result.maximum_records) < 1 || Number(result.maximum_records) > 5)) throw new Error("Busca limitada a cinco registros.");
      result.maximum_records = 5;
    } else {
      if (typeof result.urn !== "string" || !/^urn:lex:[a-zA-Z0-9:;.,_~%+-]+$/.test(result.urn) || result.urn.length > 500) throw new Error("URN inválida.");
      // A constructed URL alone is not a verified resolution.
      if (name === "lexml_resolve_urn") result.verify = true;
    }
    if (!validator(result)) throw new Error("Schema do servidor incompatível com os limites locais.");
    return result;
  }
}
