import { test } from "node:test";
import assert from "node:assert/strict";
import { mesesCompletos, mesesDesdeValery } from "./cierre-valery.ts";

const venta = (tipo: string, cliente: string, neto: number, costo: number, extra: Record<string, unknown> = {}) =>
  ({ origen: "venta", fecha: "2026-09-10", tipo, cliente, cantidad: 2, neto_usd: neto, costo_usd: costo, neto_bs: neto * 100, costo_bs: costo * 100, anulado: "F", ...extra });
const compra = (tipo: string, neto: number, extra: Record<string, unknown> = {}) =>
  ({ origen: "compra", fecha: "2026-09-12", tipo, rif: "J-12345678-9", neto_usd: neto, neto_bs: neto * 100, facturada: "F", ...extra });

test("venta y costo: FAC y NET suman, la DEV resta, lo anulado no cuenta", () => {
  const [m] = mesesDesdeValery([
    venta("NET", "CLIENTE A", 100, 60),
    venta("FAC", "CLIENTE B", 50, 20),
    venta("DEV", "CLIENTE A", 10, 6),
    venta("NET", "CLIENTE C", 999, 1, { anulado: "T" }),
  ], "sumigases");
  assert.equal(m.ym, "2026-09");
  assert.equal(m.venta, 140);
  assert.equal(m.costo, 74);
  assert.equal(m.ventaBs, 14000);
  assert.equal(m.renglones, 3);
});

test("lo que una factura cobra de una nota de entrega ya se contó con la nota", () => {
  const [m] = mesesDesdeValery([
    venta("NET", "CLIENTE A", 100, 60),
    // Los dos del renglón vienen de la nota: no suma nada.
    venta("FAC", "CLIENTE A", 100, 60, { de_notas: 2 }),
    // Uno de dos viene de una nota: cuenta la mitad.
    venta("FAC", "CLIENTE B", 40, 10, { de_notas: 1 }),
  ], "sumigases");
  assert.equal(m.venta, 120);
  assert.equal(m.costo, 65);
  assert.equal(m.facturasDeNotas, 120);
});

test("lo del grupo y el consumo propio no son venta", () => {
  const [m] = mesesDesdeValery([
    venta("NET", "SUDEMATIN & GM, C.A.", 500, 300),
    venta("NET", "SUMIGASES ORIENTE, C.A.", 80, 50),
    venta("NET", "CLIENTE A", 100, 60),
  ], "sumigases");
  assert.equal(m.venta, 100);
  assert.equal(m.entreEmpresas, 500);
  assert.equal(m.consumoPropio, 80);
});

test("compras: la recepción con factura cuenta una vez; devolución y nota de crédito restan", () => {
  const [m] = mesesDesdeValery([
    compra("RCM", 100, { facturada: "T" }),
    compra("FCM", 100),
    compra("RCM", 30),
    compra("DCM", 5),
    compra("NCR", 10),
    compra("NDB", 2),
  ], "sumigases");
  assert.equal(m.compra, 117);
  assert.equal(m.compras, 5);
});

test("a Sudematin no le cuenta lo que le compra a Sumigases; a Sumigases sí lo que registra a nombre de Sudematin", () => {
  const filas = [compra("RCM", 100, { rif: "J-502789510" }), compra("RCM", 40, { rif: "J-31697141-4" })];
  assert.equal(mesesDesdeValery(filas, "sudematin")[0].compra, 40);
  assert.equal(mesesDesdeValery(filas, "sumigases")[0].compra, 140);
});

test("sin monto en dólares no se inventa: se cuenta aparte", () => {
  const [m] = mesesDesdeValery([venta("NET", "CLIENTE A", 100, 60), { ...venta("NET", "CLIENTE B", 0, 0), neto_usd: null }], "sumigases");
  assert.equal(m.venta, 100);
  assert.equal(m.sinMonto, 1);
});

test("cada fila va a su mes", () => {
  const ms = mesesDesdeValery([venta("NET", "A", 10, 5), { ...venta("NET", "A", 20, 5), fecha: "2026-10-01" }, { ...compra("FCM", 7), fecha: "2026-10-31" }], "sumigases");
  assert.deepEqual(ms.map((m) => [m.ym, m.venta, m.compra]), [["2026-09", 10, 0], ["2026-10", 20, 7]]);
});

test("solo se cierran los meses que el rango cubre enteros", () => {
  assert.deepEqual(mesesCompletos("2026-09-01", "2026-10-31"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesCompletos("2026-09-02", "2026-10-31"), ["2026-10"]);
  assert.deepEqual(mesesCompletos("2026-09-01", "2026-10-30"), ["2026-09"]);
  assert.deepEqual(mesesCompletos("2026-12-01", "2027-02-28"), ["2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(mesesCompletos("2026-11-01", "2026-11-13"), []);
});
