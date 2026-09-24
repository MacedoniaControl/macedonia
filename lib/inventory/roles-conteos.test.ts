// Migración 25: quién cuenta, quién ve los movimientos, y corregir o eliminar
// un conteo. Se revisa el SQL, como las pruebas de la 23 y la 24.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../../supabase/25-roles-conteos.sql", import.meta.url), "utf8");
const bloque = (desde: string, hasta: string) => sql.slice(sql.indexOf(desde), sql.indexOf(hasta, sql.indexOf(desde) + 1));

describe("migración 25: roles de inventario", () => {
  test("cuentan Técnico, Administrador y Owner; el Vendedor no", () => {
    const f = bloque("function public.puede_contar", "$$;");
    assert.match(f, /rol in \('owner', 'admin', 'tecnico'\)/);
    assert.doesNotMatch(f, /vendedor/);
  });

  test("los movimientos los ven y registran solo Owner y Administrador", () => {
    for (const p of ["movimientos_lectura", "movimientos_inserta"]) {
      const pol = bloque(`create policy ${p}`, ";");
      assert.match(pol, /puede_finanzas\(\)/, p);
      assert.match(pol, /empresas_permitidas\(\)\)::text\[\]/, `${p} conserva la pared entre empresas`);
    }
  });

  test("la existencia no queda en cero para quien no ve movimientos", () => {
    const f = bloque("function public.existencias_permitidas", "$$;");
    assert.match(f, /security definer/);
    assert.match(f, /empresa_id = any \(public\.empresas_permitidas\(\)\)/);
    assert.match(sql, /create or replace view public\.existencias with \(security_invoker = on\) as\s+select [^;]+from public\.existencias_permitidas\(\)/);
  });

  test("el historial (conteos cerrados) es de Owner y Administrador; el Técnico ve el abierto", () => {
    const pol = bloque("create policy conteos_lectura", ";");
    assert.match(pol, /not cerrado and eliminado_en is null and \(select public\.puede_contar\(\)\)/);
    assert.match(pol, /or \(select public\.puede_finanzas\(\)\)/);
    assert.doesNotMatch(sql, /create policy conteos_escribe/);
  });

  test("corregir y eliminar: solo Owner o Administrador", () => {
    for (const f of ["editar_conteo", "eliminar_conteo"]) {
      assert.match(bloque(`function public.${f}`, "$$;"), /puede_finanzas\(\)/, f);
    }
  });

  test("eliminar deja la línea: quién, cuándo y qué conteo", () => {
    const f = bloque("function public.eliminar_conteo", "$$;");
    assert.match(f, /eliminado_en = now\(\), eliminado_por = auth\.uid\(\), eliminado_nombre/);
    assert.match(f, /eliminado_resumen = coalesce\(c\.numero/);
    assert.doesNotMatch(f, /delete from public\.conteos\b/);
  });

  test("una fila de conteo no se borra nunca, ni por error", () => {
    const f = bloque("function public.conteo_inmutable", "end $$;");
    assert.match(f, /if tg_op = 'DELETE' then\s+raise exception/);
  });

  test("corregir un conteo con ajuste aprobado lleva la diferencia al inventario", () => {
    const f = bloque("function public.editar_conteo", "$$;");
    assert.match(f, /c\.ajuste = 'aprobado' and v_cant <> l\.cantidad/);
    assert.match(f, /insert into public\.movimientos_inventario/);
    assert.match(f, /insert into public\.conteo_eventos[\s\S]+'editado'/);
  });

  test("las actas las abren solo Owner y Administrador", () => {
    assert.match(bloque("create policy actas_lee", ";"), /public\.puede_finanzas\(\)/);
  });

  test("sin voseo en los mensajes de la base", () => {
    assert.doesNotMatch(sql, /\b(Decí|Elegí|Cargá|Usá|podés|tenés|Revisá|Contá)\b/);
  });
});
