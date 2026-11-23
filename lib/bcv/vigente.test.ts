import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirVigente, type FilaTasa } from "./vigente.ts";

// Lo que había en tasas_bcv el lunes 23-11-2026 (primera_vez en UTC; Caracas es UTC−4).
const NOV: FilaTasa[] = [
  { fecha_valor: "2026-11-24", tasa: 919.8227, primera_vez: "2026-11-20T21:30:01Z", ultima_vez: "2026-11-23T21:12:45Z" },
  { fecha_valor: "2026-11-20", tasa: 918.7662, primera_vez: "2026-11-19T20:30:01Z", ultima_vez: "2026-11-20T21:00:01Z" },
  { fecha_valor: "2026-11-19", tasa: 917.7751, primera_vez: "2026-11-18T20:30:01Z", ultima_vez: "2026-11-19T20:00:02Z" },
];
const tasa = (hoy: string, filas = NOV) => elegirVigente(filas, hoy);

test("lunes sin fecha valor propia: vale la ya publicada para el martes (como facturó Valery)", () => {
  const r = tasa("2026-11-23")!;
  assert.equal(r.vigente.tasa, 919.8227);
  assert.equal(r.adelantada, true);
  assert.equal(r.proxima, null);
});

test("sábado y domingo siguen con la del viernes (Valery usó 918,76 el sábado 21)", () => {
  for (const d of ["2026-11-21", "2026-11-22"]) {
    const r = tasa(d)!;
    assert.equal(r.vigente.tasa, 918.7662, d);
    assert.equal(r.adelantada, false);
    assert.equal(r.proxima?.fecha_valor, "2026-11-24");
  }
});

test("un día normal: la de hoy, y la de mañana aparte apenas se publica", () => {
  const r = tasa("2026-11-20")!;
  assert.equal(r.vigente.tasa, 918.7662);
  assert.equal(r.adelantada, false);
  // La del 24 se publicó el mismo 20 en la tarde: no reemplaza a la del día.
  assert.equal(r.proxima?.tasa, 919.8227);
});

test("la publicada HOY para mañana no adelanta, aunque hoy no tenga la suya", () => {
  // Jueves 19 sin fila propia y la del 20 publicada el mismo 19: sigue la del 18.
  const filas: FilaTasa[] = [
    { fecha_valor: "2026-11-20", tasa: 2, primera_vez: "2026-11-19T20:30:00Z", ultima_vez: "2026-11-19T20:30:00Z" },
    { fecha_valor: "2026-11-18", tasa: 1, primera_vez: "2026-11-17T20:30:00Z", ultima_vez: "2026-11-18T20:00:00Z" },
  ];
  assert.equal(tasa("2026-11-19", filas)!.vigente.tasa, 1);
});

test("sin filas, nada; solo futuras, la más vieja", () => {
  assert.equal(tasa("2026-11-23", []), null);
  assert.equal(tasa("2026-11-01")!.vigente.fecha_valor, "2026-11-19");
});
