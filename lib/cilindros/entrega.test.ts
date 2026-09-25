import { test } from "node:test";
import assert from "node:assert/strict";
import { planEntrega, normalizarCliente } from "./entrega.ts";

test("una visita normal: deja llenos y trae vacíos que el cliente tenía", () => {
  const p = planEntrega([{ gas: "OXIGENO", llenosEntregados: 5, vaciosRecibidos: 3 }], { OXIGENO: 10 }, { OXIGENO: 4 });
  assert.deepEqual(p.errores, []);
  assert.deepEqual(p.movimientos, [
    { gas: "OXIGENO", cantidad: 5, desde: "lleno", hacia: "en_cliente" },
    { gas: "OXIGENO", cantidad: 3, desde: "en_cliente", hacia: "vacio" },
  ]);
});

test("no deja más llenos de los que hay en planta", () => {
  const p = planEntrega([{ gas: "ARGON", llenosEntregados: 3, vaciosRecibidos: 0 }], { ARGON: 2 }, {});
  assert.equal(p.movimientos.length, 0);
  assert.match(p.errores[0], /Solo hay 2 lleno\(s\) de ARGON/);
});

test("los vacíos de más entran al parque como alta, con aviso", () => {
  const p = planEntrega([{ gas: "OXIGENO", llenosEntregados: 0, vaciosRecibidos: 5 }], {}, { OXIGENO: 2 });
  assert.deepEqual(p.movimientos.map((m) => [m.desde, m.hacia, m.cantidad]), [["en_cliente", "vacio", 2], [null, "vacio", 3]]);
  assert.match(p.avisos[0], /3 vacío\(s\) de OXIGENO no figuraban/);
});

test("un cliente sin cilindros registrados que devuelve: todo es alta", () => {
  const p = planEntrega([{ gas: "CO2", llenosEntregados: 0, vaciosRecibidos: 1 }], {}, {});
  assert.deepEqual(p.movimientos, [{ gas: "CO2", cantidad: 1, desde: null, hacia: "vacio", nota: p.movimientos[0].nota }]);
});

test("el cliente se guarda igual aunque se escriba distinto", () => {
  assert.equal(normalizarCliente("  taguicho   c.a. "), "TAGUICHO C.A.");
});
