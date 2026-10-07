import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarReparto, repartoInicial, type NotaPago } from "./repartir-pago.ts";

const fmt = (n: number) => `$${n}`;
const cinco: NotaPago[] = [1, 2, 3, 4, 5].map((i) => ({ id: i, documento: `NE-${i}`, vence: `2026-0${i}-01`, pendiente: 100 }));

test("5 notas de 100 y un pago de 350: salda 3, abona 50 a otra y quedan 150", () => {
  const p = repartoInicial(cinco, 350);
  assert.deepEqual(p.saldadas, [1, 2, 3]);
  assert.equal(p.restante, 50);
  assert.equal(p.destino, 4); // a igual saldo, la más vieja
  const r = evaluarReparto(cinco, 350, new Set(p.saldadas), p.destino, fmt);
  assert.equal(r.error, null);
  assert.equal(r.quedaDebiendo, 150);
});

test("el restante va por defecto a la de mayor saldo, y se puede elegir otra", () => {
  const notas: NotaPago[] = [
    { id: 1, documento: "NE-1", vence: "2026-01-01", pendiente: 86.2 },
    { id: 2, documento: "NE-2", vence: "2026-02-01", pendiente: 44.74 },
    { id: 3, documento: "NE-3", vence: "2026-03-01", pendiente: 172.82 },
    { id: 4, documento: "NE-4", vence: "2026-04-01", pendiente: 107 },
  ];
  const p = repartoInicial(notas, 117);
  assert.deepEqual(p.saldadas, [1]);
  assert.equal(p.restante, 30.8);
  assert.equal(p.destino, 3);
  const r = evaluarReparto(notas, 117, new Set([1]), 4, fmt);
  assert.equal(r.destino, 4);
  assert.deepEqual(r.destinos, [3, 4, 2]);
});

test("un pago exacto no deja restante", () => {
  const notas: NotaPago[] = [
    { id: 1, documento: "NE-6623", vence: "2026-01-19", pendiente: 7.72 },
    { id: 2, documento: "NE-7485", vence: "2026-05-04", pendiente: 9.44 },
    { id: 3, documento: "NE-8182", vence: "2026-07-04", pendiente: 6.96 },
    { id: 4, documento: "NE-8229", vence: "2026-07-08", pendiente: 16.51 },
  ];
  const p = repartoInicial(notas, 24.12);
  assert.deepEqual(p.saldadas, [1, 2, 3]);
  assert.equal(p.restante, 0);
  assert.equal(p.destino, null);
});

test("la persona elige otras notas: el restante se recalcula", () => {
  const r = evaluarReparto(cinco, 250, new Set([4, 5]), null, fmt);
  assert.equal(r.suma, 200);
  assert.equal(r.restante, 50);
  assert.equal(r.error, null);
  assert.deepEqual(r.destinos, [1, 2, 3]);
  assert.equal(r.destino, 1);
  assert.equal(r.quedaDebiendo, 250);
});

test("errores que se dicen claro", () => {
  assert.match(evaluarReparto(cinco, 350, new Set([1, 2, 3, 4]), null, fmt).error!, /suman \$400, más que el pago/);
  assert.match(evaluarReparto(cinco, 600, new Set([1]), null, fmt).error!, /mayor que lo que se debe/);
  assert.match(evaluarReparto(cinco, 50, new Set(), null, fmt).error!, /no se salda ninguna nota/);
  // Si el restante alcanza para saldar otra, hay que marcarla.
  const dos: NotaPago[] = [{ id: 1, documento: "A", vence: "2026-01-01", pendiente: 100 }, { id: 2, documento: "B", vence: "2026-02-01", pendiente: 20 }];
  assert.match(evaluarReparto(dos, 120, new Set([1]), null, fmt).error!, /alcanzan para saldar otra nota/);
});

test("la nota que se estaba viendo va primero", () => {
  const p = repartoInicial(cinco, 150, [5]);
  assert.deepEqual(p.saldadas, [5]);
  assert.equal(p.restante, 50);
  assert.equal(p.destino, 1);
});
