import { test } from "node:test";
import assert from "node:assert/strict";
import { documentoAnexo, yaAnexados } from "./anexar.ts";

test("el número del papel se guarda con su prefijo, como lo de Valery", () => {
  assert.equal(documentoAnexo("nota_entrega", "9150"), "NE-9150");
  assert.equal(documentoAnexo("nota_entrega", " ne 9150 "), "NE-9150");
  assert.equal(documentoAnexo("nota_entrega", "NE-9150"), "NE-9150");
  assert.equal(documentoAnexo("factura", "000123"), "FAC-000123");
  assert.equal(documentoAnexo("nota_debito", "45"), "ND-45");
  assert.equal(documentoAnexo("nota_entrega", "FCM-80817"), "FCM-80817", "otro prefijo se respeta");
});

test("en por pagar, los prefijos de Valery para proveedores", () => {
  assert.equal(documentoAnexo("factura", "80817", "pagar"), "FCM-80817");
  assert.equal(documentoAnexo("nota_entrega", "4695", "pagar"), "NDE-4695");
  assert.equal(documentoAnexo("factura", "fcm 80817", "pagar"), "FCM-80817");
});

test("no deja anexar un número que el cliente ya tiene, venga como venga escrito", () => {
  const delCliente = ["NE-8463·BENITO", "NE-9068", "NE-0000009138"];
  assert.deepEqual(yaAnexados("NE-8463", delCliente), ["NE-8463·BENITO"]);
  assert.deepEqual(yaAnexados("NE-9138", delCliente), ["NE-0000009138"]);
  assert.deepEqual(yaAnexados("NE-9150", delCliente), []);
  assert.deepEqual(yaAnexados("", delCliente), []);
});
