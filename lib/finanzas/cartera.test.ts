import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorCliente, type CuentaCartera } from "./cartera.ts";

const c = (id: number, contraparte: string, saldo: number, vence: string, dias: number, extra: Partial<CuentaCartera> = {}): CuentaCartera => ({
  id, contraparte, clase: "nota_entrega", monto: saldo, abonado: 0, saldo, vence, dias, estado: "abierta", ...extra,
});

test("junta las cuentas de cada cliente y suma lo que debe", () => {
  const g = agruparPorCliente([c(1, "TAGUICHO", 32, "2024-01-27", -972), c(2, "taguicho ", 4, "2024-07-03", -814), c(3, "COSTA NORTE", 100, "2026-10-01", 6)]);
  assert.equal(g.length, 2);
  const t = g.find((x) => x.cliente === "TAGUICHO")!;
  assert.equal(t.documentos, 2);
  assert.equal(t.saldo, 36);
  assert.equal(t.vencido, 36);
});

test("primero quien más debe", () => {
  const g = agruparPorCliente([c(1, "A", 5, "2026-01-01", -1), c(2, "B", 50, "2026-01-01", -1)]);
  assert.deepEqual(g.map((x) => x.cliente), ["B", "A"]);
});

test("la deuda más vieja es la abierta que venció primero, no una ya pagada", () => {
  const g = agruparPorCliente([
    c(1, "A", 0, "2023-01-01", -900, { estado: "liquidada", monto: 10, abonado: 10 }),
    c(2, "A", 7, "2024-05-01", -500),
    c(3, "A", 3, "2025-01-01", -200),
  ]);
  assert.deepEqual(g[0].masVieja, { vence: "2024-05-01", dias: -500 });
  assert.equal(g[0].cuentas[0].id, 1, "adentro, ordenadas por vencimiento");
});

test("cuenta los documentos por clase", () => {
  const g = agruparPorCliente([c(1, "A", 1, "2026-01-01", 1), c(2, "A", 1, "2026-01-01", 1, { clase: "ajuste" })]);
  assert.deepEqual(g[0].porClase, { nota_entrega: 1, ajuste: 1 });
});

test("el buscador encuentra por nombre o por el código de la nota", async () => {
  const { buscarEnCartera, codigoBuscable } = await import("./cartera.ts");
  const g = { cliente: "ISMESOL", cuentas: [{ id: 1, documento: "NE-8734·ISMESOL" }, { id: 2, documento: "NE-8791" }, { id: 3, documento: "FAC-8734" }] };
  assert.equal(codigoBuscable("ne 8734"), "NE8734");
  assert.deepEqual([...buscarEnCartera(g, "8734").docs], [1, 3]);
  assert.deepEqual([...buscarEnCartera(g, "NE-8734").docs], [1]);
  assert.deepEqual([...buscarEnCartera(g, "ne8791").docs], [2]);
  assert.equal(buscarEnCartera(g, "ismes").porNombre, true);
  assert.equal(buscarEnCartera(g, "ismes").docs.size, 0);
  assert.equal(buscarEnCartera(g, "ne").visible, false);   // sin dígitos no busca por código
  assert.equal(buscarEnCartera(g, "9999").visible, false);
  assert.equal(buscarEnCartera(g, "  ").visible, true);
});
