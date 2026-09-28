import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { aNumero, aFecha } from "./importar-cuentas.ts";

describe("aNumero", () => {
  test("formato venezolano: punto de miles, coma decimal", () => {
    assert.equal(aNumero("1.234,56"), 1234.56);
    assert.equal(aNumero("17.376,44"), 17376.44);
  });
  test("formato ingles: coma de miles, punto decimal", () => {
    assert.equal(aNumero("1,234.56"), 1234.56);
  });
  test("coma sola con dos decimales es decimal", () => {
    assert.equal(aNumero("84,00"), 84);
    assert.equal(aNumero("195,5"), 195.5);
  });
  test("coma sola con tres digitos detras es de miles", () => {
    assert.equal(aNumero("1,234"), 1234);
  });
  test("saca el simbolo de moneda y los espacios", () => {
    assert.equal(aNumero(" $ 528,00 "), 528);
  });
  test("vacio o basura devuelve null, no NaN", () => {
    assert.equal(aNumero(""), null);
    assert.equal(aNumero("   "), null);
    assert.equal(aNumero("abc"), null);
  });
});

describe("aFecha", () => {
  test("ISO pasa tal cual", () => {
    assert.equal(aFecha("2026-08-26"), "2026-08-26");
  });
  test("dd/mm/aaaa se convierte", () => {
    assert.equal(aFecha("26/08/2026"), "2026-08-26");
    assert.equal(aFecha("5/8/2026"), "2026-08-05");
  });
  test("dd-mm-aaaa tambien", () => {
    assert.equal(aFecha("26-08-2026"), "2026-08-26");
  });
  test("lo que no entiende devuelve null en vez de una fecha inventada", () => {
    assert.equal(aFecha("ayer"), null);
    assert.equal(aFecha(""), null);
  });
});
