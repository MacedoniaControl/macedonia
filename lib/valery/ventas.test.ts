import { test } from "node:test";
import assert from "node:assert/strict";
import { claseVenta, horaVista, marcarNotas, nombreValery, resumirVentas, type MovVenta } from "./ventas.ts";
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

test("la hora del documento: la del primer renglón; sin hora, «—»", () => {
  const r = resumirVentas([
    { ...mov("NET", "9486", "MENDEZ SERVICIOS C.A", "OXI6", 1, 20), hora: "15:42:09" },
    { ...mov("NET", "9486", "MENDEZ SERVICIOS C.A", "ARG6", 1, 30), hora: "15:42:07" },
    mov("FAC", "1649", "Luis Lunar", "OXI6", 1, 10),
  ], "sumigases");
  const nota = r.documentos.find((d) => d.documento.endsWith("9486"))!;
  const fac = r.documentos.find((d) => d.documento.endsWith("1649"))!;
  assert.equal(nota.hora, "15:42:07");
  assert.equal(fac.hora, null);
  assert.equal(horaVista("15:42:07"), "3:42 p. m.");
  assert.equal(horaVista("00:05:00"), "12:05 a. m.");
  assert.equal(horaVista("12:00:00"), "12:00 p. m.");
  assert.equal(horaVista("09:30:00"), "9:30 a. m.");
  assert.equal(horaVista(null), "—");
});

test("toda factura es venta: la que cobra notas suma y sus notas no (caso FAC 1652 de V&B)", () => {
  const vb = "SERVICIOS Y SUMINISTROS V &amp; B, C.A";
  const movs = marcarNotas([
    { ...mov("NET", "0000009095", vb, "ARG6", 2, 240, "2026-09-30"), facturadaCon: "FAC 0000001652" },
    { ...mov("NET", "0000009200", vb, "E30918", 12, 360, "2026-10-08"), facturadaCon: "FAC 0000001652" },
    { ...mov("FAC", "0000001652", vb, "ARG6", 2, 240, "2026-11-03"), deNotas: true },
    { ...mov("FAC", "0000001652", vb, "E30918", 12, 360, "2026-11-03"), deNotas: true },
    // Su factura todavía no se trajo (el relleno no ha corrido): la nota sigue sumando.
    { ...mov("NET", "0000009400", "ISMESOL C.A", "OXI6", 1, 50), facturadaCon: "FAC 0000001700" },
  ], new Set(["FAC 0000001652"]), new Map());
  const r = resumirVentas(movs, "sumigases");
  assert.equal(r.brutoUsd, 650);   // 600 de la factura + 50 de la nota sin factura traída; las dos notas facturadas no
  assert.equal(r.ventas, 2);
  assert.deepEqual(r.facturadas, { renglones: 2, documentos: 2, totalUsd: 600 });
  const fac = r.documentos.find((d) => d.documento === "0000001652")!;
  assert.equal(fac.deNotas, true);
  assert.equal(fac.cuenta, true);
  const n = r.documentos.find((d) => d.documento === "0000009095")!;
  assert.equal(n.nota, "facturada");
  assert.equal(n.facturadaCon, "FAC 0000001652");
  assert.equal(n.cuenta, false);
  // Productos y clientes: solo lo que suma (sin contar dos veces el ARG6).
  assert.equal(r.productos.find((p) => p.codigo === "ARG6")!.totalUsd, 240);
  assert.equal(r.porCliente.find((c) => c.cliente === vb)!.totalUsd, 600);
});

test("la nota en Cuentas por Cobrar sin cobrar es a crédito; cobrada, suma", () => {
  const enCxc = new Map([["9300", false], ["9301", true]]);
  const r = resumirVentas(marcarNotas([
    mov("NET", "0000009300", "ISMESOL C.A", "OXI6", 1, 100),
    mov("NET", "0000009301", "ISMESOL C.A", "OXI6", 1, 30),
    mov("NET", "0000009302", "ISMESOL C.A", "OXI6", 1, 7),
    mov("FAC", "0000009300", "ISMESOL C.A", "OXI6", 1, 5),   // una FAC con el mismo número no es la nota
  ], new Set(), enCxc), "sumigases");
  assert.equal(r.brutoUsd, 42);
  assert.deepEqual(r.aCredito, { renglones: 1, documentos: 1, totalUsd: 100 });
  assert.deepEqual(r.documentos.map((d) => [d.tipo, d.documento, d.nota, d.cuenta]), [
    ["NET", "0000009300", "a_credito", false], ["NET", "0000009301", "credito_cobrado", true],
    ["NET", "0000009302", null, true], ["FAC", "0000009300", null, true]]);
  assert.equal(r.ventas, 3);
  assert.equal(nombreValery("V &amp; B, C.A"), "V & B, C.A");
});
