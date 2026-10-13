import { test } from "node:test";
import assert from "node:assert/strict";
import { filasDe, prepararMaster, resumirMaster, vistaInicial } from "./master-vista.ts";

const f = (codigo: string, valery: number, contado: number | null, fecha: string | null, costo: number | null = 2) => ({
  codigo, nombre: `P ${codigo}`, unidad: "UND", costo, valery, contado, fechaConteo: fecha, zona: null,
  diferencia: contado === null ? null : contado - valery,
});
const HOY = "2026-10-13";

test("nunca contado no es cero: va a «por contar», no a diferencias", () => {
  const fs = prepararMaster([f("A", 10, null, null), f("B", 0, null, null), f("C", -5, null, null)], HOY);
  const r = resumirMaster(fs);
  assert.equal(r.porContar, 1);          // solo A: tiene existencia y nadie lo contó
  assert.equal(r.diferencias, 0);
  assert.equal(r.negativos, 1);          // C va a «revisar en Valery»
  assert.deepEqual(filasDe(fs, "contar").map((x) => x.codigo), ["A"]);
  assert.deepEqual(filasDe(fs, "valery").map((x) => x.codigo), ["C"]);
});

test("por contar: primero lo nunca contado, y dentro lo que más vale; un conteo viejo vuelve a la lista", () => {
  const fs = prepararMaster([
    f("BARATO", 100, null, null, 0.1), f("CARO", 5, null, null, 50), f("VIEJO", 50, 50, "2026-08-01"), f("RECIENTE", 50, 50, "2026-10-10"),
  ], HOY);
  assert.deepEqual(filasDe(fs, "contar").map((x) => x.codigo), ["CARO", "BARATO", "VIEJO"]);
  const r = resumirMaster(fs);
  assert.equal(r.verificados, 1);        // solo RECIENTE
  assert.equal(r.conExistencia, 4);
});

test("diferencias en unidades y en dinero, la que más pesa primero", () => {
  const fs = prepararMaster([f("F", 10, 7, "2026-10-12", 5), f("S", 4, 6, "2026-10-12", 1), f("OK", 3, 3, "2026-10-12")], HOY);
  const r = resumirMaster(fs);
  assert.deepEqual([r.diferencias, r.faltanteUnidades, r.sobranteUnidades, r.faltante, r.sobrante], [2, 3, 2, 15, 2]);
  assert.deepEqual(filasDe(fs, "diferencias").map((x) => x.codigo), ["F", "S"]);
  assert.equal(vistaInicial(r), "diferencias");
});

test("sin permiso de costos no hay montos, y se ordena por existencia", () => {
  const fs = prepararMaster([f("A", 3, null, null, null), f("B", 9, null, null, null)], HOY);
  const r = resumirMaster(fs);
  assert.equal(r.conCosto, false);
  assert.equal(r.faltante, null);
  assert.deepEqual(filasDe(fs, "contar").map((x) => x.codigo), ["B", "A"]);
});

test("una empresa sin existencia cargada ni conteos se reconoce como vacía", () => {
  assert.equal(resumirMaster(prepararMaster([f("A", 0, null, null), f("B", 0, null, null)], HOY)).vacio, true);
  assert.equal(resumirMaster(prepararMaster([f("A", 0, 2, "2026-10-01")], HOY)).vacio, false);
});
