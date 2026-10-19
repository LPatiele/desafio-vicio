import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readBundle, reproduce, validateBundle } from "../reproduction/bundle.js";
import { initialize } from "../scripts/init-vertex-reproduction.js";
import { resolveRoot } from "../src/utils.js";

test("pacote público reproduz 359 decisões e o CSV de referência sem dependência de output", async () => {
  const value = await readBundle(resolveRoot("reproducao/v20-entrega.json.gz"));
  const result = reproduce(value);
  assert.equal(result.evaluation.overall.processed, 359);
  assert.equal(result.evaluation.overall.published, 284);
  assert.equal(result.delivery, value.files["publicacao.csv"]);
  assert.ok(!JSON.stringify(value).includes("/Users/"));
  const changed = structuredClone(value); changed.files["checkpoint.json"] += " ";
  assert.throws(() => reproduce(changed), /Integridade/);
  const unsafe = structuredClone(value); unsafe.files["../fora.json"] = "{}"; unsafe.hashes["../fora.json"] = "foo";
  assert.throws(() => validateBundle(unsafe), /Integridade/);
});

test("inicialização pública usa o projeto informado e bloqueia sobrescrita de histórico", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "readme-reproduction-"));
  try {
    await mkdir(path.join(temp, "anexos"));
    for (const f of ["questoes.jsonl", "temas.csv"]) await cp(resolveRoot("anexos", f), path.join(temp, "anexos", f));
    const archive = resolveRoot("reproducao/vertex-baseline.json.gz");
    await assert.rejects(initialize("PROJETO", temp, archive), /Informe seu projeto/);
    const first = await initialize("projeto-reproducao", temp, archive);
    const saved = await readFile(path.join(first.destination, "manifest.json"), "utf8");
    const manifest = JSON.parse(saved);
    assert.equal(manifest.vertex.project, "projeto-reproducao");
    assert.equal(manifest.vertex.creditName, null);
    assert.equal(manifest.config.direct.quotaScope, "vertex-projeto-reproducao-global");
    await assert.rejects(initialize("outro-projeto", temp, archive), /Não sobrescreva/);
    assert.equal(await readFile(path.join(first.destination, "manifest.json"), "utf8"), saved);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
