import { z } from "zod";
import type { ToolDefinition } from "../client.js";
import type { LocalContext } from "./types.js";
import type { LocalContextService } from "./store.js";
import type { Question, Proposal, RecordState } from "../types.js";
import { LocalAgentSchema } from "./agent-types.js";

const inputs = {
  buscar_referencias: z.object({ consulta: z.string().trim().min(3).max(600), limite: z.number().int().min(1).max(3).optional(), tipo: z.enum(["norma", "precedente", "doutrina"]).optional() }).strict(),
  consultar_dispositivo: z.object({ diploma: z.string().regex(/^[a-z0-9-]{1,60}$/), artigo: z.string().regex(/^\d{1,4}(?:-?[a-zA-Z])?$/) }).strict(),
  ler_referencia: z.object({ id: z.string().regex(/^S-[a-f0-9]{12}$/) }).strict(),
};
const descriptions = {
  buscar_referencias: "Busca textual no SQLite local versionado. Escolha palavras jurídicas específicas para verificar a proposta ou um concorrente. Retorna até três documentos, com texto e proveniência; resultados não equivalem a confirmação jurídica.",
  consultar_dispositivo: "Consulta artigo na base local pelo ID do diploma (cp, cpp, cf, lep, drogas, maria-penha, ambientais, lavagem, juizados, eca, organizacoes, armas, hediondos, temporaria, interceptacao, entre outros do catálogo). Pode não haver cobertura. artigo: por exemplo 332, 409 ou 3-b.",
  ler_referencia: "Abre o texto de um ID S- já recuperado nesta questão, até 4000 caracteres. Não acessa documentos não recuperados ou a referência de avaliação.",
};
export const localTools: ToolDefinition[] = Object.entries(inputs).map(([name, schema]) => {
  const parameters = z.toJSONSchema(schema, { target: "draft-7" }); delete parameters.$schema;
  return { type: "function", function: { name, description: descriptions[name as keyof typeof descriptions], parameters } };
});
export type Operation = { name: string; rawArguments: string };
export function executeLocalTool(service: LocalContextService, question: Question, proposal: Proposal | null, previous: LocalContext, operation: Operation, usedCharacters: number, role: "classifier" | "judge" = "judge"): { context: LocalContext; result: string } {
  const budget = service.config.knowledge!.maxContextCharacters - usedCharacters;
  const failure = (error: string) => ({ context: previous, result: JSON.stringify({ status: "erro", erro: error }) });
  if (budget < 500) return failure("Orçamento de contexto atingido; finalize com as evidências já recebidas.");
  try {
    const name = operation.name as keyof typeof inputs;
    if (!Object.hasOwn(inputs, name)) return failure("Ferramenta desconhecida.");
    const args = inputs[name].parse(JSON.parse(operation.rawArguments));
    let chunks = [] as LocalContext["chunks"];
    const queries = [...previous.queries];
    if (name === "buscar_referencias") {
      const a = args as z.infer<typeof inputs.buscar_referencias>;
      const search = service.store.search(a.consulta, 10, a.tipo);
      chunks = search.chunks.slice(0, a.limite ?? 3);
      queries.push({ role: role === "judge" ? "juiz" : "classificador_consulta", text: a.consulta, expression: search.expression });
    } else if (name === "consultar_dispositivo") {
      const a = args as z.infer<typeof inputs.consultar_dispositivo>;
      const article = a.artigo.replaceAll("-", "").toLowerCase();
      chunks = [...service.store.chunks.values()].filter(c => c.sourceId === a.diploma && c.locator.match(/!art([0-9a-z-]+)/i)?.[1]?.replaceAll("-", "").toLowerCase() === article).slice(0, 3);
      queries.push({ role: role === "judge" ? "juiz_dispositivo" : "classificador_dispositivo", text: `${a.diploma}:${a.artigo}`, expression: `dispositivo:${a.diploma}:${article}` });
    } else {
      const a = args as z.infer<typeof inputs.ler_referencia>;
      const found = previous.chunks.find(c => c.id === a.id);
      if (!found) return failure("ID não recuperado nesta questão.");
      chunks = [found];
    }
    const selected = [...previous.chunks];
    chunks = chunks.filter(c => selected.some(s => s.id === c.id) || selected.length < service.config.knowledge!.maxDocuments && !!selected.push(c));
    let context = service.fromChunks(question, proposal, selected, queries, role);
    const delivered = new Set(context.chunks.map(c => c.id));
    const envelopes = new Map<string, Record<string, unknown>>(JSON.parse(context.judgeContext).fontes.map((f: Record<string, unknown>) => [f.id, f]));
    let sources = chunks.filter(c => delivered.has(c.id)).map(c => ({ ...envelopes.get(c.id)!, id: c.id, texto: c.text.slice(0, name === "ler_referencia" ? 4000 : 2200), truncado: c.text.length > (name === "ler_referencia" ? 4000 : 2200) }));
    const render = () => JSON.stringify({ status: sources.length ? "recuperado" : "vazio", base: service.store.manifestHash, lacunas: context.gaps, fontes: sources });
    while (sources.length && render().length > budget - 600) sources.pop();
    const actual = new Set([...previous.chunks.map(c => c.id), ...sources.map(c => c.id)]);
    context = service.fromChunks(question, proposal, context.chunks.filter(c => actual.has(c.id)), queries, role);
    const result = render();
    if (result.length > budget - 600) return failure("Metadados excedem o orçamento restante.");
    return { context, result };
  } catch { return failure("Argumentos inválidos. Respeite o contrato da ferramenta; a tentativa conta no limite de consultas."); }
}

export function validateLocalAgent(service: LocalContextService, record: RecordState, question: Question, role: "classifier" | "judge" = "judge"): LocalContext {
  const proposal = role === "judge" ? record.proposal! : null;
  const agent = role === "judge" ? record.knowledgeAgent : record.classifierKnowledgeAgent;
  const output = role === "judge" ? record.verdict : record.proposal;
  let context = service.fromChunks(question, proposal, [], [], role);
  if (!agent) {
    if (output || record.attempts?.[role]) throw new Error("Parecer/tentativas sem sessão de consultas local.");
    return context;
  }
  const state = LocalAgentSchema.parse(agent);
  const options = service.config.knowledge!;
  if (service.config.direct) {
    const profile = service.config.direct[role], model = role === "classifier" ? service.config.classifierModel : service.config.judgeModel;
    if (state.version !== 2) throw new Error("APIs diretas exigem checkpoint de continuidade v2.");
    for (const message of state.messages.filter(m => m.role === "assistant")) {
      const native = message.providerState;
      if (!native || native.provider !== profile.provider || native.model !== model) throw new Error("Continuidade local pertence a outro fornecedor/modelo ou está ausente.");
      const payload = native.payload as Record<string, any>[];
      if (payload.some(item => !item || typeof item !== "object")) throw new Error("Itens nativos de continuidade inválidos.");
      const nativeCalls: { id?: string; name: string; arguments: string }[] | null = profile.provider === "gemini"
        ? payload.length === 1 && payload[0]?.role === "model" && Array.isArray(payload[0]?.parts) ? payload[0]!.parts.filter((part: any) => part?.functionCall).map((part: any) => ({ id: part.functionCall.id, name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) })) : null
        : payload.filter(item => item.type === "function_call").map(item => ({ id: item.call_id, name: item.name, arguments: item.arguments }));
      const calls = message.tool_calls ?? [];
      if (!nativeCalls || nativeCalls.length !== calls.length || calls.some((call, index) => nativeCalls[index]?.name !== call.function.name || nativeCalls[index]?.arguments !== call.function.arguments || nativeCalls[index]?.id !== undefined && nativeCalls[index]?.id !== call.id)) throw new Error("Chamada normalizada difere da continuidade nativa salva.");
    }
  }
  if (state.snapshotHash !== service.store.manifestHash || state.rounds > (options.maxToolRounds ?? 2) || state.operations.length > (options.maxToolCalls ?? 4)) throw new Error("Sessão local excede limites ou usa outra base.");
  if (state.messages[0]?.role !== "system" || state.messages[1]?.role !== "user" || state.messages[1].content !== JSON.stringify({ questoes: [{ questao: question, ...(role === "judge" ? { proposta: record.proposal } : {}), contexto_externo: JSON.parse(context.judgeContext) }] })) throw new Error("Entrada inicial do ciclo local difere da questão/proposta.");
  const calls = state.messages.flatMap(m => m.role === "assistant" ? m.tool_calls ?? [] : []);
  if (calls.length !== state.operations.length || new Set(calls.map(c => c.id)).size !== calls.length || state.rounds !== state.messages.filter(m => m.role === "assistant" && m.tool_calls?.length).length) throw new Error("Histórico de chamadas local inconsistente.");
  let used = 0, pending = false;
  for (let i = 0; i < state.operations.length; i++) {
    const operation = state.operations[i]!, call = calls[i]!;
    if (operation.toolCallId !== call.id || operation.name !== call.function.name || operation.rawArguments !== call.function.arguments) throw new Error("Operação difere da solicitação do juiz.");
    const replies = state.messages.filter(m => m.role === "tool" && m.tool_call_id === call.id);
    if (operation.state === "pending") { pending = true; if (operation.result !== undefined || replies.length) throw new Error("Operação pendente com resposta."); continue; }
    if (pending) throw new Error("Operações locais fora de ordem.");
    const replay = executeLocalTool(service, question, proposal, context, operation, used, role);
    if (operation.result !== replay.result || replies.length !== 1 || replies[0]!.content !== replay.result) throw new Error("Resultado local difere da consulta reproduzida no SQLite.");
    context = replay.context; used += replay.result.length;
  }
  if (state.messages.filter(m => m.role === "tool").length !== state.operations.filter(o => o.state === "complete").length) throw new Error("Respostas de ferramenta inesperadas.");
  if (!!output !== (state.status === "complete") || output && pending) throw new Error("Estado de parecer local inconsistente.");
  if (state.rounds > (record.attempts?.[role] ?? 0)) throw new Error("Rodadas sem tentativas reservadas.");
  return context;
}
