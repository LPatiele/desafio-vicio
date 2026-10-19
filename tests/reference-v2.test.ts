import test from "node:test";
import assert from "node:assert/strict";
import { loadData } from "../src/data.js";
import { loadReference } from "../src/evaluation.js";

test("referência v2 preserva IDs e v1, corrige CPP409 e só participa da avaliação", async () => {
  const data = await loadData();
  const first = await loadReference(data), second = await loadReference(data, "analise-propria-v2");
  assert.notEqual(first.hash, second.hash);
  assert.equal(second.hash, "7b69291c6a26c387a6f5606ee7b7032f2c383b8073afdab0e487ea6cac0951e8");
  assert.deepEqual(first.items.map(i => i.id), second.items.map(i => i.id));
  assert.equal(first.items.find(i => i.id === "Q0028")!.classificacao.tema_id, "5526");
  assert.equal(second.items.find(i => i.id === "Q0028")!.classificacao.tema_id, "5524");
  await assert.rejects(() => loadReference(data, "../analise-propria-v1"), /inválida/);
  await assert.rejects(() => loadReference({ ...data, inputHashes: {} }, "analise-propria-v2"), /divergem/);
});
