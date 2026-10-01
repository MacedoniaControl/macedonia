import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hojasXls, leerXls, pareceXls } from "./xls.ts";

// Archivos de prueba con datos inventados (lib/ux/__fixtures__), escritos con
// xlwt: el mismo formato BIFF8 que exporta Valery.
const archivo = (n: string): ArrayBuffer => {
  const b = readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

test("reconoce un .xls por su firma y no confunde un .xlsx", () => {
  assert.equal(pareceXls(archivo("ventas-completo.xls")), true);
  assert.equal(pareceXls(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]).buffer as ArrayBuffer), false);
});

test("nombres de las hojas, en orden", () => {
  assert.deepEqual(hojasXls(archivo("textos-largos.xls")), ["Textos", "Segunda"]);
});

test("textos con acentos y ñ, y una tabla de textos partida en varios registros", () => {
  const f = leerXls(archivo("textos-largos.xls"));
  assert.equal(f.length, 300);
  assert.equal(f[0][0], "Texto número 0 con ñ y tilde á");
  assert.equal(f[299][0], "Texto número 299 con ñ y tilde á".repeat(3));   // al final de la tabla, después de los cortes
  assert.equal(f[7][1], 10.5);
  assert.equal(f[7][2], -7);
});

test("lee la segunda hoja, con huecos", () => {
  const f = leerXls(archivo("textos-largos.xls"), 1);
  assert.equal(f[0][0], "hola");
  assert.deepEqual(f[1], []);
  assert.deepEqual(f[2], [null, null, null, 123456789.25]);
});

test("una hoja que no existe da un error claro", () => {
  assert.throws(() => leerXls(archivo("ventas-completo.xls"), 3), /no tiene la hoja 4/);
});

test("un archivo que no es .xls se rechaza", () => {
  assert.throws(() => leerXls(new Uint8Array(600).buffer as ArrayBuffer), /Excel 97-2003/);
});
