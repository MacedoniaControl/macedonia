import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtUsd, fmtBs, fmtBsCorto, enBs } from "./format.ts";

test("dólares con los separadores de Venezuela y 2 decimales por defecto", () => {
  assert.equal(fmtUsd(2447086), "$2.447.086,00");
  assert.equal(fmtUsd(600), "$600,00");
  assert.equal(fmtUsd(-1234.6), "-$1.234,60");
  assert.equal(fmtUsd(0), "$0,00");
});

test("se ven 2 decimales aunque la base guarde 4 (pedido del 13-10-2026)", () => {
  assert.equal(fmtUsd(72.361), "$72,36");
  assert.equal(fmtUsd(185.5978), "$185,60");
  assert.equal(fmtBs(855.6612), "855,66 Bs");
});

test("bolívares completos, sin abreviar", () => {
  assert.equal(fmtBsCorto(855.66), "855,66 Bs");
  assert.equal(fmtBsCorto(2_093_894_500), "2.093.894.500,00 Bs");
});

test("sin tasa no se inventa un monto en bolívares", () => {
  assert.equal(enBs(100, null), null);
  assert.equal(enBs(100, 855.66), "85.566,00 Bs");
});
