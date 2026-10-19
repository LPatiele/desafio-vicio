import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { readBundle, reproduce } from "../reproduction/bundle.js";
import { hash } from "../src/utils.js";

const { values } = parseArgs({ options: { bundle: { type: "string", default: "reproducao/v20-entrega.json.gz" }, out: { type: "string", default: "output/reproduction/v20-entrega" } } });
const value = await readBundle(values.bundle!), result = reproduce(value), out = path.resolve(values.out!);
await mkdir(out, { recursive: true });
for (const [file, body] of Object.entries({ "publicacao.csv": result.delivery, "divergencias.csv": result.divergenceCsv, "avaliacao.json": JSON.stringify(result.evaluation, null, 2) + "\n" })) await writeFile(path.join(out, file), body);
await writeFile(path.join(out, "reproducao.json"), JSON.stringify({ source: values.bundle, sourceSuite: value.metadata.sourceSuite, fingerprint: value.metadata.fingerprint, csvSha256: hash(result.delivery), networkCalls: 0, ...result.evaluation.overall }, null, 2) + "\n");
console.log(JSON.stringify({ out, rows: result.evaluation.overall.processed, csvSha256: hash(result.delivery), networkCalls: 0 }));
