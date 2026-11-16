import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasDeNota, clienteRecordado, clientesParecidos, notaAlias, parecido } from "./cliente-parecido.ts";

const CARTERA = ["DEL SUR CORP", "CONSORCIO DEL SUR ENERGY", "CORPO ALASLKA", "ISMESOL C.A", "SERDISUR", "METALURGICA MUJICA", "TALLER LAGO C.A"];

test("los casos reales: el mismo cliente escrito distinto en Valery y en la cartera", () => {
  // Primero el que tiene todas sus palabras propias en común; el otro «DEL SUR» también se ofrece.
  assert.deepEqual(clientesParecidos("DEL SUR INTERNATIONAL CORP,C.A.", CARTERA).map((c) => c.contraparte), ["DEL SUR CORP", "CONSORCIO DEL SUR ENERGY"]);
  assert.deepEqual(clientesParecidos("CORPO ALASKA C.A", CARTERA).map((c) => c.contraparte), ["CORPO ALASLKA"]);
});

test("un nombre distinto no se parece por compartir palabras genéricas", () => {
  assert.equal(parecido("SERVICIOS Y SUMINISTROS V & B, C.A", "SERVICIOS INDUSTRIAL ORIENTE (SIO), C.A."), 0);
  assert.deepEqual(clientesParecidos("CAUCHOS 352, C.A (CAUCHOS 352,C.A.)", CARTERA), []);
  // SERDISUR no es «DEL SUR»: la palabra es otra.
  assert.equal(parecido("DEL SUR INTERNATIONAL CORP", "SERDISUR"), 0);
});

test("lo que ya se eligió se recuerda por la nota de la cuenta", () => {
  assert.equal(notaAlias(" DEL SUR INTERNATIONAL CORP,C.A. "), "Cliente en Valery: DEL SUR INTERNATIONAL CORP,C.A.");
  assert.equal(aliasDeNota("Cliente en Valery: DEL SUR INTERNATIONAL CORP,C.A. · otra cosa"), "DEL SUR INTERNATIONAL CORP,C.A.");
  assert.equal(aliasDeNota("Valery"), null);
  const cuentas = [
    { contraparte: "DEL SUR CORP", nota: notaAlias("DEL SUR INTERNATIONAL CORP,C.A."), creada: "2026-11-16T15:30:00Z" },
    { contraparte: "OTRO", nota: notaAlias("DEL SUR INTERNATIONAL CORP C A"), creada: "2026-11-01T10:00:00Z" },
    { contraparte: "ISMESOL C.A", nota: null, creada: "2026-11-16T15:31:00Z" },
  ];
  // El más reciente manda; los signos y «C.A.» no importan.
  assert.equal(clienteRecordado("DEL SUR INTERNATIONAL CORP, C.A", cuentas), "DEL SUR CORP");
  assert.equal(clienteRecordado("CORPO ALASKA C.A", cuentas), null);
});
