import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNAS_VENTAS, leerVentas, type Celda } from "../inventory/ventas-valery.ts";
import { paraLaBase, planVentas } from "../inventory/ventas-valery.ts";
import { cantidadPrincipal, conectado, deNotasSegunValery, errorDeRango, filasDeParte, haceCuanto, horaValida, inventarioParaLaBase, referenciaValida, renglonesDesdePuente, versionAlMenos, type FilaVentaPuente } from "./puente.ts";

// El mismo documento, como lo exporta Valery a Excel (formato completo) y como
// lo lee el agente de la base. Casos reales de febrero de 2026: neto con
// decimales, una DEV (positiva en la base, negativa en el Excel) y dos
// renglones idénticos en el mismo documento.
const excel = (filas: Celda[][]) => leerVentas([[...COLUMNAS_VENTAS.completo], ...filas]);
const fila = (fecha: number, tipo: string, doc: string, cli: string, cant: number, prod: string, cod: string, neto: number, tasa: number): Celda[] =>
  [fecha, tipo, doc, cli, cant, prod, cod, neto, 0, 0, 0, tasa, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

test("el agente y el Excel dan las mismas claves para los mismos renglones", () => {
  // 46028 = 2026-01-06 en número de serie de Excel.
  const x = excel([
    fila(46028, "FAC", "0000001070", "SERVICIOS Y SUMINISTRO", 2, "OXIGENO GASEOSO CIL 6M", "OXI6", 13558.6, 308.15),
    fila(46028, "NET", "0000006700", "ECODESARROLLO", 1.5, "ACETILENO", "ACE1", 1234.565, 308.15),
    fila(46028, "NET", "0000006700", "ECODESARROLLO", 1.5, "ACETILENO", "ACE1", 1234.565, 308.15),
    fila(46028, "DEV", "0000000432", "CLIENTE X", 3, "ELECTRODO", "E6010", -176747.5, 308.15),
  ]);
  const p = renglonesDesdePuente([
    { fecha: "2026-01-06", tipo: "FAC", documento: "0000001070", cliente: "SERVICIOS Y SUMINISTRO", codigo: "OXI6", producto: "OXIGENO GASEOSO CIL 6M", cantidad: 2, neto: 13558.6, tasa: 308.15 },
    { fecha: "2026-01-06", tipo: "NET", documento: "0000006700", cliente: "ECODESARROLLO", codigo: "ACE1", producto: "ACETILENO", cantidad: 1.5, neto: 1234.565, tasa: 308.15 },
    { fecha: "2026-01-06", tipo: "NET", documento: "0000006700", cliente: "ECODESARROLLO", codigo: "ACE1", producto: "ACETILENO", cantidad: 1.5, neto: 1234.565, tasa: 308.15 },
    { fecha: "2026-01-06", tipo: "DEV", documento: "0000000432", cliente: "CLIENTE X", codigo: "E6010", producto: "ELECTRODO", cantidad: 3, neto: 176747.5, tasa: 308.15 },
  ]);
  assert.deepEqual(p.renglones.map((r) => r.clave), x.renglones.map((r) => r.clave));
  assert.equal(p.renglones[3].netoBs, -176747.5, "la DEV entra en negativo, como en el Excel");
  assert.equal(p.renglones[2].clave.endsWith("|2"), true, "el segundo renglón idéntico se separa con el contador");
});

test("descarta lo que no es una venta legible", () => {
  const malas: FilaVentaPuente[] = [
    { fecha: "2026-01-06", tipo: "PRS", documento: "1", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 1, tasa: 1 },
    { fecha: "2026-01-06", tipo: "FAC", documento: "1", cliente: "", codigo: "", producto: "", cantidad: 1, neto: 1, tasa: 1 },
    { fecha: "06/01/2026", tipo: "FAC", documento: "1", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 1, tasa: 1 },
    { fecha: "2026-01-06", tipo: "FAC", documento: "1", cliente: "", codigo: "A", producto: "", cantidad: 0, neto: 1, tasa: 1 },
  ];
  const r = renglonesDesdePuente(malas);
  assert.equal(r.renglones.length, 0);
  assert.equal(r.descartadas, 4);
});

test("la venta en dólares sale del neto y la tasa; sin tasa, cero (no se inventa)", () => {
  const [a, b] = renglonesDesdePuente([
    { fecha: "2026-02-02", tipo: "FAC", documento: "1106", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 3702.5, tasa: 370.25 },
    { fecha: "2026-02-02", tipo: "FAC", documento: "1107", cliente: "", codigo: "A", producto: "", cantidad: 1, neto: 100, tasa: 0 },
  ]).renglones;
  assert.equal(a.ventaUsd, 10);
  assert.equal(b.ventaUsd, 0);
});

test("rango de fechas para pedir ventas", () => {
  assert.equal(errorDeRango("2026-02-01", "2026-02-28"), null);
  assert.match(errorDeRango("2026-03-01", "2026-02-01") ?? "", /posterior/);
  assert.match(errorDeRango("2024-01-01", "2026-02-01") ?? "", /400/);
  assert.match(errorDeRango("", "2026-02-01") ?? "", /dos fechas/);
});

test("conexión del agente: conectado si habló hace menos de 2 minutos", () => {
  const ahora = Date.parse("2026-10-24T12:00:00Z");
  assert.equal(conectado("2026-10-24T11:59:30Z", ahora), true);
  assert.equal(conectado("2026-10-24T11:57:00Z", ahora), false);
  assert.equal(conectado(null, ahora), false);
  assert.equal(haceCuanto("2026-10-24T11:59:30Z", ahora), "hace 30 s");
  assert.equal(haceCuanto(null, ahora), "nunca");
});

// Lo que manda el agente 1.0.1 (PowerShell desenrolla el arreglo): una parte
// sin filas llegaba como null y el servidor respondía 400. Visto en producción
// el 2-nov-2026 con la primera actualización automática.
test("una parte sin filas o de una sola fila también es una lista", () => {
  assert.deepEqual(filasDeParte(null), []);
  assert.deepEqual(filasDeParte(undefined), []);
  assert.deepEqual(filasDeParte({ codigo: "OXI6" }), [{ codigo: "OXI6" }]);
  assert.deepEqual(filasDeParte([{ codigo: "OXI6" }, { codigo: "ARG6" }]), [{ codigo: "OXI6" }, { codigo: "ARG6" }]);
  assert.equal(filasDeParte("hola"), null);
  assert.equal(filasDeParte(5), null);
});

test("la hora del documento: se normaliza y, si no sirve, queda en null", () => {
  assert.equal(horaValida("17:13:55"), "17:13:55");
  assert.equal(horaValida("17:13:55.0000"), "17:13:55");   // como la da Firebird
  assert.equal(horaValida("9:05"), "09:05:00");
  for (const malo of [null, undefined, "", "25:00:00", "12:60", "mañana", 1713]) assert.equal(horaValida(malo), null);
});

test("la hora viaja del agente a la base; sin hora (agente viejo) va null", () => {
  const base: FilaVentaPuente = { fecha: "2026-11-02", tipo: "NET", documento: "0000009486", cliente: "MENDEZ", codigo: "OXI6", producto: "OXIGENO", cantidad: 1, neto: 1000, tasa: 250 };
  const { renglones } = renglonesDesdePuente([{ ...base, hora: "15:42:07.0000" }, { ...base, documento: "0000009487" }]);
  assert.equal(renglones[0].hora, "15:42:07");
  assert.equal(renglones[1].hora, null);
  // La hora no entra en la clave: el mismo renglón con y sin hora es el mismo renglón.
  assert.equal(renglonesDesdePuente([base]).renglones[0].clave, renglonesDesdePuente([{ ...base, hora: "15:42:07" }]).renglones[0].clave);
  const filas = planVentas(renglones, "2026-09-24").movimientos.map(paraLaBase);
  assert.equal(filas[0].hora, "15:42:07");
  assert.equal(filas[1].hora, null);
});

test("lo que devuelve la DEV viaja del agente a la base; solo en la DEV, y nunca adivinado", () => {
  assert.equal(referenciaValida("NET 0000009511"), "NET 0000009511");
  assert.equal(referenciaValida(" FAC  0000001140 "), "FAC 0000001140");
  for (const malo of [null, undefined, "", "NET", "NET-0000009511", "DEV 0000000752", "NET 95A1", 9511]) assert.equal(referenciaValida(malo), null);
  const dev: FilaVentaPuente = { fecha: "2026-11-04", tipo: "DEV", documento: "0000000752", cliente: "METAL CINCO", codigo: "E309332", producto: "E309332", cantidad: 2, neto: 17500, tasa: 250, devuelve: "NET 0000009511" };
  const { renglones } = renglonesDesdePuente([dev, { ...dev, devuelve: null }, { ...dev, tipo: "NET", documento: "0000009511" }]);
  assert.deepEqual(renglones.map((r) => r.devuelve), ["NET 0000009511", null, null]);   // una NET no devuelve nada
  // No entra en la clave: la DEV que ya estaba es el mismo renglón y se le llena.
  assert.equal(renglones[0].clave, renglones[1].clave.replace(/\|2$/, "|1"));
  assert.deepEqual(planVentas(renglones, "2026-09-24").movimientos.map(paraLaBase).map((f) => f.devuelve), ["NET 0000009511", null, null]);
});

test("versiones del agente: se comparan por número, no como texto", () => {
  assert.equal(versionAlMenos("1.0.4", "1.0.4"), true);
  assert.equal(versionAlMenos("1.0.10", "1.0.4"), true);
  assert.equal(versionAlMenos("1.1", "1.0.4"), true);
  assert.equal(versionAlMenos("1.0.3", "1.0.4"), false);
  assert.equal(versionAlMenos(null, "1.0.4"), false);
  assert.equal(versionAlMenos("raro", "1.0.4"), false);
});

test("la cantidad va a la unidad principal: se divide la secundaria menor y se multiplica la mayor", () => {
  assert.equal(cantidadPrincipal(1200, "2", 20, "S"), 60);    // 8145P95: cajas de 20, se vendieron 1.200 «UND»
  assert.equal(cantidadPrincipal(5, "1", 50, "S"), 250);      // 2001912: en unidades, se vendieron 5 «CAJA» de 50
  assert.equal(cantidadPrincipal(5, "1", 50, "P"), 5);        // se aplicó la principal: tal cual
  assert.equal(cantidadPrincipal(7, "2", 1, "S"), 7);         // factor 1: nada que convertir
  assert.equal(cantidadPrincipal(7, "0", 30, "S"), 7);
  assert.equal(cantidadPrincipal(250, "2", 50), 5);           // ajuste de 250 «UND» de una caja de 50 (sin tua: no es venta)
  assert.equal(cantidadPrincipal(20, "1", 100), 2000);
  // Agente viejo: no manda la unidad, la cantidad no cambia.
  assert.equal(cantidadPrincipal(1200, undefined, undefined, "P"), 1200);
});

test("las ventas: la cantidad en la principal y la clave con la de Valery; lo anulado no entra", () => {
  const base: FilaVentaPuente = { fecha: "2026-11-01", tipo: "FAC", documento: "0000001700", cliente: "X", codigo: "8145P95", producto: "P", cantidad: 1200, neto: 5000, tasa: 250 };
  const { renglones, anuladas } = renglonesDesdePuente([
    { ...base, tu: "2", tua: "S", fu: 20 },
    { ...base, documento: "0000001701", tu: "2", tua: "S", fu: 20, anulado: "T" },
  ]);
  assert.equal(renglones.length, 1);
  assert.equal(anuladas, 1);
  assert.equal(renglones[0].cantidad, 60);
  // El mismo renglón que ya entró sin unidad (agente 1.0.5): la misma clave, para corregirlo y no duplicarlo.
  assert.equal(renglones[0].clave, renglonesDesdePuente([base]).renglones[0].clave);
});

test("compras, cargas, descargas y ajustes de Valery: con signo, en la principal y desde el corte", () => {
  const f = (p: Partial<FilaVentaPuente>): FilaVentaPuente => ({ fecha: "2026-10-01", tipo: "RCM", documento: "0000000900", cliente: "PROVEEDOR", codigo: "8145P95", producto: "P", cantidad: 24, neto: 0, tasa: 0, tu: "0", fu: 1, ...p });
  const { inventario, renglones, descartadas } = renglonesDesdePuente([
    f({}), f({ tipo: "DCM", cantidad: 2 }), f({ tipo: "AJS", cantidad: -250, tu: "2", fu: 50 }), f({ tipo: "CRG", cantidad: 3 }),
    f({ tipo: "DSC", cantidad: 1 }), f({ tipo: "FCM", cantidad: 0 }), f({ tipo: "AJS", cantidad: 0 }),
    f({ tipo: "RCM", fecha: "2026-09-20", cantidad: 5 }),
  ]);
  assert.equal(renglones.length, 0);
  assert.equal(descartadas, 2);   // la factura que solo factura una recepción y el ajuste que no cambió nada
  assert.deepEqual(inventario.map((r) => [r.tipo, r.cantidad]), [["RCM", 24], ["DCM", -2], ["AJS", -5], ["CRG", 3], ["DSC", -1], ["RCM", 5]]);
  assert.equal(new Set(inventario.map((r) => r.clave)).size, inventario.length);
  const base = inventarioParaLaBase(inventario, "2026-09-24");
  assert.equal(base.length, 5);   // la recepción de antes del corte ya está en la existencia
  assert.deepEqual(base.map((r) => [r.documento, r.direccion, r.cantidad]),
    [["RCM 0000000900", "entrada", 24], ["DCM 0000000900", "salida", 2], ["AJS 0000000900", "salida", 5], ["CRG 0000000900", "entrada", 3], ["DSC 0000000900", "salida", 1]]);
  assert.ok(base.every((r) => r.monto_usd === null));   // el costo de compra no se trae
});

test("1.0.7: Valery dice qué renglón de factura viene de una nota y de cuál; sin el dato, nada cambia", () => {
  assert.deepEqual(deNotasSegunValery({ mueve: "F", rel: 200, cobra_nota: "NET 0000009300" }), { deNotasValery: true, notaValery: "NET 0000009300" });
  assert.deepEqual(deNotasSegunValery({ mueve: "T", rel: 5, cobra_nota: "NET 0000009301" }), { deNotasValery: true, notaValery: "NET 0000009301" });
  assert.deepEqual(deNotasSegunValery({ mueve: "T", rel: 0, cobra_nota: null }), { deNotasValery: false, notaValery: null });
  assert.deepEqual(deNotasSegunValery({ mueve: "F", rel: 0, cobra_nota: null }), { deNotasValery: true, notaValery: null });   // Valery no la aplicó
  const fac: FilaVentaPuente = { fecha: "2026-10-14", tipo: "FAC", documento: "0000001596", cliente: "X", codigo: "BRGXL", producto: "P", cantidad: 200, neto: 1000, tasa: 200 };
  const [con, sin, net] = renglonesDesdePuente([
    { ...fac, mueve: "F", rel: 200, cobra_nota: "NET 0000009300" }, fac, { ...fac, tipo: "NET", documento: "0000009300", mueve: "T" },
  ]).renglones;
  assert.equal(con.deNotasValery, true);
  assert.equal(sin.deNotasValery, undefined);   // agente viejo: se sigue reconociendo como antes
  assert.equal(net.deNotasValery, undefined);   // solo las facturas
});
