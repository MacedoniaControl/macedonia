import { test } from "node:test";
import assert from "node:assert/strict";
import { ariaOrden, gravedad, ordenar, siguienteOrden, type ClaveOrden } from "./orden-cartera.ts";

type F = { n: string; saldo: number; vence: string | null; dias: number | null };
const filas: F[] = [
  { n: "B", saldo: 50, vence: "2026-09-01", dias: -31 },
  { n: "A", saldo: 500, vence: "2026-10-05", dias: 3 },
  { n: "C", saldo: 0, vence: null, dias: null },
  { n: "D", saldo: 120, vence: "2025-01-10", dias: -630 },
];
const valor = (f: F, k: ClaveOrden) =>
  k === "nombre" ? f.n : k === "saldo" ? f.saldo : k === "vence" ? f.vence : k === "estado" ? gravedad(f.saldo, f.dias) : null;
const nombres = (o: Parameters<typeof ordenar>[1]) => ordenar(filas, o, valor).map((f) => f.n).join("");

test("el primer toque en saldo va de mayor a menor; el segundo lo invierte", () => {
  const o1 = siguienteOrden(null, "saldo");
  assert.deepEqual(o1, { clave: "saldo", dir: "desc" });
  assert.equal(nombres(o1), "ADBC");
  const o2 = siguienteOrden(o1, "saldo");
  assert.equal(nombres(o2), "CBDA");
});

test("vence empieza por lo más viejo y lo que no vence va al final en ambas direcciones", () => {
  const o1 = siguienteOrden(null, "vence");
  assert.equal(nombres(o1), "DBAC");
  assert.equal(nombres(siguienteOrden(o1, "vence")), "ABDC");
});

test("estado: primero lo más vencido, luego lo por vencer, al fondo lo pagado", () => {
  assert.equal(nombres(siguienteOrden(null, "estado")), "DBAC");
  assert.equal(gravedad(10, -5, true), null, "una liquidada cuenta como pagada");
});

test("cambiar de columna empieza por la dirección de esa columna", () => {
  assert.deepEqual(siguienteOrden({ clave: "saldo", dir: "asc" }, "nombre"), { clave: "nombre", dir: "asc" });
});

test("sin orden deja la lista como venía y no la muta", () => {
  assert.equal(ordenar(filas, null, valor), filas);
  ordenar(filas, { clave: "saldo", dir: "desc" }, valor);
  assert.equal(filas[0].n, "B");
});

test("aria-sort solo en la columna activa", () => {
  assert.equal(ariaOrden({ clave: "monto", dir: "desc" }, "monto"), "descending");
  assert.equal(ariaOrden({ clave: "monto", dir: "desc" }, "saldo"), "none");
});
