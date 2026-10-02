import { test } from "node:test";
import assert from "node:assert/strict";
import { clientesConDeuda, liquidables, pendiente, totalElegido, type CuentaLiquidable } from "./liquidar.ts";

const c = (id: number, contraparte: string, saldo: number, extra: Partial<CuentaLiquidable> = {}): CuentaLiquidable =>
  ({ id, contraparte, documento: `NE-${id}`, estado: "abierta", vence: `2026-09-${String(10 + id).padStart(2, "0")}`, emitida: "2026-09-01", saldo, saldoNeto: saldo, ...extra });

test("solo se liquidan las abiertas con saldo", () => {
  const r = liquidables([c(1, "A", 10), c(2, "A", 0), c(3, "A", 5, { estado: "liquidada" })]);
  assert.deepEqual(r.map((x) => x.id), [1]);
});

test("lo que se abona es el saldo neto (sin el IVA retenido)", () => {
  assert.equal(pendiente({ saldo: 116, saldoNeto: 104 }), 104);
});

test("clientes con deuda, con sus notas de la más vieja a la más nueva", () => {
  const g = clientesConDeuda([c(3, "Avanti Pesca", 30), c(1, "AVANTI PESCA ", 10), c(2, "Otro", 100)]);
  assert.deepEqual(g.map((x) => [x.cliente, x.total, x.cuentas.map((y) => y.id)]), [["Otro", 100, [2]], ["Avanti Pesca", 40, [1, 3]]]);
});

test("total de lo elegido", () => {
  const cs = [c(1, "A", 10.105), c(2, "A", 20), c(3, "A", 5)];
  assert.equal(totalElegido(cs, new Set([1, 2])), 30.11);
});
