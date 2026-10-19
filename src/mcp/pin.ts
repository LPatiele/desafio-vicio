import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { getConfig } from "../config.js";
import { atomicJson, hash, redact, resolveRoot } from "../utils.js";
import type { SourceLock } from "./lexml-client.js";

const exec = promisify(execFile);
async function main() {
  const config = (await getConfig(resolveRoot("config/lexml-pesquisa-v4.json"))).research!;
  const cwd = resolveRoot(config.cwd ?? ".");
  const git = async (...args: string[]) => (await exec("git", args, { cwd, maxBuffer: 2_000_000 })).stdout.trim();
  const origin = await git("remote", "get-url", "origin");
  const approvedOrigin = config.provider === "ehrodan/lexmcp" ? /^https:\/\/github\.com\/ehrodan\/lexmcp(?:\.git)?$/i : /^https:\/\/github\.com\/prof-ramos\/lexml-mcp(?:\.git)?$/i;
  if (!approvedOrigin.test(origin)) throw new Error("Origem do servidor difere do MCP aprovado.");
  if (await git("status", "--porcelain")) throw new Error("Checkout MCP possui alterações. Revise antes de fixar a origem.");
  const revision = await git("rev-parse", "HEAD");
  const files = (await git("ls-files")).split("\n").filter(Boolean);
  const digests = Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(`${cwd}/${file}`, "utf8"))])));
  const entry = config.provider === "ehrodan/lexmcp" ? "src/mcp_juridico_brasil/lexml/tools.py" : "src/lexml_mcp/server.py";
  if (!digests["pyproject.toml"] || !digests[entry]) throw new Error("Distribuição não contém os arquivos documentados.");
  const lock: SourceLock = { status: "verified", repository: origin, revision, cwd: config.cwd ?? ".", command: config.command, args: config.args, files: digests };
  if (config.environmentLock) lock.environment = { file: config.environmentLock, sha256: hash(await readFile(resolveRoot(config.environmentLock), "utf8")) };
  await atomicJson(resolveRoot(config.sourceLock), lock);
  return { revision, files: files.length, sourceLock: config.sourceLock, note: "Identidade dos arquivos fixada. A revisão do código e a instalação congelada do ambiente Python são etapas necessárias separadas." };
}
main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(redact({ error: (error as Error).message })); process.exitCode = 1; });
