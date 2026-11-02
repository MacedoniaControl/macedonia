import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarDocsValery, diasParaVencer, docsDesdeAgente, resumirCarteraValery, saldoUsd } from "./cartera-valery.ts";

// Filas como las entregó el agente 1.0.3 el 2-nov-2026 (cxc).
const enDolares = { cliente: "Instituto de Estudios Superiores de Administración", cliente_codigo: "J000675473", documento: "0000001182", emision: "2026-03-19", factor: 455.25, moneda: "02", rif: "J000675473", saldo: 559775.4, tipo: "FAC", total: 559775.4, vencimiento: "2026-03-26", vendedor: "01" };
const enBolivares = { cliente: "ALIVA STUMP, C.A.", cliente_codigo: "J000010307", documento: "0000001626", emision: "2026-10-19", factor: 1, moneda: "01", rif: "J000010307", saldo: 525475.97, tipo: "FAC", total: 525475.97, vencimiento: "2026-11-26", vendedor: "01" };

test("las filas del agente se leen; sin documento, fecha o saldo se descartan", () => {
  const { docs, descartadas } = docsDesdeAgente("cxc", [enDolares, enBolivares, { ...enBolivares, documento: "" }, { ...enBolivares, saldo: 0 }, { ...enBolivares, emision: "ayer" }, null]);
  assert.equal(descartadas, 4);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].contraparte, "Instituto de Estudios Superiores de Administración");
  assert.equal(docs[0].moneda, "USD");
  assert.equal(docs[1].moneda, "Bs");
  // Por pagar: la contraparte es el proveedor.
  const p = docsDesdeAgente("cxp", [{ tipo: "FCM", documento: "00017093", proveedor: "AGRO PETS BNA, C.A", numero_control: "MHZ7C7030916", emision: "2025-10-08", vencimiento: "2025-10-08", moneda: "01", factor: 1, total: 927, saldo: 831.1 }]);
  assert.equal(p.docs[0].contraparte, "AGRO PETS BNA, C.A");
  assert.equal(p.docs[0].numeroControl, "MHZ7C7030916");
});

test("el mismo documento dos veces no repite la clave de la fila", () => {
  const { docs } = docsDesdeAgente("cxc", [enBolivares, enBolivares]);
  assert.notEqual(docs[0].clave, docs[1].clave);
});

test("dólares: el documento en dólares a su tasa; el de bolívares a la de hoy; sin tasa, null", () => {
  const { docs: [usd, bs] } = docsDesdeAgente("cxc", [enDolares, enBolivares]);
  assert.deepEqual(saldoUsd(usd, 889.5754), { usd: 559775.4 / 455.25, de: "documento" });
  assert.deepEqual(saldoUsd(bs, 889.5754), { usd: 525475.97 / 889.5754, de: "hoy" });
  assert.equal(saldoUsd(bs, null), null);
  assert.deepEqual(saldoUsd(usd, null), { usd: 559775.4 / 455.25, de: "documento" });
});

test("vencimiento: negativo es vencido; sin fecha (o antes de emitirse) vence el día que se emitió", () => {
  const { docs: [usd, bs] } = docsDesdeAgente("cxc", [enDolares, enBolivares]);
  assert.equal(diasParaVencer(usd, "2026-03-28"), -2);
  assert.equal(diasParaVencer(bs, "2026-11-02"), 24);
  assert.equal(diasParaVencer({ ...bs, vencimiento: null }, "2026-10-20"), -1);
  assert.equal(diasParaVencer({ ...bs, vencimiento: "2026-10-01" }, "2026-10-19"), 0);
});

test("el resumen suma en bolívares y en dólares; sin tasa de hoy no inventa el total en dólares", () => {
  const { docs } = docsDesdeAgente("cxc", [enDolares, enBolivares, { ...enBolivares, documento: "0000001561", cliente: "aliva stump, c.a.", emision: "2026-09-25", vencimiento: "2026-10-02", saldo: 379164.49 }]);
  const r = resumirCarteraValery(docs, "2026-11-02", 889.5754);
  assert.equal(r.documentos, 3);
  assert.equal(r.contrapartes, 2);
  assert.equal(r.vencidos, 2);
  assert.ok(Math.abs(r.saldoBs - (559775.4 + 525475.97 + 379164.49)) < 1e-6);
  assert.ok(Math.abs(r.vencidoBs - (559775.4 + 379164.49)) < 1e-6);
  assert.ok(Math.abs(r.saldoUsd! - (559775.4 / 455.25 + (525475.97 + 379164.49) / 889.5754)) < 1e-6);
  assert.equal(r.ultimaEmision, "2026-10-19");
  assert.equal(r.masVieja, "2026-03-19");
  const sin = resumirCarteraValery(docs, "2026-11-02", null);
  assert.equal(sin.saldoUsd, null);
  assert.equal(sin.vencidoUsd, null);
  assert.equal(resumirCarteraValery([], "2026-11-02", 1).ultimaEmision, null);
});

test("se busca por cliente, RIF o número sin ceros", () => {
  const { docs } = docsDesdeAgente("cxc", [enDolares, enBolivares]);
  assert.equal(buscarDocsValery(docs, "aliva").length, 1);
  assert.equal(buscarDocsValery(docs, "J000675473").length, 1);
  assert.equal(buscarDocsValery(docs, "1626")[0].documento, "0000001626");
  assert.equal(buscarDocsValery(docs, "  ").length, 2);
});

test("documento en dólares: si Valery manda su saldo en dólares (1.0.4), se usa ese", () => {
  const { docs: [usd, bs] } = docsDesdeAgente("cxc", [{ ...enDolares, saldo_me: 1200.5 }, { ...enBolivares, saldo_me: 590.7 }]);
  assert.deepEqual(saldoUsd(usd, 889.5754), { usd: 1200.5, de: "documento" });
  // El de bolívares sigue a la tasa de hoy: su «saldo en dólares» es a la tasa vieja del documento.
  assert.deepEqual(saldoUsd(bs, 889.5754), { usd: 525475.97 / 889.5754, de: "hoy" });
  assert.equal(docsDesdeAgente("cxc", [enDolares]).docs[0].saldoMe, null);
});
