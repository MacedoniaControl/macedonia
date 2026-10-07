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
    ["Facturas", 180, 3, 2], ["Notas de Entrega", 50, 3, 2], ["Ajustes", 20, 1, 1],
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
  assert.equal(t.proveedores, 5);
});
