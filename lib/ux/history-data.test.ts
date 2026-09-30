import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HISTORY, getHistory, notaHistorico } from "./history-data.ts";

// Greeg pidio eliminar el consolidado: las dos empresas operan por separado y
// sumarlas no describe ninguna realidad. Ya habia vuelto una vez -sobrevivio
// como fallback silencioso de getHistory- asi que aqui queda cerrado.

// Las dos empresas se escriben aqui a mano en vez de importar empresas.ts,
// que arrastra los logos y no se puede cargar fuera de Next.
test("el historico solo conoce las dos empresas reales", () => {
  assert.deepEqual(Object.keys(HISTORY).sort(), ["sudematin", "sumigases"]);
});

test("una empresa desconocida cae a una empresa real, nunca a una suma", () => {
  const h = getHistory("no-existe");
  assert.equal(h.totals.venta, HISTORY.sumigases.totals.venta);
});

test("ninguna empresa declara las ventas de las dos juntas", () => {
  const suma = HISTORY.sumigases.totals.venta + HISTORY.sudematin.totals.venta;
  for (const [id, h] of Object.entries(HISTORY)) {
    assert.notEqual(h.totals.venta, suma, `${id} trae el consolidado`);
  }
});

test("nadie vuelve a pedir el consolidado por nombre", () => {
  for (const f of ["../../app/CentroDeControl.tsx", "../../app/admin/roi/page.tsx", "./historico-rango.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /getHistory\(\s*"all"\s*\)/, `${f} pide el consolidado`);
  }
});

// ---- Datos sinceros (scripts/historico-valery.py, 29-09-2026)

test("la mascarilla de 8.278.489,80 Bs no está en los rankings, pero queda para revisar", () => {
  const s = HISTORY.sumigases;
  assert.ok(!s.topProductos.some((p) => /MASCARILLA/.test(p.nombre)), "la mascarilla sigue en el ranking");
  assert.ok(s.meta.revisar.some((r) => r.documento === "0000000497" && /MASCARILLA/.test(r.producto)));
});

test("sin IVA: la utilidad es venta menos costo, en cada año y en el total", () => {
  for (const h of Object.values(HISTORY)) {
    for (const y of h.years) assert.ok(Math.abs(y.venta - y.costo - y.util) <= 3, `${y.year}: ${y.venta} - ${y.costo} ≠ ${y.util}`);
    assert.ok(Math.abs(h.totals.venta - h.totals.costo - h.totals.util) <= 10);
  }
});

test("los años suman el total y los meses suman el año", () => {
  for (const h of Object.values(HISTORY)) {
    assert.equal(h.years.reduce((a, y) => a + y.venta, 0), h.totals.venta);
    for (const y of h.years) {
      const meses = h.months.filter((m) => m.ym.startsWith(String(y.year)));
      assert.equal(meses.reduce((a, m) => a + m.venta, 0), y.venta);
    }
  }
});

test("la nota de fuente dice sin IVA, hasta cuándo y qué mes está incompleto", () => {
  const n = notaHistorico(HISTORY.sumigases);
  assert.match(n, /sin IVA/);
  assert.match(n, /Julio 2026 está incompleto \(sin ventas del 14-07 al 27-07-2026\)/);
  assert.match(n, /compras hasta el 24-08-2026/);
});
