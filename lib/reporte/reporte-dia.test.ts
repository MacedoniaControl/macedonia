import { test } from "node:test";
import assert from "node:assert/strict";
import { claseMov, contar, limitesDelDia, movsDesdeAgente, resumirMovs } from "./reporte-dia.ts";

// Filas como las da el pedido «movimientos» (respaldo de Valery, 26 y 27-feb-2026).
const fac = { cartera: "cxc", tipo: "FAC", documento: "0000001139", contraparte: "SERVICIOS Y SUMINISTROS V &amp; B, C.A", rif: "J080142489", fecha: "2026-02-26", hora: "09:31:18.0000", concepto: "Factura de Crédito No. FAC-0000001139 de SERVICIOS Y SUMINISTROS V &amp; B, C.A", moneda: "02", factor: 40.5, total: 81000, total_me: 2000, saldo: 81000 };
const ncr = { ...fac, tipo: "NCR", documento: "0000000116", hora: "11:30:43.0000", total: 4050, total_me: 100 };
const fcm = { cartera: "cxp", tipo: "FCM", documento: "000014", contraparte: "EMPRENDIMIENTO ROSIEL CHACON", fecha: "2026-02-26", hora: "11:23:58.7840", concepto: "FACTURA DE CREDITO", moneda: "01", factor: 1, total: 5000, total_me: null, saldo: 5000 };
const pag = { ...fcm, tipo: "PAG", documento: "0000000324", fecha: "2026-02-27", total: 3000, total_me: 74 };
const rtp = { ...fcm, tipo: "RTP", documento: "20260200000486", total: 120, total_me: 3 };

test("las filas del agente: hora normalizada, «&amp;» arreglado, dólares solo si Valery los trae", () => {
  const m = movsDesdeAgente([fac, fcm, { ...fac, cartera: "otra" }, { ...fac, documento: "" }, { ...fac, fecha: "ayer" }, null]);
  assert.equal(m.length, 2);
  assert.equal(m[0].hora, "09:31:18");
  assert.equal(m[0].contraparte, "SERVICIOS Y SUMINISTROS V &amp; B, C.A");   // el nombre se deja tal cual
  assert.equal(m[0].concepto, "Factura de Crédito No. FAC-0000001139 de SERVICIOS Y SUMINISTROS V & B, C.A");
  assert.equal(m[0].moneda, "USD");
  assert.equal(m[0].totalUsd, 2000);
  assert.equal(m[1].totalUsd, null);
});

test("cada tipo de Valery cae en su clase", () => {
  assert.equal(claseMov("FAC"), "documento");
  assert.equal(claseMov("FCM"), "documento");
  assert.equal(claseMov("NDB"), "documento");
  assert.equal(claseMov("PAG"), "pago");
  assert.equal(claseMov("NCR"), "nota_credito");
  assert.equal(claseMov("ANT"), "anticipo");
  for (const r of ["RTP", "RIR", "RTA", "RDD"]) assert.equal(claseMov(r), "retencion");
  assert.equal(claseMov("CHD"), "otro");
});

test("el resumen: por cartera y clase, en orden fijo; sin dólares de Valery en uno, el total en dólares no se inventa", () => {
  const r = resumirMovs(movsDesdeAgente([rtp, pag, fac, ncr, fcm]));
  assert.deepEqual(r.cxc.map((g) => [g.etiqueta, g.documentos, g.totalBs, g.totalUsd]), [
    ["Facturado a crédito", 1, 81000, 2000],
    ["Notas de crédito", 1, 4050, 100],
  ]);
  assert.deepEqual(r.cxp.map((g) => [g.etiqueta, g.documentos, g.totalBs, g.totalUsd]), [
    ["Comprado a crédito", 1, 5000, null],
    ["Pagado", 1, 3000, 74],
    ["Retenciones", 1, 120, 3],
  ]);
  assert.deepEqual(resumirMovs([]), { cxc: [], cxp: [] });
});

test("el día de Caracas en UTC (UTC-4)", () => {
  assert.deepEqual(limitesDelDia("2026-11-03"), { desde: "2026-11-03T04:00:00.000Z", hasta: "2026-11-04T04:00:00.000Z" });
});

test("contar suma cantidad y dólares", () => {
  assert.deepEqual(contar([{ usd: 10 }, { usd: 2.5 }]), { n: 2, usd: 12.5 });
  assert.deepEqual(contar([]), { n: 0, usd: 0 });
});
