import { test } from "node:test";
import assert from "node:assert/strict";
import { sumarDias, venceNotaEntrega } from "./vencimiento.ts";

test("la nota de entrega vence el mismo día del mes siguiente", () => {
  assert.equal(venceNotaEntrega("2026-08-13"), "2026-09-13");
  assert.equal(venceNotaEntrega("2026-10-07"), "2026-11-07");
  assert.equal(venceNotaEntrega("2026-12-15"), "2027-01-15", "cambio de año");
  assert.equal(venceNotaEntrega("2026-01-28"), "2026-02-28");
  assert.equal(venceNotaEntrega("2026-07-30"), "2026-08-30");
});

test("si es un 31 o el fin de febrero, 30 días exactos", () => {
  assert.equal(venceNotaEntrega("2026-07-31"), "2026-08-30");
  assert.equal(venceNotaEntrega("2026-08-31"), "2026-09-30");
  assert.equal(venceNotaEntrega("2026-02-28"), "2026-03-30");
  assert.equal(venceNotaEntrega("2028-02-29"), "2028-03-30", "año bisiesto");
});

test("si el mes siguiente no tiene ese día, también 30 días exactos", () => {
  assert.equal(venceNotaEntrega("2026-01-29"), "2026-02-28");
  assert.equal(venceNotaEntrega("2026-01-30"), "2026-03-01");
  assert.equal(venceNotaEntrega("2026-03-30"), "2026-04-30", "abril sí tiene 30");
  assert.equal(sumarDias("2026-12-15", 30), "2027-01-14");
});
