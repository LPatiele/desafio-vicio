import { Annotation } from "@langchain/langgraph";
import type { RecordState } from "./types.js";

export const BatchAnnotation = Annotation.Root({
  ids: Annotation<string[]>,
  records: Annotation<Record<string, RecordState>>,
});
export type BatchState = typeof BatchAnnotation.State;
