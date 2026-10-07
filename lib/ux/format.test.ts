import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtUsd, fmtBs, fmtBsCorto, enBs } from "./format.ts";

test("dólares con los separadores de Venezuela y 2 decimales por defecto", () => {
  assert.equal(fmtUsd(2447086), "$2.447.086,00");
  assert.equal(fmtUsd(600), "$600,00");
  assert.equal(fmtUsd(-1234.6), "-$1.234,60");
  assert.equal(fmtUsd(0), "$0,00");
});

test("no redondea: si la cifra tiene más decimales, se ven hasta 4", () => {
  assert.equal(fmtUsd(72.361), "$72,361");
  assert.equal(fmtUsd(21.2345), "$21,2345");
  assert.equal(fmtBs(855.6612), "855,6612 Bs");
});

test("bolívares completos, sin abreviar", () => {
  assert.equal(fmtBsCorto(855.66), "855,66 Bs");
  assert.equal(fmtBsCorto(2_093_894_500), "2.093.894.500,00 Bs");
});

test("sin tasa no se inventa un monto en bolívares", () => {
  assert.equal(enBs(100, null), null);
  assert.equal(enBs(100, 855.66), "85.566,00 Bs");
});
