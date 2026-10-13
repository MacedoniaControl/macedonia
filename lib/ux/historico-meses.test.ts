import { test } from "node:test";
import assert from "node:assert/strict";
import { conMesesCargados, mesesPorCerrar, mesSiguiente, ultimoMesCerrado, type MesCargado } from "./historico-meses.ts";
import { HISTORY } from "./history-data.ts";

const mes = (ym: string, venta: number, costo: number, compra = 0): MesCargado => ({
  empresa: "sumigases", ym, venta, costo, compra, ventaBs: venta * 200, costoBs: costo * 200, compraBs: compra * 200,
  nota: null, creadoNombre: "Saúl Navarro", actualizadoEn: null,
});

test("qué meses se pueden cerrar: los terminados después del último de Valery", () => {
  assert.equal(mesSiguiente("2026-12"), "2027-01");
  assert.equal(ultimoMesCerrado("2026-10-12"), "2026-09");
  assert.equal(ultimoMesCerrado("2027-01-03"), "2026-12");
  assert.deepEqual(mesesPorCerrar("2026-08", "2026-10-12"), ["2026-09"]);
  assert.deepEqual(mesesPorCerrar("2026-08", "2026-12-01"), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(mesesPorCerrar("2026-09", "2026-10-31"), []);   // octubre no ha terminado
});

test("un mes cerrado a mano se suma al histórico: meses, año y totales", () => {
  const h = HISTORY.sumigases;
  const n = conMesesCargados(h, [mes("2026-09", 80000, 45000, 30000)]);
  assert.equal(n.months.at(-1)!.ym, "2026-09");
  assert.equal(n.months.at(-1)!.util, 35000);
  assert.equal(n.meta.hasta, "2026-09");
  assert.deepEqual(n.meta.manuales, [{ ym: "2026-09", por: "Saúl Navarro" }]);
  assert.equal(n.totals.venta, h.totals.venta + 80000);
  assert.equal(n.totals.util, h.totals.util + 35000);
  assert.equal(n.totals.ventaBs, h.totals.ventaBs + 16_000_000);
  const y26 = n.years.find((y) => y.year === 2026)!;
  assert.equal(y26.venta, h.months.filter((m) => m.ym.startsWith("2026")).reduce((a, m) => a + m.venta, 0) + 80000);
  assert.equal(n.years.find((y) => y.year === 2025), h.years.find((y) => y.year === 2025));   // los otros años, intactos
});

test("Valery manda: un mes que Valery ya trae no se reemplaza con el cargado a mano", () => {
  const h = HISTORY.sumigases;
  assert.equal(conMesesCargados(h, [mes("2026-08", 1, 1)]), h);
  assert.equal(conMesesCargados(h, []), h);
});
