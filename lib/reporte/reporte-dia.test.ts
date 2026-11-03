import { test } from "node:test";
import assert from "node:assert/strict";
import { armarSerie, claseMov, contar, cubetas, etiquetaCubeta, etiquetaPeriodo, limitesDelDia, limitesDelRango, moverPeriodo, movsDesdeAgente, puntosMovs, rangoDe, resumirMovs } from "./reporte-dia.ts";

// Filas como las da el pedido «movimientos» (respaldo de Valery, 26 y 27-feb-2026).
const fac = { cartera: "cxc", tipo: "FAC", documento: "0000001139", contraparte: "SERVICIOS Y SUMINISTROS V &amp; B, C.A", rif: "J080142489", fecha: "2026-02-26", hora: "09:31:18.0000", concepto: "Factura de Crédito No. FAC-0000001139 de SERVICIOS Y SUMINISTROS V &amp; B, C.A", moneda: "02", factor: 40.5, total: 81000, total_me: 2000, saldo: 81000 };
const ncr = { ...fac, tipo: "NCR", documento: "0000000116", hora: "11:30:43.0000", total: 4050, total_me: 100 };
const fcm = { cartera: "cxp", tipo: "FCM", documento: "000014", contraparte: "EMPRENDIMIENTO ROSIEL CHACON", fecha: "2026-02-26", hora: "11:23:58.7840", concepto: "FACTURA DE CREDITO", moneda: "01", factor: 1, total: 5000, total_me: 5000, saldo: 5000 };
// En los documentos en bolívares Valery repite el monto en bolívares en su campo «en dólares».
const pag = { ...fcm, tipo: "PAG", documento: "0000000324", fecha: "2026-02-27", total: 3000, total_me: 3000 };
const rtp = { ...fcm, tipo: "RTP", documento: "20260200000486", total: 120, total_me: 120 };
const pagUsd = { ...pag, documento: "0000000325", moneda: "02", factor: 40.5, total: 2997, total_me: 74 };

test("las filas del agente: hora normalizada, «&amp;» arreglado, dólares solo en documentos en dólares", () => {
  const m = movsDesdeAgente([fac, fcm, { ...fac, cartera: "otra" }, { ...fac, documento: "" }, { ...fac, fecha: "ayer" }, null]);
  assert.equal(m.length, 2);
  assert.equal(m[0].hora, "09:31:18");
  assert.equal(m[0].contraparte, "SERVICIOS Y SUMINISTROS V &amp; B, C.A");   // el nombre se deja tal cual
  assert.equal(m[0].concepto, "Factura de Crédito No. FAC-0000001139 de SERVICIOS Y SUMINISTROS V & B, C.A");
  assert.equal(m[0].moneda, "USD");
  assert.equal(m[0].totalUsd, 2000);
  assert.equal(m[1].totalUsd, null);   // en bolívares: el 5000 de Valery no son dólares
  assert.equal(movsDesdeAgente([{ ...fac, total_me: null }])[0].totalUsd, null);
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
  const r = resumirMovs(movsDesdeAgente([rtp, pag, pagUsd, fac, ncr, fcm]));
  assert.deepEqual(r.cxc.map((g) => [g.etiqueta, g.documentos, g.totalBs, g.totalUsd]), [
    ["Facturado a crédito", 1, 81000, 2000],
    ["Notas de crédito", 1, 4050, 100],
  ]);
  assert.deepEqual(r.cxp.map((g) => [g.etiqueta, g.documentos, g.totalBs, g.totalUsd]), [
    ["Comprado a crédito", 1, 5000, null],
    ["Pagado", 2, 5997, null],   // uno en bolívares: el total en dólares no se inventa
    ["Retenciones", 1, 120, null],
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

test("períodos: día, semana de lunes a domingo, mes y año, cortados en hoy", () => {
  const hoy = "2026-11-03";   // martes
  assert.deepEqual(rangoDe("dia", "2026-11-01", hoy), { desde: "2026-11-01", hasta: "2026-11-01" });
  assert.deepEqual(rangoDe("semana", hoy, hoy), { desde: "2026-11-02", hasta: "2026-11-03" });
  assert.deepEqual(rangoDe("semana", "2026-11-01", hoy), { desde: "2026-10-26", hasta: "2026-11-01" });   // domingo: semana anterior
  assert.deepEqual(rangoDe("mes", hoy, hoy), { desde: "2026-11-01", hasta: "2026-11-03" });
  assert.deepEqual(rangoDe("mes", "2026-02-10", hoy), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoDe("mes", "2024-02-10", hoy), { desde: "2024-02-01", hasta: "2024-02-29" });     // bisiesto
  assert.deepEqual(rangoDe("anio", hoy, hoy), { desde: "2026-01-01", hasta: "2026-11-03" });
  assert.deepEqual(rangoDe("anio", "2025-06-30", hoy), { desde: "2025-01-01", hasta: "2025-12-31" });
});

test("moverse al período anterior y al siguiente", () => {
  assert.equal(moverPeriodo("dia", "2026-11-01", -1), "2026-10-31");
  assert.equal(moverPeriodo("semana", "2026-11-03", -1), "2026-10-27");
  assert.equal(moverPeriodo("mes", "2026-03-31", -1), "2026-02-01");   // sin desbordar a marzo
  assert.equal(moverPeriodo("mes", "2026-12-15", 1), "2027-01-01");
  assert.equal(moverPeriodo("anio", "2026-11-03", -1), "2025-01-01");
});

test("nombres del período y de las filas del desglose", () => {
  assert.equal(etiquetaPeriodo("dia", "2026-11-03", "2026-11-03"), "03-11-2026");
  assert.equal(etiquetaPeriodo("semana", "2026-11-02", "2026-11-03"), "semana del 02-11-2026 al 03-11-2026");
  assert.equal(etiquetaPeriodo("mes", "2026-11-01", "2026-11-03"), "Noviembre 2026");
  assert.equal(etiquetaPeriodo("anio", "2026-01-01", "2026-11-03"), "2026");
  assert.deepEqual(cubetas("dia", "2026-11-03", "2026-11-03"), []);
  assert.deepEqual(cubetas("semana", "2026-11-02", "2026-11-04"), ["2026-11-02", "2026-11-03", "2026-11-04"]);
  assert.deepEqual(cubetas("anio", "2026-01-01", "2026-03-10"), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(etiquetaCubeta("mes", "2026-11-03"), "mar 03-11");
  assert.equal(etiquetaCubeta("anio", "2026-02"), "Febrero");
  assert.deepEqual(limitesDelRango("2026-11-01", "2026-11-03"), { desde: "2026-11-01T04:00:00.000Z", hasta: "2026-11-04T04:00:00.000Z" });
});

test("el desglose suma por día o por mes; la columna que no se ve no existe", () => {
  const ventas = [{ fecha: "2026-02-03", valor: 10 }, { fecha: "2026-02-20", valor: 5 }, { fecha: "2026-03-01", valor: 1 }];
  const s = armarSerie("anio", "2026-01-01", "2026-03-10", { ventas, gastos: null, cobrado: [] });
  assert.deepEqual(s.map((f) => [f.etiqueta, f.valores]), [
    ["Enero", { ventas: 0, cobrado: 0 }],
    ["Febrero", { ventas: 15, cobrado: 0 }],
    ["Marzo", { ventas: 1, cobrado: 0 }],
  ]);
  assert.equal("gastos" in s[0].valores, false);
  const movs = movsDesdeAgente([fac, ncr, pag, fcm]);
  assert.deepEqual(puntosMovs(movs, "cxc", "documento"), [{ fecha: "2026-02-26", valor: 81000 }]);
  assert.deepEqual(puntosMovs(movs, "cxp", "pago"), [{ fecha: "2026-02-27", valor: 3000 }]);
});
