import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularInsights, esServicio, type MovVentaInv, type ProductoInv } from "./insights.ts";

const HOY = "2026-11-14";
const CORTE = "2026-09-24";
const mov = (codigo: string, cantidad: number, montoUsd: number, fecha = "2026-11-10", tipo = "NET", cliente = "CLIENTE A"): MovVentaInv =>
  ({ fecha, tipo, codigo, nombre: codigo, cantidad, montoUsd, cliente });
const prod = (codigo: string, existencia: number, costo: number | null = 1): ProductoInv => ({ codigo, nombre: codigo, unidad: "UND", existencia, costo });
const calc = (movs: MovVentaInv[], prods: ProductoInv[], conMontos = true) =>
  calcularInsights(movs, prods, { hoy: HOY, corte: CORTE, empresa: "sumigases", conMontos });
const codigos = (xs: { codigo: string }[]) => xs.map((x) => x.codigo);

test("lo que más se vende va por US$, y la devolución resta", () => {
  const r = calc([mov("A", 2, 200), mov("B", 10, 50), mov("A", 1, 100, "2026-11-11", "DEV"), mov("C", 1, 30), mov("C", 1, 30, "2026-11-11", "DEV")],
    [prod("A", 5), prod("B", 5), prod("C", 5)]);
  assert.deepEqual(codigos(r.masVendido), ["A", "B"]);   // C se devolvió entero: no es lo que se vende
  assert.equal(r.masVendido[0].ventaUsd, 100);
  assert.equal(r.masVendido[0].unidades, 1);
  assert.equal(r.totalVendido, 150);
});

test("sin montos (quien no ve Ventas) se ordena por unidades", () => {
  const r = calc([mov("A", 1, 100), mov("B", 10, 50)], [prod("A", 5), prod("B", 5)], false);
  assert.deepEqual(codigos(r.masVendido), ["B", "A"]);
  assert.equal(r.masVendido[0].ventaUsd, null);
});

test("lo del grupo no es venta, pero sí se lleva la existencia", () => {
  const r = calc([mov("A", 30, 300, "2026-11-10", "NET", "SUDEMATIN & GM, C.A.")], [prod("A", 10)]);
  assert.equal(r.masVendido.length, 0);
  assert.equal(r.rotacion[0].salidas, 30);
  assert.equal(r.seAcaba[0].codigo, "A");      // 10 de existencia, sale 1 al día: 10 días
  assert.equal(r.seAcaba[0].cobertura, 10);
});

test("se acaba pronto, agotado, dormido y de más", () => {
  const r = calc(
    [mov("PRONTO", 30, 30), mov("AGOTADO", 5, 50), mov("LENTO", 1, 1)],
    [prod("PRONTO", 10), prod("AGOTADO", 0), prod("DORMIDO", 7, 2), prod("LENTO", 100, 3)],
  );
  assert.deepEqual(codigos(r.seAcaba), ["PRONTO"]);
  assert.deepEqual(codigos(r.agotado), ["AGOTADO"]);
  assert.equal(r.agotadoVendido, 50);
  assert.deepEqual(codigos(r.dormido), ["DORMIDO"]);
  assert.equal(r.dormidoValor, 14);
  assert.deepEqual(codigos(r.deMas), ["LENTO"]);   // 100 de existencia, 1 en 30 días: 3.000 días
  assert.equal(r.deMas[0].sobra, 291);              // (100 − 3 de 90 días) × 3
});

test("un producto vendido antes de la ventana no es dormido, pero no cuenta en la ventana", () => {
  const r = calc([mov("A", 5, 50, "2026-10-01")], [prod("A", 5)]);
  assert.equal(r.dormido.length, 0);
  assert.equal(r.masVendido.length, 0);
});

test("la ventana no empieza antes del corte", () => {
  const r = calcularInsights([], [], { hoy: "2026-10-03", corte: CORTE, empresa: "sumigases", conMontos: true });
  assert.equal(r.desde, CORTE);
  assert.equal(r.diasVentana, 10);
  assert.equal(r.conTendencia, false);
});

test("concentración: los que juntos hacen el 80 %", () => {
  const r = calc([mov("A", 1, 70), mov("B", 1, 20), mov("C", 1, 10)], [prod("A", 1), prod("B", 1), prod("C", 1)]);
  assert.deepEqual(codigos(r.pareto), ["A", "B"]);
});

test("tendencia: últimos 15 días contra los 15 anteriores", () => {
  const r = calc([mov("SUBE", 1, 10, "2026-10-20"), mov("SUBE", 1, 50, "2026-11-12"), mov("BAJA", 1, 80, "2026-10-20"), mov("BAJA", 1, 5, "2026-11-12")],
    [prod("SUBE", 9), prod("BAJA", 9)]);
  assert.deepEqual(codigos(r.sube), ["SUBE"]);
  assert.equal(r.sube[0].cambio, 40);
  assert.deepEqual(codigos(r.baja), ["BAJA"]);
});

test("devoluciones: primero lo que más se devolvió, en US$", () => {
  const r = calc([mov("A", 10, 100), mov("A", 1, 10, "2026-11-11", "DEV"), mov("B", 2, 200), mov("B", 1, 100, "2026-11-11", "DEV")], [prod("A", 5), prod("B", 5)]);
  assert.deepEqual(codigos(r.devoluciones), ["B", "A"]);
  assert.equal(r.totalDevuelto, 110);
  assert.equal(r.devoluciones[1].brutas, 10);
  // Sin montos, en unidades.
  const u = calc([mov("A", 10, 100), mov("A", 3, 30, "2026-11-11", "DEV"), mov("B", 2, 200), mov("B", 1, 100, "2026-11-11", "DEV")], [prod("A", 5), prod("B", 5)], false);
  assert.deepEqual(codigos(u.devoluciones), ["A", "B"]);
  assert.equal(u.totalDevuelto, 4);
});

test("fletes y servicios no son mercancía", () => {
  assert.equal(esServicio("FLETE"), true);
  assert.equal(esServicio("SERVICIO GENERAL"), true);
  assert.equal(esServicio("OXIGENO GASEOSO CIL 6M3"), false);
  const r = calc([mov("010203", 100, 500)], [{ ...prod("010203", -517), nombre: "FLETE" }]);
  assert.equal(r.agotado.length, 0);
  assert.equal(r.masVendido.length, 0);
});

test("sin costo no se inventa un valor", () => {
  const r = calc([], [prod("DORMIDO", 7, null)]);
  assert.equal(r.dormido[0].valor, null);
  assert.equal(r.dormidoValor, null);
});
