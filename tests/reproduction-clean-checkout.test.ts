import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, symlink, rm, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { resolveRoot, exists, hash } from "../src/utils.js";

test("README funciona sem output: exporta offline, inicializa e planeja uma questão sem rede", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "case-clean-checkout-"));
  try {
    for (const folder of ["src", "config", "delivery", "experiments", "reproduction", "scripts", "reproducao", "anexos"]) await cp(resolveRoot(folder), path.join(temp, folder), { recursive: true, filter: source => !source.split(path.sep).includes("node_modules") });
    for (const f of ["package.json", "package-lock.json"]) await cp(resolveRoot(f), path.join(temp, f));
    await symlink(resolveRoot("node_modules"), path.join(temp, "node_modules"), "dir");
    await symlink(resolveRoot("experiments/vertex-v18/node_modules"), path.join(temp, "experiments/vertex-v18/node_modules"), "dir");
    await writeFile(path.join(temp, "offline-guard.mjs"), "globalThis.fetch = () => { throw new Error('Teste de README proíbe rede'); };\n");
    const run = (args: string[]) => {
      const r = spawnSync(process.execPath, ["--import", "./offline-guard.mjs", "--import", "tsx", ...args], { cwd: temp, encoding: "utf8", timeout: 30000 });
      assert.equal(r.status, 0, r.stderr || r.stdout || String(r.error)); return r.stdout;
    };
    assert.equal(await exists(path.join(temp, "output")), false);
    run(["scripts/reproduce-delivery.ts", "--out", "generated"]);
    assert.equal(hash(await readFile(path.join(temp, "generated/publicacao.csv"), "utf8")), hash(await readFile(resolveRoot("publicacao.csv"), "utf8")));
    assert.equal(await exists(path.join(temp, "output")), false);
    run(["scripts/init-vertex-reproduction.ts", "--project", "projeto-reproducao"]);
    run(["src/index.ts", "prepare"]);
    run(["experiments/individual-v20/cli.ts", "--suite", "readme-check", "--limit", "1", "--dry-run"]);
    const plan = JSON.parse(await readFile(path.join(temp, "output/individual-v20/readme-check/plan.json"), "utf8"));
    assert.equal(plan.project, "projeto-reproducao"); assert.equal(plan.questions, 1);
    assert.equal(plan.minimumInferenceCalls, 2);
    assert.equal(plan.classifierModel, "gemini-3.5-flash-lite"); assert.equal(plan.judgeModel, "gemini-3.1-pro-preview");
    assert.equal(await exists(path.join(temp, "output/individual-v20/readme-check/requests.jsonl")), false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
