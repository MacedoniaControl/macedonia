import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANILLA_75, PLANILLA_75_SUDEMATIN, planilla75 } from "./planilla-75.ts";

test("cada empresa tiene su planilla de 75, sin repetidos", () => {
  for (const lista of [PLANILLA_75, PLANILLA_75_SUDEMATIN]) {
    assert.equal(lista.length, 75);
    assert.equal(new Set(lista).size, 75);
  }
  assert.equal(planilla75("sumigases"), PLANILLA_75);
  assert.equal(planilla75("sudematin"), PLANILLA_75_SUDEMATIN);
  assert.deepEqual(planilla75("otra"), []);
});

test("se llama «Los 75 de Mayor Rotación»; los conteos viejos se reconocen y se muestran así", async () => {
  const { ZONA_PLANILLA_75, esZona75, zonaVisible } = await import("./planilla-75.ts");
  assert.equal(ZONA_PLANILLA_75, "Los 75 de Mayor Rotación");
  assert.equal(esZona75("Planilla impresa de 75 productos"), true);
  assert.equal(zonaVisible("Planilla impresa de 75 productos"), "Los 75 de Mayor Rotación");
  assert.equal(zonaVisible("Todos los departamentos"), "Todos los departamentos");
  assert.equal(esZona75(null), false);
});
