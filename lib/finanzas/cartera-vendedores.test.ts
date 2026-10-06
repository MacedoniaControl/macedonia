import { test } from "node:test";
import assert from "node:assert/strict";
import { claveCliente, enCartera, porCartera, resumenCartera, vendedoresEnCartera } from "./cartera-vendedores.ts";

const c = (saldo: number, dias: number, vendedorExterno: string | null = null) => ({ saldo, dias, vendedorExterno });
const CS = [c(100, -10), c(50, 3), c(30, -5, "Francisco"), c(20, 20, "Francisco"), c(10, -1, "Pedro"), c(0, -30, "Francisco")];

test("filtrar por cartera y por vendedor", () => {
  assert.equal(CS.filter((x) => enCartera(x, "todas")).length, 6);
  assert.equal(CS.filter((x) => enCartera(x, "propia")).length, 2);
  assert.equal(CS.filter((x) => enCartera(x, "externos")).length, 4);
  assert.equal(CS.filter((x) => enCartera(x, "externos", "Pedro")).length, 1);
});

test("el resumen de cada cartera suma lo mismo que las tarjetas", () => {
  assert.deepEqual(resumenCartera(CS), { total: 210, vencido: 140, porVencer: 50, vencidas: 3 });
  const ext = resumenCartera(CS.filter((x) => enCartera(x, "externos")));
  assert.deepEqual(ext, { total: 60, vencido: 40, porVencer: 0, vencidas: 2 });
  const propia = resumenCartera(CS.filter((x) => enCartera(x, "propia")));
  assert.equal(propia.total + ext.total, 210, "propia + externos = todo");
});

test("los vendedores, sin repetir y en orden", () => {
  assert.deepEqual(vendedoresEnCartera(CS, [{ vendedor: "francisco" }, { vendedor: "Ana" }]), ["Ana", "Francisco", "Pedro"]);
  assert.equal(claveCliente("  Isme  sol "), "ISME SOL");
});

test("cada cartera por separado: la propia primero, después los vendedores por deuda", () => {
  const cs = [
    { saldo: 100, dias: -10, vendedorExterno: null, contraparte: "A" }, { saldo: 50, dias: 3, vendedorExterno: null, contraparte: "B" },
    { saldo: 30, dias: -5, vendedorExterno: "Francisco", contraparte: "C" }, { saldo: 20, dias: 20, vendedorExterno: "Francisco", contraparte: "c " },
    { saldo: 60, dias: -1, vendedorExterno: "Pedro", contraparte: "D" },
  ];
  const r = porCartera(cs, "Sumigases");
  assert.deepEqual(r.map((x) => [x.nombre, x.resumen.total, x.clientes, x.parte]), [["Sumigases", 150, 2, 57.7], ["Pedro", 60, 1, 23.1], ["Francisco", 50, 1, 19.2]]);
  assert.equal(r[0].id, "propia");
  assert.equal(r[0].externa, false);
});
