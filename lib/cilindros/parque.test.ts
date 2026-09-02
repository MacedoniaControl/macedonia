import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirParque } from "./parque.ts";
import type { SaldoCilindro } from "./cilindros-db.ts";

const s = (gas: string, estado: SaldoCilindro["estado"], cantidad: number): SaldoCilindro =>
  ({ gas, estado, cantidad });

test("el parque suma todos los estados, esten donde esten", () => {
  const p = resumirParque([
    s("Oxigeno", "lleno", 56), s("Oxigeno", "vacio", 44),
    s("Oxigeno", "en_cliente", 29), s("Argon", "en_llenado", 4),
    s("Argon", "fuera_servicio", 2),
  ]);
  assert.equal(p.total, 135);
  assert.equal(p.enPlanta, 100);
  assert.equal(p.afuera, 29);
});

test("solo 'en planta' se abre en llenos y vacios", () => {
  const p = resumirParque([s("Oxigeno", "lleno", 56), s("Oxigeno", "en_cliente", 29)]);
  const planta = p.ubicaciones.find((u) => u.id === "planta")!;
  const cliente = p.ubicaciones.find((u) => u.id === "cliente")!;
  assert.equal(planta.llenos, 56);
  // null, no 0: nadie reporto si el cliente los tiene llenos o vacios, y poner
  // cero ahi seria afirmar algo que el dato no dice.
  assert.equal(cliente.llenos, null);
  assert.equal(cliente.total, 29);
});

test("fuera de servicio no cuenta como 'afuera': esta en casa", () => {
  const p = resumirParque([s("Oxigeno", "fuera_servicio", 7)]);
  assert.equal(p.afuera, 0);
  assert.equal(p.total, 7);
});

test("sin movimientos no hay parque, y eso no es lo mismo que cero", () => {
  assert.equal(resumirParque([]).sinDatos, true);
  assert.equal(resumirParque([s("Oxigeno", "lleno", 0)]).sinDatos, false);
});

test("los gases se ordenan por tamano de parque", () => {
  const p = resumirParque([
    s("Argon", "lleno", 16), s("Oxigeno", "lleno", 56), s("CO2", "lleno", 3),
  ]);
  assert.deepEqual(p.porGas.map((g) => g.gas), ["Oxigeno", "Argon", "CO2"]);
});

test("un gas reparte su total entre todos sus estados", () => {
  const p = resumirParque([
    s("Oxigeno", "lleno", 56), s("Oxigeno", "vacio", 44), s("Oxigeno", "en_cliente", 29),
  ]);
  assert.deepEqual(p.porGas, [{ gas: "Oxigeno", total: 129 }]);
});
