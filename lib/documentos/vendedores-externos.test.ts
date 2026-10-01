import { test } from "node:test";
import assert from "node:assert/strict";
import { claveComision, claveVendedor, comisionesDe, nombresUsados, resumenVendedores, type DocExterno } from "./vendedores-externos.ts";

const d = (p: Partial<DocExterno> & Pick<DocExterno, "tipo" | "vendedorExterno" | "total">): DocExterno =>
  ({ id: Math.random(), correlativo: "1", fecha: "2026-09-01", cliente: "X", ...p });

test("el mismo vendedor escrito distinto es uno", () => {
  assert.equal(claveVendedor("  Juan  Pérez "), claveVendedor("JUAN PEREZ"));
  const r = resumenVendedores([d({ tipo: "cotizacion", vendedorExterno: "Juan Pérez", total: 100 }), d({ tipo: "nota_entrega", vendedorExterno: "JUAN PEREZ", total: 60 })], { general: null, porVendedor: {} });
  assert.equal(r.length, 1);
  assert.equal(r[0].cotizado, 100);
  assert.equal(r[0].vendido, 60);
  assert.equal(r[0].conversion, 60);
});

test("la comisión es sobre lo vendido; el porcentaje propio manda sobre el general", () => {
  const docs = [
    d({ tipo: "nota_entrega", vendedorExterno: "Ana", total: 1000 }),
    d({ tipo: "cotizacion", vendedorExterno: "Ana", total: 5000 }),
    d({ tipo: "nota_entrega", vendedorExterno: "Luis", total: 200 }),
  ];
  const r = resumenVendedores(docs, { general: 5, porVendedor: { LUIS: 10 } });
  assert.deepEqual(r.map((f) => [f.nombre, f.pct, f.propio, f.comision]), [["Ana", 5, false, 50], ["Luis", 10, true, 20]]);
});

test("sin porcentaje no hay comisión: no se inventa", () => {
  const r = resumenVendedores([d({ tipo: "nota_entrega", vendedorExterno: "Ana", total: 1000 })], { general: null, porVendedor: {} });
  assert.equal(r[0].comision, null);
  assert.equal(r[0].pct, null);
});

test("los porcentajes salen de la configuración; los inválidos se ignoran", () => {
  const c = comisionesDe({ comision_externos_pct: "3,5", [claveComision("Luis")]: "8", "comision_externo:MALO": "150", iva_pct: "16" });
  assert.deepEqual(c, { general: 3.5, porVendedor: { LUIS: 8 } });
  assert.equal(comisionesDe({ comision_externos_pct: "" }).general, null);
});

test("lo del personal (sin vendedor externo) no entra", () => {
  assert.equal(resumenVendedores([d({ tipo: "nota_entrega", vendedorExterno: null, total: 10 })], { general: 5, porVendedor: {} }).length, 0);
});

test("nombres para sugerir: uno por vendedor", () => {
  assert.deepEqual(nombresUsados(["Juan Pérez", "JUAN PEREZ", null, " Ana "]), ["Ana", "Juan Pérez"]);
});
