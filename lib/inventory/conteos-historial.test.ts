import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// La 23 no se puede correr aca (no hay Postgres local). Estas pruebas fijan lo
// que la hace segura: que nadie se saltee las funciones, y que los costos solo
// los vea quien corresponde.
describe("migración 23: historial de conteos y actas", () => {
  const sql = fs.readFileSync("supabase/23-conteos-historial.sql", "utf8");
  // Sin comentarios ni textos entre comillas, para mirar solo el codigo.
  const codigo = sql
    .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");

  test("toda tabla del proyecto va calificada con public.", () => {
    const tablas = ["conteos", "conteo_lineas", "conteo_costos", "conteo_eventos", "conteos_resumen", "productos",
      "departamentos", "usuarios", "correlativos", "existencias", "movimientos_inventario"];
    for (const t of tablas) {
      for (const m of codigo.matchAll(new RegExp(`(^|[^.\\w])${t}\\b`, "g"))) {
        assert.fail(`«${t}» aparece sin public. cerca de: ${codigo.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}`);
      }
    }
  });

  test("un usuario común no puede cerrar, numerar ni aprobar cambiando campos", () => {
    // Sin esto, un técnico marcaba un ajuste como aprobado sin ser owner y sin
    // generar los movimientos.
    assert.match(sql, /privilegiado boolean := current_user in \('postgres', 'supabase_admin', 'service_role'\)/);
    assert.match(sql, /Un conteo se cierra y se ajusta con cerrar_conteo\(\) y aprobar_ajuste\(\)/);
    assert.match(sql, /create trigger conteos_inmutable before insert or update or delete on public\.conteos/);
    assert.match(sql, /create trigger conteo_lineas_inmutable before insert or update or delete on public\.conteo_lineas/);
  });

  test("un conteo cerrado no se borra y su acta no se reemplaza", () => {
    assert.match(sql, /está cerrado y no se borra/);
    assert.match(sql, /ya está archivada: no se reemplaza/);
  });

  test("solo owner o admin aprueba o rechaza, y rechazar exige motivo", () => {
    const aprobar = sql.slice(sql.indexOf("function public.aprobar_ajuste"), sql.indexOf("function public.rechazar_ajuste"));
    const rechazar = sql.slice(sql.indexOf("function public.rechazar_ajuste"), sql.indexOf("11. ARTICULO NUEVO"));
    assert.match(aprobar, /public\.puede_finanzas\(\)/);
    assert.match(rechazar, /public\.puede_finanzas\(\)/);
    assert.match(rechazar, /sin motivo nadie sabe qué recontar/);
  });

  test("el ajuste deja movimientos con motivo, como exige la regla de ajustes", () => {
    assert.match(sql, /insert into public\.movimientos_inventario[\s\S]*?'manual'[\s\S]*?'Conteo ' \|\| c\.numero/);
  });

  test("los costos del acta valorizada solo los lee owner o admin", () => {
    assert.match(sql, /create policy conteo_costos_lectura on public\.conteo_costos\s+for select using \(\s+public\.puede_finanzas\(\)/);
    assert.match(sql, /\(storage\.foldername\(name\)\)\[3\] is distinct from 'valorizada' or public\.puede_finanzas\(\)/);
  });

  test("nadie sube, cambia ni borra actas desde la app, ni escribe el historial", () => {
    assert.doesNotMatch(sql, /policy actas_\w+ on storage\.objects\s+for (insert|update|delete|all)/);
    assert.doesNotMatch(sql, /policy conteo_eventos_\w+ on public\.conteo_eventos\s+for (insert|update|delete|all)/);
    assert.doesNotMatch(sql, /policy conteo_costos_\w+ on public\.conteo_costos\s+for (insert|update|delete|all)/);
    assert.match(sql, /values \('actas', 'actas', false,/);
  });

  test("los números no se pueden pedir sueltos", () => {
    // Solo cerrar_conteo() y crear_articulo_nuevo() gastan números.
    assert.match(sql, /revoke execute on function public\.numero_conteo\(text\) from public, anon, authenticated/);
    assert.match(sql, /revoke execute on function public\.sku_macedonia\(text\) from public, anon, authenticated/);
  });

  test("CF-AAAA-NNNNNN con la fecha de Venezuela", () => {
    assert.match(sql, /'CF-' \|\| to_char\(hoy, 'YYYY'\) \|\| '-' \|\| lpad\(n::text, 6, '0'\)/);
    assert.match(sql, /now\(\) at time zone 'America\/Caracas'/);
  });

  test("las columnas nuevas de productos reciben su permiso", () => {
    assert.match(sql, /grant select \(nombre_corto, marca, modelo, referencia\) on public\.productos to authenticated/);
  });

  test("se puede correr dos veces", () => {
    assert.doesNotMatch(codigo, /create table (?!if not exists)/);
    assert.doesNotMatch(codigo, /create policy (\w+)[\s\S]*?create policy \1\b/);
    for (const m of codigo.matchAll(/create (?:policy|trigger) (\w+)/g)) {
      assert.match(sql, new RegExp(`drop (?:policy|trigger) if exists ${m[1]}\\b`), `${m[1]} no se borra antes de crearse`);
    }
  });
});

describe("la app cierra con cerrar_conteo() cuando la 23 existe", () => {
  const db = fs.readFileSync("lib/inventory/conteos-db.ts", "utf8");

  test("pide cerrar_conteo y solo cae al camino viejo si la función no existe", () => {
    // Si se corre la 23 con el codigo viejo, la base rechaza el cierre a mano
    // y el boton deja de andar. Si falla por otra cosa, se muestra el error.
    assert.match(db, /sb\.rpc\("cerrar_conteo", \{ p_conteo: id, p_conto:/);
    assert.match(db, /if \(r\.error\.code !== "PGRST202"\) return \{ ok: false, error: r\.error\.message \}/);
  });
});
