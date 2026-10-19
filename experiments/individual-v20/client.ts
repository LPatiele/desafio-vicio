import type { z } from "zod";
import { StopRun, RetryableCallError, type Message, type TurnOptions } from "../../src/client.js";
import { VertexClient } from "../vertex-v18/client.js";

/** An ambiguous connection failure stops the run, rather than exhausting every item offline. */
export class IndividualVertexClient extends VertexClient {
  override async turn(role: "classifier" | "judge", messages: Message[], schema: z.ZodType, ids: string[], beforeSend: (id: string) => Promise<void>, options?: TurnOptions) {
    try { return await super.turn(role, messages, schema, ids, beforeSend, options); }
    catch (error) {
      if (error instanceof RetryableCallError && /Falha de rede Vertex/.test(error.message)) throw new StopRun("Falha de conexão Vertex: execução interrompida para não consumir tentativas dos outros itens. Contadores e reserva desconhecida preservados.");
      throw error;
    }
  }
}
