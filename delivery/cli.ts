import { parseArgs } from "node:util";
import { finalize } from "./finalize.js";

const { values } = parseArgs({ options: { suite: { type: "string", default: "model-only-v19-359" }, name: { type: "string" } } });
finalize(values.suite, values.name ?? values.suite).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(JSON.stringify({ error: (error as Error).message })); process.exitCode = 1;
});
