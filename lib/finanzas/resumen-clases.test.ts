import { test } from "node:test";
import assert from "node:assert/strict";
import { porClase, resumenDe } from "./resumen-clases.ts";

const c = (clase: string, contraparte: string, saldoNeto: number, dias: number) => ({ clase: clase as never, contraparte, saldoNeto, dias });
const CS = [
  c("factura", "STAR GAS", 100, -5), c("factura", "star gas ", 50, 3), c("factura", "FEBECA", 30, 20),
  c("nota_entrega", "OXIORIENTE", 40, -1), c("nota_debito", "OXIORIENTE", 10, 5), c("nota_credito", "LUIS", 0, -9),
  c("ajuste", "X", 20, -100),
];

test("Facturas, Notas de Entrega (con débito y crédito) y Ajustes, en ese orden", () => {
  const r = porClase(CS);
  assert.deepEqual(r.map((s) => [s.nombre, s.total, s.cuentas, s.proveedores]), [
    // La nota de crédito de LUIS está en cero: no es una cuenta por pagar.
    ["Facturas", 180, 3, 2], ["Notas de Entrega", 50, 2, 1], ["Ajustes", 20, 1, 1],
  ]);
  assert.equal(r[0].vencido, 100);
  assert.equal(r[0].alerta, 50);
  assert.equal(r[1].vencidas, 1);
  assert.equal(r.reduce((a, s) => a + s.parte, 0), 100);
});

test("el consolidado suma los segmentos", () => {
  const t = resumenDe(CS);
  const s = porClase(CS);
  assert.equal(t.total, s.reduce((a, x) => a + x.total, 0));
  assert.equal(t.vencidas, s.reduce((a, x) => a + x.vencidas, 0));
  assert.equal(t.proveedores, 4);   // LUIS, en cero, no cuenta
  assert.equal(t.cuentas, s.reduce((a, x) => a + x.cuentas, 0));
});

test("una cuenta cerrada no suma al total a pagar aunque se haya cerrado con saldo", () => {
  const cs = [{ ...c("factura", "STAR GAS", 100, -5), estado: "liquidada" }, { ...c("factura", "STAR GAS", 40, -5), estado: "abierta" }, c("factura", "FEBECA", 10, 3)];
  const t = resumenDe(cs);
  assert.deepEqual([t.total, t.vencido, t.vencidas, t.alerta], [50, 40, 1, 10]);
  assert.equal(porClase(cs)[0].total, 50);
  // Y no cuenta como cuenta ni como proveedor por pagar.
  assert.deepEqual([t.cuentas, t.proveedores], [2, 2]);
  // Una clase con todo cerrado no aparece en el resumen.
  assert.deepEqual(porClase([{ ...c("ajuste", "X", 20, -1), estado: "liquidada" }, c("factura", "Y", 5, 1)]).map((s) => s.nombre), ["Facturas"]);
});
