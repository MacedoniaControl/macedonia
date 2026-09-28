import { test } from "node:test";
import assert from "node:assert/strict";
import { aFechaPlantilla, claveCuenta, COLUMNAS, errorDePlantilla, HOJA, HOJA_MARCA, leerPlantilla, MARCA } from "./plantilla-cuentas.ts";

const hojas = [HOJA.cobrar, HOJA_MARCA];

test("la plantilla correcta pasa", () => {
  assert.equal(errorDePlantilla("cobrar", hojas, MARCA.cobrar, COLUMNAS.cobrar), null);
});

test("un archivo cualquiera se rechaza, aunque tenga columnas parecidas", () => {
  const e = errorDePlantilla("cobrar", ["Hoja1"], null, ["Cliente", "Documento", "Monto"]);
  assert.match(e ?? "", /no es la plantilla de Cuentas por Cobrar/);
});

test("la plantilla de pagar subida en cobrar se rechaza y dice cuál es", () => {
  const e = errorDePlantilla("cobrar", [HOJA.pagar, HOJA_MARCA], MARCA.pagar, COLUMNAS.pagar);
  assert.match(e ?? "", /plantilla de Cuentas por Pagar/);
});

test("si se cambian los títulos o el orden, se rechaza y dice dónde", () => {
  const cab = [...COLUMNAS.cobrar];
  [cab[2], cab[3]] = [cab[3], cab[2]];
  assert.match(errorDePlantilla("cobrar", hojas, MARCA.cobrar, cab) ?? "", /columna C debía decir «Fecha de emisión»/);
  assert.match(errorDePlantilla("cobrar", hojas, MARCA.cobrar, [...COLUMNAS.cobrar, "Extra"]) ?? "", /columna G/);
});

test("fechas: dd/mm/aaaa, ISO y el número de serie de Excel", () => {
  assert.equal(aFechaPlantilla("05/09/2026"), "2026-09-05");
  assert.equal(aFechaPlantilla("2026-09-05"), "2026-09-05");
  assert.equal(aFechaPlantilla("46270"), "2026-09-05");
  assert.equal(aFechaPlantilla("31/13/2026"), null);
  assert.equal(aFechaPlantilla("mañana"), null);
});

test("lee las filas, salta las repetidas y explica las malas", () => {
  const existentes = new Set([claveCuenta("DRAPCOM, C.A.", "NE-0001")]);
  const r = leerPlantilla([
    COLUMNAS.cobrar,
    ["Drapcom C.A.", "ne-0001", "01/09/2026", "15/09/2026", "100", ""],
    ["COSTA NORTE", "NE-0002", "01/09/2026", "15/09/2026", "1.234,56", "abono pendiente"],
    ["COSTA NORTE", "NE-0002", "01/09/2026", "15/09/2026", "10", ""],
    ["COSTA NORTE", "NE-0003", "20/09/2026", "15/09/2026", "10", ""],
    ["", "", "", "", "", ""],
    ["COSTA NORTE", "NE-0004", "01/09/2026", "15/09/2026", "0", ""],
  ], existentes);
  assert.deepEqual(r.filas, [{ contraparte: "COSTA NORTE", documento: "NE-0002", emitida: "2026-09-01", vence: "2026-09-15", monto: 1234.56, nota: "abono pendiente" }]);
  assert.equal(r.repetidas.length, 1);
  assert.deepEqual(r.problemas.map((p) => p.linea), [4, 5, 7]);
  assert.match(r.problemas[0].motivo, /dos veces en el archivo/);
  assert.match(r.problemas[1].motivo, /Vence antes de emitirse/);
});

test("una plantilla vacía lo dice", () => {
  assert.match(leerPlantilla([COLUMNAS.pagar], new Set()).problemas[0].motivo, /no tiene filas/);
});
