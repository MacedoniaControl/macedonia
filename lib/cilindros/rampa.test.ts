import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargaConteo, conSigno, diferencias, leerCantidad, renglonesDe, saldoAlAprobar } from "./rampa.ts";

const lineas = [
  { gas: "OXIGENO", contado: { lleno: 50, vacio: 4 }, visto: { lleno: 56, vacio: 0 } },
  { gas: "ARGON", contado: { lleno: 16, vacio: 1 }, visto: { lleno: 16, vacio: 1 } },
];

test("solo quedan los renglones que no cuadran, con su signo", () => {
  assert.deepEqual(diferencias(renglonesDe(lineas)), [
    { gas: "OXIGENO", estado: "lleno", sistema: 56, contado: 50, diferencia: -6 },
    { gas: "OXIGENO", estado: "vacio", sistema: 0, contado: 4, diferencia: 4 },
  ]);
});

test("sin diferencias no hay nada que aprobar", () => {
  assert.deepEqual(diferencias(renglonesDe([lineas[1]])), []);
});

test("lo que se envía lleva lo contado y lo que se vio", () => {
  assert.deepEqual(cargaConteo([lineas[0]]), [{ gas: "OXIGENO", lleno: 50, vacio: 4, visto_lleno: 56, visto_vacio: 0 }]);
});

test("aprobar aplica la diferencia vista al contar, no pisa lo que pasó después", () => {
  // Se contaron 50 de 56 (faltan 6). Antes de aprobar salió una entrega de 3: hoy hay 53.
  assert.equal(saldoAlAprobar(53, { diferencia: -6 }), 47);
});

test("signos legibles", () => {
  assert.equal(conSigno(4), "+4");
  assert.equal(conSigno(-6), "−6");
  assert.equal(conSigno(0), "0");
});

test("el campo de cantidad acepta quedar vacío mientras se escribe", () => {
  assert.equal(leerCantidad(""), null);
  assert.equal(leerCantidad(" 12 "), 12);
  assert.equal(leerCantidad("0"), 0);
  assert.equal(leerCantidad("-3"), null);
  assert.equal(leerCantidad("1.5"), null);
});

const sql = readFileSync(new URL("../../supabase/27-conteos-cilindros.sql", import.meta.url), "utf8");

test("27: contar no ajusta y aprobar es de la gerencia", () => {
  const registrar = sql.slice(sql.indexOf("function public.registrar_conteo_cilindros"), sql.indexOf("-- ---------------------------------------------------------------- 6."));
  assert.doesNotMatch(registrar, /insert into public\.cilindros_mov/);
  assert.match(registrar, /puede_operar_cilindros\(\)/);
  const aprobar = sql.slice(sql.indexOf("function public.aprobar_conteo_cilindros"), sql.indexOf("-- ---------------------------------------------------------------- 7."));
  assert.match(aprobar, /puede_finanzas\(\)/);
  assert.match(aprobar, /insert into public\.cilindros_mov/);
  assert.match(aprobar, /queda < 0/);
});

test("27: un solo pendiente por empresa y el técnico sin altas ni bajas sueltas", () => {
  assert.match(sql, /unique index if not exists cil_conteo_un_pendiente[\s\S]*where estado = 'pendiente'/);
  const politica = sql.slice(sql.indexOf("create policy cil_mov_inserta"), sql.indexOf("-- ---------------------------------------------------------------- 4."));
  assert.match(politica, /estado_desde is not null and estado_hacia is not null/);
  assert.match(politica, /estado_hacia = 'vacio' and cliente is not null/);
  assert.match(sql, /rechazar_conteo_cilindros[\s\S]*Indica por qué se rechaza/);
});

const sql28 = readFileSync(new URL("../../supabase/28-cilindros-sin-negativos.sql", import.meta.url), "utf8");

test("28: la base no deja saldos negativos ni clientes debiendo menos de cero", () => {
  assert.match(sql28, /create trigger cil_mov_sin_negativos after insert or update on public\.cilindros_mov/);
  assert.match(sql28, /having sum\(t\.d\) < 0/);
  assert.match(sql28, /No puede devolver más de los que tiene/);
  assert.match(sql28, /pg_advisory_xact_lock\(hashtext\('cil_saldo:'/);
});

test("28: la fecha de los movimientos es la de Venezuela", () => {
  assert.match(sql28, /alter column fecha set default \(\(now\(\) at time zone 'America\/Caracas'\)::date\)/);
});

test("la prueba completa de cilindros deshace todo al final", () => {
  const p = readFileSync(new URL("../../supabase/pruebas/prueba-cilindros.sql", import.meta.url), "utf8");
  assert.match(p, /raise exception 'FIN_DE_LA_PRUEBA'/);
  assert.match(p, /revoke execute on function public\.probar_cilindros_tmp\(\) from public, anon, authenticated/);
});
