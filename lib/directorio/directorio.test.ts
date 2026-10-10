import { test } from "node:test";
import assert from "node:assert/strict";
import { armarDirectorio, coincide, iniciales, resumirCuentas, type CuentaDirectorio } from "./directorio.ts";

const cta = (id: number, contraparte: string, monto: number, abonado: number, dias: number, estado = "abierta"): CuentaDirectorio => ({
  id, contraparte, documento: `NE-${id}`, clase: "nota_entrega", monto, abonado, saldo: monto - abonado,
  emitida: "2026-09-01", vence: `2026-10-${String(10 + id).padStart(2, "0")}`, dias, estado,
});

test("el resumen: débitos, créditos, saldo y vencido", () => {
  const r = resumirCuentas([cta(1, "A", 100, 0, -5), cta(2, "A", 50, 20, 10), cta(3, "A", 30, 30, -20, "liquidada")]);
  assert.equal(r.documentos, 3);
  assert.equal(r.abiertos, 2);
  assert.equal(r.debitos, 180);
  assert.equal(r.creditos, 50);
  assert.equal(r.saldo, 130);
  assert.equal(r.vencido, 100);
  assert.equal(r.vencidos, 1);
  assert.equal(r.desde, "2026-10-11");
});

test("une fichas y cartera por nombre; lo de la cartera sin ficha también sale", () => {
  const fichas = [{ nombre: "ISMESOL", rif: "J-1" }, { nombre: "Cliente Sin Deuda", rif: null }];
  const cuentas = [cta(1, "ismesol ", 100, 0, 3), cta(2, "SERVICIOS Y SUMINISTROS V&B", 60, 0, -1)];
  const d = armarDirectorio("cliente", fichas, cuentas);
  assert.deepEqual(d.map((c) => [c.nombre, !!c.ficha, c.resumen.saldo]), [
    ["Cliente Sin Deuda", true, 0], ["ISMESOL", true, 100], ["SERVICIOS Y SUMINISTROS V&B", false, 60],
  ]);
  assert.equal(d[1].clave, "cliente:ISMESOL");
});

test("iniciales y búsqueda por nombre, RIF o código", () => {
  assert.equal(iniciales("SERVICIOS Y SUMINISTROS V&B"), "SS");
  assert.equal(iniciales("ISMESOL"), "IS");
  assert.equal(iniciales("Gases Unidos de Venezuela, C.A."), "GU");
  const c = { nombre: "FERREX", ficha: { rif: "J-30432675-1", codigo: "V30432675" } };
  assert.ok(coincide(c, "ferr"));
  assert.ok(coincide(c, "J304326751"));
  assert.ok(coincide(c, "v3043"));
  assert.ok(!coincide(c, "zzz"));
});
