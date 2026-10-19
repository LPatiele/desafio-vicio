import { END, START, StateGraph } from "@langchain/langgraph";
import { BatchAnnotation } from "./state.js";
import { createAgentNode, type Dependencies } from "./nodes/especialista.js";
import { indexThemes } from "./data.js";
import { decideRecord } from "./retrieval/decision.js";
import { createContextNode } from "./nodes/contexto.js";
import { now } from "./utils.js";

export function createGraph(deps: Dependencies) {
  const themes = indexThemes(deps.data.themes);
  const questions = new Map(deps.data.questions.map(q => [q.id, q]));
  return new StateGraph(BatchAnnotation)
    .addNode("classificador", createAgentNode("classifier", deps))
    .addNode("contexto", createContextNode(deps))
    .addNode("juiz", createAgentNode("judge", deps))
    .addNode("decisao", async state => {
      const records = structuredClone(state.records);
      for (const id of state.ids) {
        const r = records[id]!;
        if (!r.proposal || !r.verdict) continue;
        if (deps.config.research?.enabled && r.research?.status !== "complete") continue;
        const decision = decideRecord(r, questions.get(id)!, themes, deps.config);
        if (decision) r.decision = decision;
        else r.errors.push({ stage: "decision", message: "Não foi possível decidir com tema sugerido válido. Requer análise explícita; não exportar como fora.", at: now() });
      }
      await deps.save(records);
      return { records };
    })
    .addEdge(START, "classificador")
    .addEdge("classificador", "contexto")
    .addEdge("contexto", "juiz")
    .addEdge("juiz", "decisao")
    .addEdge("decisao", END).compile();
}
