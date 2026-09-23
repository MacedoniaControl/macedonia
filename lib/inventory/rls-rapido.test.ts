import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Con 23.459 movimientos, una politica que llama a puede_empresa() por fila
// tarda 5 segundos y pasa el limite de la base: el Inventario deja de cargar.
describe("migración 24: permisos calculados una vez por consulta", () => {
  const sql = fs.readFileSync("supabase/24-rls-rapido.sql", "utf8");
  const codigo = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

  test("las cuatro políticas usan las empresas permitidas, una vez por consulta", () => {
    for (const p of ["movimientos_lectura", "movimientos_inserta", "productos_lectura", "productos_escribe"]) {
      const cuerpo = codigo.slice(codigo.indexOf(`create policy ${p}`), codigo.indexOf(";", codigo.indexOf(`create policy ${p}`)));
      assert.match(cuerpo, /empresa_id = any \(\(select public\.empresas_permitidas\(\)\)\)/, `${p} no usa empresas_permitidas`);
      assert.match(cuerpo, /\(select public\.puede\('\w+'\)\)/, `${p} evalúa puede() por fila`);
    }
  });

  test("no queda ningún permiso evaluado por fila", () => {
    assert.doesNotMatch(codigo, /puede_empresa\(empresa_id\)/);
    // Todo puede() tiene que estar envuelto en (select ...): si no, va por fila.
    assert.doesNotMatch(codigo, /(?<!\(select )public\.puede\('/);
  });

  test("las empresas permitidas salen de la misma regla de siempre, sin depender de quién ve la tabla empresas", () => {
    // La politica de lectura de `empresas` no contempla "otra_empresa": leerla
    // como el usuario le quitaria acceso a quien tiene ese permiso.
    assert.match(sql, /function public\.empresas_permitidas\(\)[\s\S]*?security definer[\s\S]*?where public\.puede_empresa\(e\.id\)/);
  });

  test("conserva los permisos de cada política", () => {
    assert.match(codigo, /movimientos_lectura[\s\S]*?puede\('inventory'\)/);
    assert.match(codigo, /productos_lectura[\s\S]*?puede\('products'\)/);
    assert.match(codigo, /productos_escribe[\s\S]*?auth_rol\(\)\) in \('owner', 'admin'\)/);
  });
});
