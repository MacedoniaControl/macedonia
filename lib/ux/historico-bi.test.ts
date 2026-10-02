import { test } from "node:test";
import assert from "node:assert/strict";
import { abreviar, agrupar, aniosDe, marcasEje, mesesEnVentana, resumir, variacion } from "./historico-bi.ts";
import { HISTORY, type HistMonth } from "./history-data.ts";

const m = (ym: string, venta: number, costo: number, compra = 0): HistMonth => ({
  ym, venta, costo, util: venta - costo, compra,
  ventaBs: venta * 100, costoBs: costo * 100, utilBs: (venta - costo) * 100, compraBs: compra * 100,
});
const MESES = [m("2024-11", 100, 60, 50), m("2024-12", 200, 120, 80), m("2025-01", 150, 90, 70), m("2025-02", 50, 30, 10), m("2025-04", 300, 150, 200)];

test("la ventana: últimos N meses, todo o un año", () => {
  assert.deepEqual(mesesEnVentana(MESES, "2m").map((x) => x.ym), ["2025-02", "2025-04"]);
  assert.equal(mesesEnVentana(MESES, "todo").length, 5);
  assert.deepEqual(mesesEnVentana(MESES, "2024").map((x) => x.ym), ["2024-11", "2024-12"]);
  assert.deepEqual(aniosDe(MESES), ["2024", "2025"]);
});

test("agrupar por trimestre y por año suma los meses de cada uno", () => {
  const t = agrupar(MESES, "trimestre", "usd");
  assert.deepEqual(t.map((p) => [p.etiqueta, p.venta]), [["T4 24", 300], ["T1 25", 200], ["T2 25", 300]]);
  assert.equal(t[0].etiquetaLarga, "4.º trimestre 2024");
  const a = agrupar(MESES, "anio", "usd");
  assert.deepEqual(a.map((p) => [p.clave, p.venta, p.util, p.compra]), [["2024", 300, 120, 130], ["2025", 500, 230, 280]]);
  assert.equal(a[1].margen, 46);
  assert.equal(a[1].roi, 85.2);
});

test("en bolívares usa lo facturado, no dólares por una tasa", () => {
  const p = agrupar(MESES, "mes", "bs")[0];
  assert.equal(p.venta, 10_000);
  assert.equal(p.etiqueta, "nov 24");
  assert.equal(p.etiquetaLarga, "noviembre 2024");
});

test("el mes incompleto se marca en su período", () => {
  const t = agrupar(MESES, "trimestre", "usd", ["2025-02"]);
  assert.deepEqual(t.map((p) => p.incompleto), [false, true, false]);
});

test("el resumen sale de los totales, no de promediar márgenes", () => {
  const r = resumir(agrupar(MESES, "mes", "usd"));
  assert.equal(r.venta, 800);
  assert.equal(r.util, 350);
  assert.equal(r.margen, 43.8);
  assert.equal(r.promedio, 160);
  assert.equal(r.mejor?.clave, "2025-04");
  assert.equal(resumir([]).mejor, null);
});

test("variación contra el período anterior", () => {
  assert.equal(variacion(150, 100), 50);
  assert.equal(variacion(50, 100), -50);
  assert.equal(variacion(10, 0), null);
  assert.equal(variacion(10, undefined), null);
});

test("marcas del eje redondas y que cubren el máximo", () => {
  assert.deepEqual(marcasEje(96_239), [0, 25_000, 50_000, 75_000, 100_000]);
  assert.deepEqual(marcasEje(0), [0]);
  const t = marcasEje(69_737_399);
  assert.ok(t[t.length - 1] >= 69_737_399 && t.length <= 6);
});

test("montos abreviados para el eje", () => {
  assert.equal(abreviar(85_000, "usd"), "$85 mil");
  assert.equal(abreviar(1_250_000, "usd"), "$1,3 M");
  assert.equal(abreviar(69_737_399, "bs"), "70 M Bs");
  assert.equal(abreviar(0, "usd"), "$0");
});

test("con el histórico real, la suma de los años es el total de cada empresa", () => {
  for (const e of ["sumigases", "sudematin"] as const) {
    const h = HISTORY[e];
    const r = resumir(agrupar(mesesEnVentana(h.months, "todo"), "anio", "usd"));
    assert.equal(r.venta, h.totals.venta);
    assert.equal(r.util, h.totals.util);
    assert.equal(resumir(agrupar(h.months, "mes", "bs")).venta, h.totals.ventaBs);
  }
});
