import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { readBundle } from "../reproduction/bundle.js";
import { hash, exists } from "../src/utils.js";

export async function initialize(project: string, workspace: string, archive: string) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || project === "projeto-exemplo") throw new Error("Informe seu projeto Google Cloud em --project.");
  const value = await readBundle(archive);
  if (value.kind !== "vertex-baseline-template-v1") throw new Error("Pacote não é um template Vertex.");
  const destination = path.join(workspace, "output/no-rag-v19/model-only-v19-359");
  if (await exists(destination)) throw new Error("Já existe uma base nesse diretório. Não sobrescreva resultados históricos; use um checkout novo para a inicialização pública.");
  const template = JSON.parse(value.files["template.json"]!);
  const inputFiles = { questions: "anexos/questoes.jsonl", themes: "anexos/temas.csv" };
  for (const [key, name] of Object.entries(inputFiles)) if (hash(await readFile(path.join(workspace, name), "utf8")) !== template.inputHashes[key]) throw new Error("Anexos diferem do template.");
  template.vertex.project = project; template.config.direct.quotaScope = `vertex-${project}-global`;
  const fingerprint = hash(JSON.stringify(template));
  await mkdir(path.dirname(destination), { recursive: true });
  await mkdir(destination);
  // Exclusive creates: never replace a file if another initializer wins the race.
  for (const file of ["prompts.json", "records.json", "requests.jsonl", "events.jsonl"]) await writeFile(path.join(destination, file), value.files[file]!, { flag: "wx" });
  await writeFile(path.join(destination, "manifest.json"), JSON.stringify({ ...template, fingerprint, publicConfigurationTemplate: true }, null, 2) + "\n", { flag: "wx" });
  return { destination, project, networkCalls: 0, note: "Inicializa apenas a base de configuração/estimativa. A execução v20 cria propostas novas e exige orçamento próprio." };
}
if (process.argv[1]?.endsWith("/init-vertex-reproduction.ts")) {
  const { values } = parseArgs({ options: { project: { type: "string" }, bundle: { type: "string", default: "reproducao/vertex-baseline.json.gz" } } });
  initialize(values.project ?? "", process.cwd(), values.bundle!).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
