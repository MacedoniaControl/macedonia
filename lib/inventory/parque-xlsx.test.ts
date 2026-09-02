import { test } from "node:test";
import assert from "node:assert/strict";
import { totalDeHoja } from "./parque-xlsx.ts";

/** Reproduce la hoja OXIG: encabezado en la fila 5, columnas ocultas, y el
 *  rotulo lejos del numero, en una banda de encabezados repetida mas abajo. */
function hojaOxig(): string[][] {
  const filas: string[][] = Array.from({ length: 90 }, () => []);
  filas[4] = ["", "ORDEN N°", "CLIENTE", "FECHA", "RECIBIDOS", "VENDIDOS", "Devueltos ", "Prestados ", "129", "22"];
  filas[5] = ["", "23", "", "45992", "124", "6", "30", "", "-1"];
  filas[78] = ["", "22803", "", "VENCEMOS", "45349", "-15", "Devueltos ", "Prestados", "TOTAL DE CILINDROS "];
  filas[82] = ["", "22883", "", "VENCEMOS", "45385", "-15", "0", "32", "#REF!"];
  return filas;
}

test("toma el total a la derecha de Prestados, no el rotulo ni la basura de abajo", () => {
  const r = totalDeHoja(hojaOxig());
  assert.equal(r?.total, 129);
  assert.equal(r?.celda, "I5");
});

test("confirma la columna con el rotulo aunque este 74 filas mas abajo", () => {
  assert.equal(totalDeHoja(hojaOxig())?.rotulo, "TOTAL DE CILINDROS");
});

test("una hoja sin rotulo igual entrega el total", () => {
  const filas: string[][] = Array.from({ length: 6 }, () => []);
  filas[4] = ["ORDEN N°", "CLIENTE", "FECHA", "RECIBIDOS", "VENDIDOS", "Devueltos ", "Prestados ", "17", "16"];
  const r = totalDeHoja(filas);
  assert.equal(r?.total, 17);
  assert.equal(r?.celda, "H5");
  assert.equal(r?.rotulo, null);
});

test("no confunde un #REF! con un conteo", () => {
  const filas: string[][] = [[], [], [], [], ["", "", "", "", "", "", "", "Prestados", "#REF!"]];
  assert.equal(totalDeHoja(filas), null);
});

test("una hoja que no calza devuelve null en vez de un numero inventado", () => {
  assert.equal(totalDeHoja([["a", "b"], ["c", "d"]]), null);
});
