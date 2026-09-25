import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCantidad, movimientoDeAjuste, planConteoRampa } from "./rampa.ts";

const actual = { lleno: { OXIGENO: 56, ARGON: 16 }, vacio: { ARGON: 1 } };
const gases = ["OXIGENO", "ARGON", "CO2"];

test("sin diferencias no hay ajustes", () => {
  const r = planConteoRampa([{ gas: "OXIGENO", contado: { lleno: 56, vacio: 0 }, visto: { lleno: 56, vacio: 0 } }], actual, gases);
  assert.deepEqual(r, { ok: true, ajustes: [] });
});

test("sobrantes y faltantes salen con su signo y cuadran con lo contado", () => {
  const r = planConteoRampa([
    { gas: "OXIGENO", contado: { lleno: 50, vacio: 4 }, visto: { lleno: 56, vacio: 0 } },
    { gas: "ARGON", contado: { lleno: 16, vacio: 0 }, visto: { lleno: 16, vacio: 1 } },
  ], actual, gases);
  assert.ok(r.ok);
  assert.deepEqual(r.ajustes, [
    { gas: "OXIGENO", estado: "lleno", antes: 56, ahora: 50, diferencia: -6 },
    { gas: "OXIGENO", estado: "vacio", antes: 0, ahora: 4, diferencia: 4 },
    { gas: "ARGON", estado: "vacio", antes: 1, ahora: 0, diferencia: -1 },
  ]);
  // Aplicar los movimientos deja el saldo exactamente en lo contado.
  for (const a of r.ajustes) {
    const m = movimientoDeAjuste(a);
    const delta = (m.hacia === a.estado ? m.cantidad : 0) - (m.desde === a.estado ? m.cantidad : 0);
    assert.equal(a.antes + delta, a.ahora);
  }
});

test("un gas sin movimientos todavía se puede contar", () => {
  const r = planConteoRampa([{ gas: "CO2", contado: { lleno: 3, vacio: 0 }, visto: { lleno: 0, vacio: 0 } }], actual, gases);
  assert.ok(r.ok);
  assert.deepEqual(movimientoDeAjuste(r.ajustes[0]), { gas: "CO2", cantidad: 3, desde: null, hacia: "lleno" });
});

test("si la Rampa cambió mientras se contaba, no guarda", () => {
  const r = planConteoRampa([{ gas: "OXIGENO", contado: { lleno: 50, vacio: 0 }, visto: { lleno: 58, vacio: 0 } }], actual, gases);
  assert.equal(r.ok, false);
});

test("rechaza negativos, decimales, gases inactivos y repetidos", () => {
  const l = (gas: string, lleno: number) => ({ gas, contado: { lleno, vacio: 0 }, visto: { lleno: actual.lleno[gas as "OXIGENO"] ?? 0, vacio: 0 } });
  assert.equal(planConteoRampa([l("OXIGENO", -1)], actual, gases).ok, false);
  assert.equal(planConteoRampa([l("OXIGENO", 2.5)], actual, gases).ok, false);
  assert.equal(planConteoRampa([l("HELIO", 1)], actual, gases).ok, false);
  assert.equal(planConteoRampa([l("OXIGENO", 1), l("OXIGENO", 2)], actual, gases).ok, false);
});

test("el campo de cantidad acepta quedar vacío mientras se escribe", () => {
  assert.equal(leerCantidad(""), null);
  assert.equal(leerCantidad(" 12 "), 12);
  assert.equal(leerCantidad("0"), 0);
  assert.equal(leerCantidad("-3"), null);
  assert.equal(leerCantidad("1.5"), null);
});
