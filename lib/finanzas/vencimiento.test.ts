import { test } from "node:test";
import assert from "node:assert/strict";
import { sumarDias, venceNotaEntrega } from "./vencimiento.ts";

test("la nota de entrega vence 30 días después de emitida", () => {
  assert.equal(venceNotaEntrega("2026-10-07"), "2026-11-06");
  assert.equal(venceNotaEntrega("2026-08-31"), "2026-09-30");
  assert.equal(venceNotaEntrega("2028-02-01"), "2028-03-02", "año bisiesto");
  assert.equal(sumarDias("2026-12-15", 30), "2027-01-14");
});
