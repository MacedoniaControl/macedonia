// Migración 26: Cilindros con las mismas reglas que el inventario.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../../supabase/26-roles-cilindros.sql", import.meta.url), "utf8");
const bloque = (desde: string, hasta: string) => sql.slice(sql.indexOf(desde), sql.indexOf(hasta, sql.indexOf(desde) + 1));

describe("migración 26: roles de cilindros", () => {
  test("operan Técnico, Administrador y Owner; el Vendedor no", () => {
    const f = bloque("function public.puede_operar_cilindros", "$$;");
    assert.match(f, /rol in \('owner', 'admin', 'tecnico'\)/);
    assert.doesNotMatch(f, /vendedor/);
  });

  test("el historial lo ven solo Owner y Administrador; registrar, quien opera", () => {
    assert.match(bloque("create policy cil_mov_lectura", ";"), /puede_finanzas\(\)/);
    assert.match(bloque("create policy cil_mov_inserta", ";"), /puede_operar_cilindros\(\)/);
  });

  test("nadie borra ni edita un movimiento directamente", () => {
    assert.match(sql, /drop policy if exists cil_mov_corrige/);
    assert.match(sql, /drop policy if exists cil_mov_borra/);
    assert.doesNotMatch(sql, /create policy cil_mov_(corrige|borra)/);
    const f = bloque("function public.cil_mov_protegido", "end $$;");
    assert.match(f, /if tg_op = 'DELETE' then\s+raise exception/);
  });

  test("el Parque y la Rampa no quedan en cero para el Técnico, y sin lo eliminado", () => {
    for (const f of ["cilindros_saldo_permitido", "comodato_permitido", "garantias_permitidas"]) {
      const b = bloque(`function public.${f}`, "$$;");
      assert.match(b, /security definer/, f);
      assert.match(b, /empresas_permitidas\(\)/, `${f} conserva la pared entre empresas`);
      assert.match(b, /eliminado_en is null/, `${f} no cuenta lo eliminado`);
    }
  });

  test("corregir y eliminar: solo Owner o Administrador, y deja constancia", () => {
    const e = bloque("function public.editar_mov_cilindro", "$$;");
    assert.match(e, /puede_finanzas\(\)/);
    assert.match(e, /edicion = coalesce\(edicion/);
    const d = bloque("function public.eliminar_mov_cilindro", "$$;");
    assert.match(d, /puede_finanzas\(\)/);
    assert.match(d, /eliminado_en = now\(\), eliminado_por = auth\.uid\(\), eliminado_nombre/);
    assert.doesNotMatch(d, /delete from/);
  });

  test("sin voseo en los mensajes de la base", () => {
    assert.doesNotMatch(sql, /\b(Decí|Elegí|Cargá|Usá|podés|tenés|Revisá|Contá)\b/);
  });
});
