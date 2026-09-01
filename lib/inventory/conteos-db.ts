"use server";

// Conteo físico. Ver supabase/17-conteos.sql para el modelo y sus porqués.
//
// El conteo NO corrige el inventario: deja constancia de lo que se contó. La
// diferencia contra Valery es el dato que este producto existe para mostrar, y
// un ajuste automático la borraría.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type Conteo = {
  id: number;
  fecha: string;
  zona: string | null;
  nota: string | null;
  cerrado: boolean;
  renglones: number;
};

export type LineaConteo = { codigo: string; cantidad: number };

/** Abre una sesión de conteo. Se cuenta por zonas, no todo de una vez. */
export async function abrirConteo(
  empresa: string,
  zona: string,
  nota?: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const sb = await createClient();
  const { data, error } = await sb
    .from("conteos")
    .insert({
      empresa_id: empresa,
      zona: zona.trim() || null,
      nota: nota?.trim() || null,
      usuario_id: usuario.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: `No se pudo abrir el conteo: ${error?.message}` };
  return { ok: true, id: data.id };
}

/**
 * Anota lo contado de un producto.
 *
 * Si ya se había contado en esta sesión, el nuevo número PISA al anterior en vez
 * de sumarse: contar dos veces la misma estantería es un error de recorrido, no
 * el doble de mercadería.
 */
export async function anotar(
  conteoId: number,
  codigo: string,
  cantidad: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!codigo.trim()) return { ok: false, error: "Falta el código." };
  if (!(cantidad >= 0)) return { ok: false, error: "La cantidad no puede ser negativa." };

  const sb = await createClient();
  const { error } = await sb
    .from("conteo_lineas")
    .upsert(
      { conteo_id: conteoId, codigo: codigo.trim(), cantidad },
      { onConflict: "conteo_id,codigo" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function borrarRenglon(conteoId: number, codigo: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("conteo_lineas").delete().eq("conteo_id", conteoId).eq("codigo", codigo);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cierra el conteo: recién ahí entra al Master.
 *
 * Un conteo a medias mostrando ceros donde todavía nadie pasó sería peor que no
 * tener conteo: haría ver faltantes que no existen.
 */
export async function cerrarConteo(id: number): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();

  const { data: lineas } = await sb.from("conteo_lineas").select("id").eq("conteo_id", id).limit(1);
  if (!lineas?.length) return { ok: false, error: "No se contó ningún producto todavía." };

  const { error } = await sb.from("conteos").update({ cerrado: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function lineasDe(conteoId: number): Promise<LineaConteo[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("conteo_lineas")
    .select("codigo, cantidad")
    .eq("conteo_id", conteoId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los renglones: ${error.message}`);
  return (data ?? []).map((l) => ({ codigo: l.codigo, cantidad: Number(l.cantidad) }));
}

/** El conteo abierto de esta empresa, si hay uno. */
export async function conteoAbierto(empresa: string): Promise<Conteo | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("conteos")
    .select("id, fecha, zona, nota, cerrado, conteo_lineas(id)")
    .eq("empresa_id", empresa)
    .eq("cerrado", false)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const d = data as { id: number; fecha: string; zona: string | null; nota: string | null; cerrado: boolean; conteo_lineas: { id: number }[] | null };
  return { id: d.id, fecha: d.fecha, zona: d.zona, nota: d.nota, cerrado: d.cerrado, renglones: (d.conteo_lineas ?? []).length };
}

export type FilaMaster = {
  codigo: string;
  nombre: string;
  valery: number;
  contado: number | null;
  fechaConteo: string | null;
  zona: string | null;
  diferencia: number | null;
};

/**
 * Master: lo que dice el papel contra lo que alguien contó.
 *
 * `contado` en null significa NO CONTADO, que es distinto de contado en cero.
 * Mostrar un cero ahí inventaría un faltante que nadie verificó.
 */
export async function master(empresa: string): Promise<FilaMaster[]> {
  const sb = await createClient();

  const [prod, cont] = await Promise.all([
    sb.from("productos").select("codigo, nombre").eq("empresa_id", empresa).order("codigo").range(0, 9999),
    sb.from("ultimo_conteo").select("codigo, cantidad, fecha, zona").eq("empresa_id", empresa),
  ]);

  if (prod.error) throw new Error(`No se pudo leer el catálogo: ${prod.error.message}`);
  if (cont.error) throw new Error(`No se pudo leer el conteo: ${cont.error.message}`);

  const { data: ex } = await sb.from("existencias").select("codigo, existencia").eq("empresa_id", empresa).range(0, 9999);

  const valeryDe = new Map((ex ?? []).map((e) => [e.codigo as string, Number(e.existencia)]));
  const contadoDe = new Map(
    (cont.data ?? []).map((c) => [c.codigo as string, { n: Number(c.cantidad), fecha: c.fecha as string, zona: c.zona as string | null }]),
  );

  return (prod.data ?? []).map((p) => {
    const valery = valeryDe.get(p.codigo) ?? 0;
    const c = contadoDe.get(p.codigo);
    return {
      codigo: p.codigo,
      nombre: p.nombre,
      valery,
      contado: c ? c.n : null,
      fechaConteo: c ? c.fecha : null,
      zona: c ? c.zona : null,
      diferencia: c ? c.n - valery : null,
    };
  });
}
