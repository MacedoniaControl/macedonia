import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// La migracion no se puede correr aquí: no hay Postgres local, y el SQL Editor
// de Supabase esta pendiente de pago. Estas pruebas fijan los dos errores que
// ya costaron caro con la 21.
describe("migración 22: departamentos de Valery", () => {
  const sql = fs.readFileSync("supabase/22-departamentos.sql", "utf8");
  const sinComentarios = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  test("la columna nueva recibe su permiso de lectura", () => {
    // productos tiene permisos POR COLUMNA. Sin esto, pedir `departamento`
    // falla para todo usuario, y la pantalla entera se cae con el error.
    assert.match(sql, /grant select \(departamento\) on public\.productos to authenticated/);
  });

  test("toda tabla va calificada con public.", () => {
    // El SQL Editor no siempre busca en public: la 21 fallo por eso.
    for (const m of sinComentarios.matchAll(/\b(?:table|on|into|update|references|from)\s+(?:if (?:not )?exists\s+)?(?!public\.|\(|conflict|values|if\b|set\b)([a-z_]+)\b/g)) {
      assert.fail(`"${m[0]}" no está calificada con public.`);
    }
  });

  test("carga los 26 departamentos y asigna los 2.207 productos", () => {
    const deps = sql.match(/^\s+\('sumigases', '\d{2}', '[^']+'\)/gm) ?? [];
    const asignados = sql.match(/^\s+\('[^']*', '\d{2}'\)/gm) ?? [];
    assert.equal(deps.length, 26);
    assert.equal(asignados.length, 2207);
  });

  test("se puede correr dos veces sin romperse", () => {
    assert.match(sql, /create table if not exists public\.departamentos/);
    assert.match(sql, /add column if not exists departamento/);
    assert.match(sql, /drop constraint if exists productos_departamento_fk/);
    assert.match(sql, /drop policy if exists departamentos_leer/);
    assert.match(sql, /on conflict \(empresa_id, codigo\) do update/);
  });

  test("01 DIRECTO y 17 ACTIVOS SUDEMATIN no entran al conteo", () => {
    // Decision del owner del 23-09-2026. Queda como dato, no escrito en el
    // codigo: si mañana cambia, se cambia una fila.
    assert.match(sql, /se_cuenta\s+boolean not null default true/);
    assert.match(sql, /update public\.departamentos set se_cuenta = false\s+where empresa_id = 'sumigases' and codigo in \('01', '17'\)/);
  });

  test("FLETE y las dos recargas de gas no entran al conteo", () => {
    // No son mercancia fisica, y sus departamentos (OXICORTE, GASES) si se
    // cuentan: la marca tiene que ser del producto, no del departamento.
    assert.match(sql, /add column if not exists se_cuenta boolean not null default true/);
    assert.match(sql, /grant select \(se_cuenta\) on public\.productos to authenticated/);
    assert.match(sql, /update public\.productos set se_cuenta = false\s+where empresa_id = 'sumigases' and codigo in \('010203', 'GASP01', 'GAS02'\)/);
  });
});
