import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtUsd, fmtBsCorto, enBs } from "./format.ts";

test("dólares con los separadores de Venezuela", () => {
  assert.equal(fmtUsd(2447086), "$2.447.086");
  assert.equal(fmtUsd(-1234.6), "-$1.235");
  assert.equal(fmtUsd(0), "$0");
});

test("bolívares enteros hasta 999.999.999", () => {
  assert.equal(fmtBsCorto(855.66), "856 Bs");
  assert.equal(fmtBsCorto(999_999_999), "999.999.999 Bs");
});

test("bolívares grandes en millones y billones, sin desbordar la tarjeta", () => {
  assert.equal(fmtBsCorto(2_093_894_500), "2.093,9 millones de Bs");
  assert.equal(fmtBsCorto(1_234_567_890_123_456), "1.234,57 billones de Bs");
  assert.ok(fmtBsCorto(9_999_999_999_999_999).length <= 24);
});

test("sin tasa no se inventa un monto en bolívares", () => {
  assert.equal(enBs(100, null), null);
  assert.equal(enBs(100, 855.66), "85.566 Bs");
});
