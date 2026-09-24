import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { margenSobreVenta } from "./margen.ts";

describe("margen de producto, como el % Util. de Valery", () => {
  test("reproduce la utilidad de Valery", () => {
    // CACS002 CABLE PARA SOLDAR #4, tal como quedo cargado desde el Listado de
    // Productos del 23-09-2026: Valery le da 35,0%.
    assert.equal(margenSobreVenta(8.5856, 15.3327), 35.0);
  });

  test("no compara un precio con IVA contra un costo sin IVA", () => {
    // Con la cuenta vieja, (precio - costo) / costo, este mismo cable daba 79%.
    const viejo = Math.round(((15.3327 - 8.5856) / 8.5856) * 100);
    assert.equal(viejo, 79);
    assert.notEqual(margenSobreVenta(8.5856, 15.3327), viejo);
  });

  test("sin costo o sin precio no hay margen", () => {
    assert.equal(margenSobreVenta(null, 10), null); // no puede ver costos
    assert.equal(margenSobreVenta(0, 10), null); // nunca se compro
    assert.equal(margenSobreVenta(5, 0), null); // sin precio en Valery
  });

  test("vender por debajo del costo da margen negativo", () => {
    // 28 productos del listado tienen el precio por debajo del costo.
    const m = margenSobreVenta(10, 11);
    assert.ok(m !== null && m < 0);
  });

  test("la pantalla de Productos usa esta función", () => {
    const pant = fs.readFileSync("app/admin/products/CatalogoProductos.tsx", "utf8");
    assert.match(pant, /margenSobreVenta\(p\.costo, p\.precio\)/);
    assert.doesNotMatch(pant, /\(p\.precio - p\.costo\) \/ p\.costo/);
  });
});
