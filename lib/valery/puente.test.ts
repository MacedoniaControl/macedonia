import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNAS_VENTAS, leerVentas, type Celda } from "../inventory/ventas-valery.ts";
import { conectado, errorDeRango, haceCuanto, renglonesDesdePuente, type FilaVentaPuente } from "./puente.ts";

// El mismo documento, como lo exporta Valery a Excel (formato completo) y como
// lo lee el agente de la base. Casos reales de febrero de 2026: neto con
// decimales, una DEV (positiva en la base, negativa en el Excel) y dos
// renglones idénticos en el mismo documento.
const excel = (filas: Celda[][]) => leerVentas([[...COLUMNAS_VENTAS.completo], ...filas]);
const fila = (fecha: number, tipo: string, doc: string, cli: string, cant: number, prod: string, cod: string, neto: number, tasa: number): Celda[] =>
  [fecha, tipo, doc, cli, cant, prod, cod, neto, 0, 0, 0, tasa, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

test("el agente y el Excel dan las mismas claves para los mismos renglones", () => {
  // 46028 = 2026-01-06 en número de serie de Excel.
  const x = excel([
    fila(46028, "FAC", "0000001070", "SERVICIOS Y SUMINISTRO", 2, "OXIGENO GASEOSO CIL 6M", "OXI6", 13558.6, 308.15),
    fila(46028, "NET", "0000006700", "ECODESARROLLO", 1.5, "ACETILENO", "ACE1", 1234.565, 308.15),
    fila(46028, "NET", "0000006700", "ECODESARROLLO", 1.5, "ACETILENO", "ACE1", 1234.565, 308.15),
    fila(46028, "DEV", "0000000432", "CLIENTE X", 3, "ELECTRODO", "E6010", -176747.5, 308.15),
  ]);
  const p = renglonesDesdePuente([
    { fecha: "2026-01-06", tipo: "FAC", documento: "0000001070", cliente: "SERVICIOS Y SUMINISTRO", codigo: "OXI6", producto: "OXIGENO GASEOSO CIL 6M", cantidad: 2, neto: 13558.6, tasa: 308.15 },
    { fecha: "2026-01-06", tipo: "NET", documento: "0000006700", cliente: "ECODESARROLLO", codigo: "ACE1", producto: "ACETILENO", cantidad: 1.5, neto: 1234.565, tasa: 308.15 },
    { fecha: "2026-01-06", tipo: "NET", documento: "0000006700", cliente: "ECODESARROLLO", codigo: "ACE1", producto: "ACETILENO", cantidad: 1.5, neto: 1234.565, tasa: 308.15 },
    { fecha: "2026-01-06", tipo: "DEV", documento: "0000000432", cliente: "CLIENTE X", codigo: "E6010", producto: "ELECTRODO", cantidad: 3, neto: 176747.5, tasa: 308.15 },
  ]);
  assert.deepEqual(p.renglones.map((r) => r.clave), x.renglones.map((r) => r.clave));
  assert.equal(p.renglones[3].netoBs, -176747.5, "la DEV entra en negativo, como en el Excel");
  assert.equal(p.renglones[2].clave.endsWith("|2"), true, "el segundo renglón idéntico se separa con el contador");
});

test("descarta lo que no es una venta legible", () => {
  const malas: FilaVentaPuente[] = [
    { fecha: "2026-01-06", tipo: "PRS", documento: "1", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 1, tasa: 1 },
    { fecha: "2026-01-06", tipo: "FAC", documento: "1", cliente: "", codigo: "", producto: "", cantidad: 1, neto: 1, tasa: 1 },
    { fecha: "06/01/2026", tipo: "FAC", documento: "1", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 1, tasa: 1 },
    { fecha: "2026-01-06", tipo: "FAC", documento: "1", cliente: "", codigo: "A", producto: "", cantidad: 0, neto: 1, tasa: 1 },
  ];
  const r = renglonesDesdePuente(malas);
  assert.equal(r.renglones.length, 0);
  assert.equal(r.descartadas, 4);
});

test("la venta en dólares sale del neto y la tasa; sin tasa, cero (no se inventa)", () => {
  const [a, b] = renglonesDesdePuente([
    { fecha: "2026-02-02", tipo: "FAC", documento: "1106", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 3702.5, tasa: 370.25 },
    { fecha: "2026-02-02", tipo: "FAC", documento: "1107", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 100, tasa: 0 },
  ]).renglones;
  assert.equal(a.ventaUsd, 10);
  assert.equal(b.ventaUsd, 0);
});

test("rango de fechas para pedir ventas", () => {
  assert.equal(errorDeRango("2026-02-01", "2026-02-28"), null);
  assert.match(errorDeRango("2026-03-01", "2026-02-01") ?? "", /posterior/);
  assert.match(errorDeRango("2024-01-01", "2026-02-01") ?? "", /400/);
  assert.match(errorDeRango("", "2026-02-01") ?? "", /dos fechas/);
});

test("conexión del agente: conectado si habló hace menos de 2 minutos", () => {
  const ahora = Date.parse("2026-10-24T12:00:00Z");
  assert.equal(conectado("2026-10-24T11:59:30Z", ahora), true);
  assert.equal(conectado("2026-10-24T11:57:00Z", ahora), false);
  assert.equal(conectado(null, ahora), false);
  assert.equal(haceCuanto("2026-10-24T11:59:30Z", ahora), "hace 30 s");
  assert.equal(haceCuanto(null, ahora), "nunca");
});
