import type { BatchState } from "../state.js";
import type { Dependencies } from "./especialista.js";

export function createContextNode(deps: Dependencies) {
  return async (state: BatchState): Promise<Partial<BatchState>> => {
    if (!deps.config.retrieval?.enabled && !deps.config.knowledge?.enabled) return {};
    if (!deps.context) throw new Error("Serviço de contexto API não inicializado.");
    const records = structuredClone(state.records);
    for (const id of state.ids) {
      await deps.context.collect(records[id]!, () => deps.save(records));
      if (records[id]!.retrieval) await deps.logger.event("api_context", { id, context: records[id]!.retrieval });
      if (records[id]!.knowledge) await deps.logger.event("local_context", { id, context: records[id]!.knowledge });
    }
    return { records };
  };
}
