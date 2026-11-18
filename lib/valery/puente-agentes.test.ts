import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirEstreno, ESPERA_ACTIVO, ESPERA_QUIETO, esperaDelAgente, huellaBase } from "./puente-agentes.ts";

const SUMI = { equipo: "SERVIDORSUD", base: "D:\\ValerySMB_7240\\datos\\valery3.mdf" };
const SUDE = { equipo: "RAUL", base: "D:\\ValerySMB_7177\\datos\\valery3.mdf" };

test("la huella es el equipo y la ruta, sin importar mayúsculas ni barras", () => {
  assert.equal(huellaBase(SUMI), "SERVIDORSUD|d:\\valerysmb_7240\\datos\\valery3.mdf");
  assert.equal(huellaBase({ equipo: "servidorsud ", base: "d:/ValerySMB_7240/datos/VALERY3.MDF" }), huellaBase(SUMI));
  assert.equal(huellaBase({ equipo: "RAUL" }), null);
  assert.equal(huellaBase(null), null);
});

test("el incidente del 18-11: el instalador de Sumigases en el servidor de Sudematin", () => {
  // Con el agente de Sudematin ya activo en RAUL: se rechaza.
  assert.deepEqual(decidirEstreno(SUDE, SUMI, [{ empresa: "sudematin", info: SUDE }]), { decision: "rechazar", empresa: "sudematin" });
  // Sin agente activo en Sudematin todavía: no se estrena solo, porque no es la base del agente de Sumigases.
  assert.deepEqual(decidirEstreno(SUDE, SUMI, []), { decision: "aprobar" });
});

test("reinstalar en el mismo servidor y la misma base se estrena solo", () => {
  assert.deepEqual(decidirEstreno({ ...SUMI, equipo: "servidorsud" }, SUMI, [{ empresa: "sudematin", info: SUDE }]), { decision: "estrenar" });
});

test("primera instalación, otro equipo o sin huella: lo aprueba una persona", () => {
  assert.deepEqual(decidirEstreno(SUMI, null, []), { decision: "aprobar" });
  assert.deepEqual(decidirEstreno({ equipo: "OTRO", base: SUMI.base }, SUMI, []), { decision: "aprobar" });
  assert.deepEqual(decidirEstreno({}, SUMI, []), { decision: "aprobar" });
  // Un activo viejo que no dijo su base tampoco deja estrenar solo.
  assert.deepEqual(decidirEstreno(SUMI, {}, []), { decision: "aprobar" });
});

test("el agente pregunta seguido justo después de un pedido", () => {
  const ahora = Date.parse("2026-11-18T20:00:00Z");
  assert.equal(esperaDelAgente("2026-11-18T19:59:00Z", ahora), ESPERA_ACTIVO);
  assert.equal(esperaDelAgente("2026-11-18T19:50:00Z", ahora), ESPERA_QUIETO);
  assert.equal(esperaDelAgente(null, ahora), ESPERA_QUIETO);
  assert.equal(esperaDelAgente("no es fecha", ahora), ESPERA_QUIETO);
});

test("el panel y el agente dicen la misma versión", async () => {
  const { readFile } = await import("node:fs/promises");
  const { AGENTE_ULTIMO } = await import("./puente.ts");
  const ps = await readFile(new URL("../../public/puente-valery/puente.ps1", import.meta.url), "utf8");
  assert.equal(/\$Version = '([\d.]+)'/.exec(ps)?.[1], AGENTE_ULTIMO);
});
