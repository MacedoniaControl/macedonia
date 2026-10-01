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
