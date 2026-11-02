import { test } from "node:test";
import assert from "node:assert/strict";
import { claseVenta, resumirVentas, type MovVenta } from "./ventas.ts";
import { rangoAuto, tocaActualizar, vaciaSospechosa } from "./puente.ts";

const mov = (tipo: MovVenta["tipo"], documento: string, cliente: string, codigo: string, cantidad: number, montoUsd: number | null, fecha = "2026-10-30"): MovVenta =>
  ({ fecha, tipo, documento: `${tipo} ${documento}`, cliente, codigo, nombre: codigo, cantidad, montoUsd });

test("la venta a la otra empresa del grupo y el consumo interno no son venta", () => {
  assert.equal(claseVenta("SUDEMATIN & GM, C.A.", "sumigases"), "entre_empresas");
  assert.equal(claseVenta("Suministro de Materiales Industriales", "sumigases"), "entre_empresas");
  assert.equal(claseVenta("SUMIGASES ORIENTE, C.A.", "sumigases"), "consumo_propio");
  assert.equal(claseVenta("SUMIGASES ORIENTE, C.A.", "sudematin"), "entre_empresas");
  assert.equal(claseVenta("COSTA NORTE CONSTRUCCIONES, C.A.", "sumigases"), "venta");
  // Un cliente que solo menciona a la empresa en medio del nombre sigue siendo cliente.
  assert.equal(claseVenta("TALLER CLIENTE DE SUMIGASES ORIENTE", "sumigases"), "venta");
});

test("facturas y notas suman, la devolución resta, lo del grupo se aparta", () => {
  const r = resumirVentas([
    mov("FAC", "0000001500", "COSTA NORTE CONSTRUCCIONES, C.A.", "OXI6", 2, 40),
    mov("FAC", "0000001500", "COSTA NORTE CONSTRUCCIONES, C.A.", "ARG6", 1, 60),
    mov("NET", "0000009001", "ISMESOL C.A", "OXI6", 1, 20),
    mov("DEV", "0000000200", "ISMESOL C.A", "OXI6", 1, 20),
    mov("NET", "0000009002", "SUDEMATIN & GM, C.A.", "OXI6", 10, 150),
    mov("NET", "0000009003", "SUMIGASES ORIENTE, C.A.", "ARG6", 1, 5),
    mov("NET", "0000009004", "ISMESOL C.A", "TAWG12", 3, null),
  ], "sumigases");
  assert.equal(r.brutoUsd, 120);
  assert.equal(r.devolucionesUsd, 20);
  assert.equal(r.netoUsd, 100);
  assert.equal(r.ventas, 3);            // FAC 1500, NET 9001, NET 9004
  assert.equal(r.clientes, 2);
  assert.equal(r.sinMonto, 1);
  assert.deepEqual(r.entreEmpresas, { renglones: 1, documentos: 1, totalUsd: 150 });
  assert.deepEqual(r.consumoPropio, { renglones: 1, documentos: 1, totalUsd: 5 });
  const fac = r.documentos.find((d) => d.documento === "0000001500")!;
  assert.equal(fac.renglones, 2);
  assert.equal(fac.totalUsd, 100);
  assert.equal(r.documentos.find((d) => d.tipo === "DEV")!.totalUsd, -20);
  const oxi = r.productos.find((p) => p.codigo === "OXI6")!;
  assert.equal(oxi.cantidad, 2);        // 2 + 1 − 1 (lo del grupo no cuenta)
  assert.equal(oxi.totalUsd, 40);
  assert.equal(r.porCliente.find((c) => c.cliente.startsWith("ISMESOL"))!.totalUsd, 0);
});

test("rango de la actualización automática", () => {
  // Primera vez: desde el corte.
  assert.deepEqual(rangoAuto("2026-11-02", "2026-09-24", null), { desde: "2026-09-24", hasta: "2026-11-02" });
  // Después: dos días antes de lo último que entró.
  assert.deepEqual(rangoAuto("2026-11-02", "2026-09-24", "2026-11-02"), { desde: "2026-10-31", hasta: "2026-11-02" });
  // Nunca antes del corte.
  assert.deepEqual(rangoAuto("2026-09-25", "2026-09-24", "2026-09-25"), { desde: "2026-09-24", hasta: "2026-09-25" });
  // Nunca más de 400 días.
  assert.deepEqual(rangoAuto("2027-12-31", "2026-09-24", null), { desde: "2026-11-27", hasta: "2027-12-31" });
});

test("cada cuánto toca actualizar", () => {
  const ahora = Date.parse("2026-11-02T15:00:00Z");
  assert.equal(tocaActualizar(null, 60, ahora), true);
  assert.equal(tocaActualizar("2026-11-02T14:01:00Z", 60, ahora), false);
  assert.equal(tocaActualizar("2026-11-02T14:00:00Z", 60, ahora), true);
});

// El 2-nov-2026 el agente leía la base vieja y la pantalla decía «sin ventas
// nuevas», como si todo estuviera bien.
test("una actualización vacía de una semana o más es sospechosa", () => {
  assert.equal(vaciaSospechosa("2026-09-24", "2026-11-02", 0), true);
  assert.equal(vaciaSospechosa("2026-10-27", "2026-11-02", 0), true);    // 7 días
  assert.equal(vaciaSospechosa("2026-10-31", "2026-11-02", 0), false);   // un fin de semana sin vender
  assert.equal(vaciaSospechosa("2026-09-24", "2026-11-02", 12), false);
  assert.equal(vaciaSospechosa("2026-09-24", "2026-11-02", null), false); // no se sabe: no se acusa
  assert.equal(vaciaSospechosa(null, "2026-11-02", 0), false);
});
