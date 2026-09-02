import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HISTORY, getHistory } from "./history-data.ts";

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
