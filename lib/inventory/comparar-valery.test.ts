import { test } from "node:test";
import assert from "node:assert/strict";
import { compararConValery } from "./comparar-valery.ts";

test("Macedonia contra Valery: coinciden, distintas, explicadas por los conteos y las que Valery no tiene", () => {
  const c = compararConValery(
    [
      { codigo: "OXI6", existencia: 5 }, { codigo: "ARG6", existencia: 30 }, { codigo: "6X8AT", existencia: 10 },
      { codigo: "20101", existencia: 89 }, { codigo: "VIEJO", existencia: 3 }, { codigo: "CERO", existencia: 0 },
    ],
    [
      { codigo: "OXI6", existencia: 5 }, { codigo: "ARG6", existencia: 20 }, { codigo: "ARG6", existencia: 10 },   // dos depósitos
      { codigo: "6x8AT", existencia: 4 },   // otro producto: las mayúsculas cuentan
      { codigo: "20101", existencia: 15, nombre: "SOLO EN VALERY" }, { codigo: "NUEVO", existencia: 7, nombre: "NUEVO EN VALERY" },
      { codigo: "CERO", existencia: 0 },
    ],
    new Map([["OXI6", "OXIGENO"]]),
    [{ codigo: "20101", cantidad: 74 }],   // el conteo CF-2026-000006 subió 74
  );
  const de = (k: string) => c.filas.find((f) => f.codigo === k);
  assert.equal(de("CERO"), undefined);                       // en cero en los dos: nada que comparar
  assert.deepEqual([de("ARG6")!.diferencia, de("OXI6")!.diferencia], [0, 0]);
  assert.deepEqual([de("6X8AT")!.valery, de("6X8AT")!.diferencia], [null, 10]);
  assert.deepEqual([de("6x8AT")!.macedonia, de("6x8AT")!.diferencia], [0, -4]);
  assert.deepEqual([de("20101")!.diferencia, de("20101")!.conteos, de("20101")!.sinExplicar], [74, 74, 0]);
  assert.equal(de("NUEVO")!.nombre, "NUEVO EN VALERY");
  assert.equal(de("OXI6")!.nombre, "OXIGENO");
  assert.deepEqual({ productos: c.productos, coinciden: c.coinciden, distintas: c.distintas, porConteo: c.porConteo, noEnValery: c.noEnValery },
    { productos: 7, coinciden: 2, distintas: 5, porConteo: 1, noEnValery: 2 });
});
