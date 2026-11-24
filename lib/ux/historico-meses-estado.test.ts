import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoMeses, fijarMesesCargados, marcarFalloMeses, suscribirMesesCargados } from "./historico-meses.ts";

// Hasta que llegan los meses de la base, el histórico no se muestra: si se
// mostrara, serían las cifras del Excel, que ya no valen.
test("el histórico espera los meses de la base; si fallan, lo dice; al llegar, queda listo", () => {
  let avisos = 0;
  const quitar = suscribirMesesCargados(() => { avisos++; });
  assert.equal(estadoMeses(), "cargando");
  marcarFalloMeses();
  assert.equal(estadoMeses(), "error");
  // Aunque lleguen cero meses (sin la migración), ya es una respuesta de la base.
  fijarMesesCargados([]);
  assert.equal(estadoMeses(), "listo");
  assert.equal(avisos, 2);
  quitar();
});
