import { z } from "zod";

const ToolCall = z.object({ id: z.string().min(1), type: z.literal("function"), function: z.object({ name: z.string(), arguments: z.string().max(4000) }).strict() }).strict();
export const ProviderStateSchema = z.object({ provider: z.enum(["gemini", "openai"]), model: z.string().min(1), payload: z.array(z.unknown()) }).strict();
export const LocalMessageSchema = z.union([
  z.object({ role: z.enum(["system", "user"]), content: z.string() }).strict(),
  z.object({ role: z.literal("assistant"), content: z.string().nullable(), tool_calls: z.array(ToolCall).optional(), reasoning_details: z.array(z.unknown()).optional(), reasoning: z.string().nullable().optional(), providerState: ProviderStateSchema.optional() }).strict(),
  z.object({ role: z.literal("tool"), tool_call_id: z.string(), content: z.string() }).strict(),
]);
export const LocalAgentSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]), snapshotHash: z.string(), status: z.enum(["running", "complete", "exhausted"]),
  messages: z.array(LocalMessageSchema), rounds: z.number().int().min(0).max(2),
  operations: z.array(z.object({ toolCallId: z.string(), name: z.string(), rawArguments: z.string().max(4000),
    state: z.enum(["pending", "complete"]), result: z.string().optional() }).strict()).max(4),
}).strict();
export type LocalAgentState = z.infer<typeof LocalAgentSchema>;
