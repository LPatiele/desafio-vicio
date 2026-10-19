import { readFile } from "node:fs/promises";
import { ConfigSchema, type Config } from "./types.js";
import { hash, resolveRoot } from "./utils.js";

export async function getConfig(file = resolveRoot("config/default.json"), swap = false): Promise<Config> {
  const config = ConfigSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (config.classifierModel === config.judgeModel) throw new Error("Classificador e juiz devem usar modelos distintos.");
  if (swap) {
    [config.classifierModel, config.judgeModel] = [config.judgeModel, config.classifierModel];
    if (config.direct) [config.direct.classifier, config.direct.judge] = [config.direct.judge, config.direct.classifier];
  }
  return config;
}
export async function loadPrompts(config: Pick<Config, "classifierPrompt" | "judgePrompt">) {
  const classifier = await readFile(resolveRoot("src/agents", config.classifierPrompt), "utf8");
  const judge = await readFile(resolveRoot("src/agents", config.judgePrompt), "utf8");
  return { classifier, judge, hashes: { classifier: hash(classifier), judge: hash(judge) } };
}
