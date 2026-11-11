import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerXls } from "../ux/xls.ts";
import {
  COLUMNAS_VENTAS, clienteNormal, errorDeVentas, facturasAjenas, formatoDe, leerVentas, notasFacturadas, planVentas,
  renglonesParaLaBase, type RenglonVenta,
} from "./ventas-valery.ts";

const xls = (n: string) => {
  const b = readFileSync(new URL(`../ux/__fixtures__/${n}`, import.meta.url));
  return leerXls(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

test("reconoce los dos formatos del reporte por la cabecera", () => {
  assert.equal(formatoDe([...COLUMNAS_VENTAS.completo]), "completo");
  assert.equal(formatoDe([...COLUMNAS_VENTAS.agrupado]), "agrupado");
  assert.equal(formatoDe(["Fecha Emision", "Tipo Doc"]), null);
});

test("otro reporte se rechaza y dice cuál es", () => {
  assert.match(errorDeVentas(["Fecha Emision", "Tipo Doc.", "Documento", "No. de Nota de Debito", "No. de Nota de Credito", "Factura Afectada", "No. Expediente", "Razon Social", "RIF", "Factor Cambio"]) ?? "", /libro de compras/);
  assert.match(errorDeVentas(["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Concepto", "Saldo Inicial"]) ?? "", /estado de cuenta/);
  const cab = [...COLUMNAS_VENTAS.completo]; cab[4] = "Cant.";
  assert.match(errorDeVentas(cab) ?? "", /columna 5 debía decir «Cantidad»/);
});

test("el formato completo: un renglón por fila, la de totales se ignora", () => {
  const l = leerVentas(xls("ventas-completo.xls"));
  assert.equal(l.formato, "completo");
  assert.equal(l.renglones.length, 5);
  assert.deepEqual(l.problemas, []);
  assert.deepEqual(l.renglones.map((r) => `${r.fecha} ${r.tipo} ${r.documento} ${r.codigo} ${r.cantidad}`), [
    "2026-09-25 NET 0000009001 PRB-OXI 2", "2026-09-25 FAC 0000001501 PRB-OXI 2",
    "2026-09-26 FAC 0000001502 PRB-ELE 3", "2026-09-26 FAC 0000001502 PRB-DIS 1", "2026-09-27 DEV 0000000701 PRB-DIS 1",
  ]);
  assert.equal(l.renglones[0].ventaUsd, 2);
});

test("el formato agrupado da lo mismo: los renglones siguientes heredan el documento", () => {
  const a = leerVentas(xls("ventas-agrupado.xls"));
  const c = leerVentas(xls("ventas-completo.xls"));
  assert.equal(a.formato, "agrupado");
  assert.deepEqual(a.renglones.map((r) => r.clave), c.renglones.map((r) => r.clave));
  assert.equal(a.renglones[3].cliente, "CLIENTE ÑANDÚ, C.A. (ÑANDÚ)");
});

const r = (p: Partial<RenglonVenta> & Pick<RenglonVenta, "fecha" | "tipo" | "documento" | "codigo">): RenglonVenta => {
  const x = { fila: 0, cliente: "CLIENTE X, C.A.", producto: "P", cantidad: 1, netoBs: 100, tasa: 100, ventaUsd: 1, clave: "", ...p };
  return { ...x, clave: x.clave || `V|${x.fecha}|${x.tipo}|${x.documento}|${x.codigo}|${x.cantidad}|1` };
};

test("dos renglones iguales en una factura son dos: no se pisan", () => {
  const l = leerVentas([[...COLUMNAS_VENTAS.completo],
    [46290, "FAC", "0000001501", "X", 2, "OXI", "OXI6", 100, 16, 0, 116, 50, 2.32, 116, 2.32, 0, 0, 50, 1, 50, 1, 50],
    [46290, "FAC", "0000001501", "X", 2, "OXI", "OXI6", 100, 16, 0, 116, 50, 2.32, 116, 2.32, 0, 0, 50, 1, 50, 1, 50]]);
  assert.equal(l.renglones.length, 2);
  assert.notEqual(l.renglones[0].clave, l.renglones[1].clave);
});

test("la factura de una nota del mismo día no descuenta (aunque la tasa tenga otros decimales)", () => {
  const nota = r({ fecha: "2026-09-24", tipo: "NET", documento: "9001", codigo: "OXI6", ventaUsd: 7800 });
  const fac = r({ fecha: "2026-09-24", tipo: "FAC", documento: "1501", codigo: "OXI6", ventaUsd: 7800.004, cliente: "Cliente X C.A" });
  assert.deepEqual([...notasFacturadas([nota, fac]).facturas], [fac.clave]);
});

test("la factura de una nota de días antes: entera si tiene 2+ renglones, exacta si tiene 1", () => {
  const n1 = r({ fecha: "2026-09-24", tipo: "NET", documento: "9001", codigo: "A", ventaUsd: 10 });
  const n2 = r({ fecha: "2026-09-25", tipo: "NET", documento: "9002", codigo: "B", ventaUsd: 20 });
  const f = [r({ fecha: "2026-10-10", tipo: "FAC", documento: "1501", codigo: "A", ventaUsd: 10.2 }), r({ fecha: "2026-10-10", tipo: "FAC", documento: "1501", codigo: "B", ventaUsd: 20 })];
  assert.equal(notasFacturadas([n1, n2, ...f]).facturas.size, 2);
  // Falta una de las dos notas: la factura es venta propia.
  assert.equal(notasFacturadas([n1, ...f]).facturas.size, 0);
  // De 1 renglón: solo hasta 7 días.
  const f1 = r({ fecha: "2026-10-10", tipo: "FAC", documento: "1502", codigo: "A", ventaUsd: 10 });
  assert.equal(notasFacturadas([n1, f1]).facturas.size, 0);
  assert.equal(notasFacturadas([{ ...n1, fecha: "2026-10-05" }, f1]).facturas.size, 1);
});

test("si la nota se devolvió antes de facturar, la factura sí descuenta", () => {
  const n1 = r({ fecha: "2026-09-24", tipo: "NET", documento: "9001", codigo: "A", ventaUsd: 10 });
  const d = r({ fecha: "2026-09-26", tipo: "DEV", documento: "701", codigo: "A", ventaUsd: -10 });
  const f = r({ fecha: "2026-09-27", tipo: "FAC", documento: "1501", codigo: "A", ventaUsd: 10 });
  assert.equal(notasFacturadas([n1, d, f]).facturas.size, 0);
});

test("una nota se factura una sola vez", () => {
  const n1 = r({ fecha: "2026-09-24", tipo: "NET", documento: "9001", codigo: "A", ventaUsd: 10 });
  const f1 = r({ fecha: "2026-09-24", tipo: "FAC", documento: "1501", codigo: "A", ventaUsd: 10 });
  const f2 = r({ fecha: "2026-09-24", tipo: "FAC", documento: "1502", codigo: "A", ventaUsd: 10 });
  assert.equal(notasFacturadas([n1, f1, f2]).facturas.size, 1);
});

test("una factura nueva reconoce la nota de una importación anterior; reimportar da lo mismo", () => {
  const previa = { clave: "V|nota-vieja", fecha: "2026-09-24", cliente: "CLIENTE X, C.A.", codigo: "A", cantidad: 1, ventaUsd: 10, documento: "9001", facturadaCon: null };
  const f = r({ fecha: "2026-09-26", tipo: "FAC", documento: "1501", codigo: "A", ventaUsd: 10 });
  const p = planVentas([f], "2026-09-24", [previa]);
  assert.equal(p.movimientos.length, 0);
  assert.deepEqual(p.notasPrevias, [{ renglon: "V|nota-vieja", factura: "FAC 1501" }]);
  // Ya marcada por esta misma factura: sigue reconocida. Por otra: no.
  assert.equal(planVentas([f], "2026-09-24", [{ ...previa, facturadaCon: "FAC 1501" }]).movimientos.length, 0);
  assert.equal(planVentas([f], "2026-09-24", [{ ...previa, facturadaCon: "FAC 1400" }]).movimientos.length, 1);
});

test("plan: salidas, entradas, nada antes del corte", () => {
  const l = leerVentas(xls("ventas-completo.xls"));
  const p = planVentas(l.renglones, "2026-09-26");
  assert.equal(p.antesDelCorte, 2);   // la NET y su FAC del 25
  assert.deepEqual(p.movimientos.map((m) => `${m.direccion} ${m.documento} ${m.codigo}`), [
    "salida FAC 0000001502 PRB-ELE", "salida FAC 0000001502 PRB-DIS", "entrada DEV 0000000701 PRB-DIS"]);
  // Con el corte el 25: la FAC 1501 factura la NET 9001 del mismo día y no descuenta.
  const q = planVentas(l.renglones, "2026-09-25");
  assert.equal(q.facturasDeNotas, 1);
  assert.equal(q.movimientos.find((m) => m.tipo === "NET")?.facturadaCon, "FAC 0000001501");
  // Esa factura es la venta: sus renglones van aparte, sin tocar la existencia.
  assert.deepEqual(q.facturasNotas.map((m) => `${m.documento} ${m.codigo}`), ["FAC 0000001501 PRB-OXI"]);
  const base = renglonesParaLaBase(q, true);
  assert.deepEqual(base.filter((b) => "de_notas" in b).map((b) => b.documento), ["FAC 0000001501"]);
  assert.equal(base.length, q.movimientos.length + 1);
  // Sin la migración 51 no se mandan: la base vieja las metería al kardex.
  assert.equal(renglonesParaLaBase(q, false).length, q.movimientos.length);
  assert.equal(renglonesParaLaBase(q, false).some((b) => "de_notas" in b), false);
});

test("releer un rango largo marca la misma nota que la primera vez, no otra igual del cliente", () => {
  const nota = { fecha: "2026-09-24", cliente: "CLIENTE X, C.A.", codigo: "A", cantidad: 1, ventaUsd: 10, facturadaCon: null };
  const libre = { ...nota, clave: "V|libre", documento: "9001" };
  const marcada = { ...nota, clave: "V|marcada", documento: "9002", facturadaCon: "FAC 1501" };
  const f = r({ fecha: "2026-09-26", tipo: "FAC", documento: "1501", codigo: "A", ventaUsd: 10 });
  const p = planVentas([f], "2026-09-24", [libre, marcada]);
  assert.equal(p.facturasNotas.length, 1);
  assert.deepEqual(p.notasPrevias, [{ renglon: "V|marcada", factura: "FAC 1501" }]);
});

test("facturas de la otra empresa: el archivo está en la carpeta equivocada", () => {
  const f = r({ fecha: "2026-09-24", tipo: "FAC", documento: "0000023054", codigo: "A" });
  assert.deepEqual(facturasAjenas([f], "sumigases"), ["0000023054"]);
  assert.deepEqual(facturasAjenas([f], "sudematin"), []);
});

test("el cliente se compara sin tildes, sin C.A. y sin el alias", () => {
  assert.equal(clienteNormal("Cliente Ñandú, C.A. (ÑANDÚ)"), "CLIENTE NANDU");
  assert.equal(clienteNormal("VENCEMENT. C.A"), clienteNormal("Vencement, C.A."));
});

test("una nota de antes del 1.0.6 en otra unidad: la factura la reconoce con la cantidad que trae ahora el agente", () => {
  // En la base quedó con 20 «UND» (sin convertir); el agente la trae ahora en cajas de 20: 1.
  const previa = { clave: "V|nota-und", fecha: "2026-09-24", cliente: "CLIENTE X, C.A.", codigo: "8145P95", cantidad: 20, ventaUsd: 10, documento: "9001", facturadaCon: null };
  const nota = r({ fecha: "2026-09-24", tipo: "NET", documento: "9001", codigo: "8145P95", cantidad: 1, ventaUsd: 10, clave: "V|nota-und" });
  const f = r({ fecha: "2026-09-24", tipo: "FAC", documento: "1501", codigo: "8145P95", cantidad: 1, ventaUsd: 10 });
  const p = planVentas([nota, f], "2026-09-24", [previa]);
  assert.deepEqual(p.notasPrevias, [{ renglon: "V|nota-und", factura: "FAC 1501" }]);
  assert.equal(p.facturasDeNotas, 1);
});

test("con el agente 1.0.7 no se adivina: la factura que Valery enlaza a una nota no descuenta y la nota toma esa factura", () => {
  // La FAC 1596 no se parece a la nota (otro monto, 4 días después): antes se escapaba y descontaba otra vez.
  const nota = r({ fecha: "2026-10-10", tipo: "NET", documento: "9300", codigo: "BRGXL", cantidad: 200, ventaUsd: 30 });
  const previa = { clave: "V|net-vieja", fecha: "2026-10-01", cliente: "OTRO", codigo: "OXI6", cantidad: 1, ventaUsd: 5, documento: "9200", facturadaCon: null };
  const fac = r({ fecha: "2026-10-14", tipo: "FAC", documento: "1596", codigo: "BRGXL", cantidad: 200, ventaUsd: 55, deNotasValery: true, notaValery: "NET 9300" });
  const fac2 = r({ fecha: "2026-10-14", tipo: "FAC", documento: "1597", codigo: "OXI6", cantidad: 1, ventaUsd: 99, deNotasValery: true, notaValery: "NET 9200" });
  const suelta = r({ fecha: "2026-10-14", tipo: "FAC", documento: "1598", codigo: "BRGXL", cantidad: 200, ventaUsd: 30, deNotasValery: false, notaValery: null });
  const p = planVentas([nota, fac, fac2, suelta], "2026-09-24", [previa]);
  assert.deepEqual(p.facturasNotas.map((m) => m.documento).sort(), ["FAC 1596", "FAC 1597"]);
  // La 1598 se parece a la nota (mismo cliente, código, cantidad y monto) pero Valery dice que descontó: descuenta.
  assert.deepEqual(p.movimientos.map((m) => [m.documento, m.facturadaCon]), [["NET 9300", "FAC 1596"], ["FAC 1598", null]]);
  assert.deepEqual(p.notasPrevias, [{ renglon: "V|net-vieja", factura: "FAC 1597" }]);
});
