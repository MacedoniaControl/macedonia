"use server";

// Kardex de inventario en Supabase.
//
//   INGRESO  → Compras · Ingresos manuales
//   SALIDA   → Ventas  · Salidas manuales
//
// La existencia NO es una columna: se calcula sumando movimientos (vista
// `existencias`). Una columna de stock se desincroniza en cuanto algo falla a
// medias; una suma de movimientos siempre cuadra con su propio historial, y
// además explica CÓMO se llegó a ese número.
//
// La regla "los movimientos manuales exigen motivo" la hace cumplir la BASE
// (constraint manual_requiere_motivo), no el formulario: un formulario se
// esquiva desde la consola del navegador, una restricción de Postgres no.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type Direccion = "entrada" | "salida";
export type OrigenMov = "venta" | "compra" | "manual";

export type MovimientoNuevo = {
  direccion: Direccion;
  origen: OrigenMov;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo?: string;
  documento?: string;
  /** false = solo regulariza papeles, no mueve mercancía real. */
  afectaInventarioReal?: boolean;
};

export type MovimientoGuardado = {
  id: number;
  fecha: string;
  direccion: Direccion;
  origen: OrigenMov;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: string | null;
  documento: string | null;
  usuario: string;
};

export type Existencia = {
  codigo: string;
  existencia: number;
  existenciaFisica: number;
};

export async function registrarMovimiento(
  mov: MovimientoNuevo,
  empresa: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  if (!mov.codigo.trim()) return { ok: false, error: "Falta el código del producto." };
  if (!(mov.cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };
  if (mov.origen === "manual" && !mov.motivo?.trim()) {
    // La base lo rechazaría igual; avisar aquí da un mensaje entendible en vez
    // del error crudo de Postgres.
    return { ok: false, error: "Un movimiento manual necesita un motivo." };
  }

  const sb = await createClient();
  const { data, error } = await sb
    .from("movimientos_inventario")
    .insert({
      empresa_id: empresa,
      fecha: new Date().toISOString().slice(0, 10),
      direccion: mov.direccion,
      origen: mov.origen,
      codigo: mov.codigo.trim(),
      nombre: mov.nombre.trim() || mov.codigo.trim(),
      cantidad: mov.cantidad,
      motivo: mov.motivo?.trim() || null,
      documento: mov.documento?.trim() || null,
      afecta_inventario_real: mov.afectaInventarioReal ?? true,
      usuario_id: usuario.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: `No se pudo registrar el movimiento: ${error?.message}` };
  }
  return { ok: true, id: data.id };
}

/** Últimos movimientos de una empresa, del más nuevo al más viejo. */
export async function listarMovimientos(
  empresa: string,
  limite = 200,
): Promise<MovimientoGuardado[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("movimientos_inventario")
    .select("id, fecha, direccion, origen, codigo, nombre, cantidad, motivo, documento, usuarios(nombre)")
    .eq("empresa_id", empresa)
    .order("id", { ascending: false })
    .limit(limite);

  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);

  type Fila = {
    id: number; fecha: string; direccion: Direccion; origen: OrigenMov;
    codigo: string; nombre: string; cantidad: number;
    motivo: string | null; documento: string | null;
    usuarios: { nombre: string } | null;
  };

  return ((data as unknown as Fila[] | null) ?? []).map((m) => ({
    id: m.id,
    fecha: m.fecha,
    direccion: m.direccion,
    origen: m.origen,
    codigo: m.codigo,
    nombre: m.nombre,
    cantidad: Number(m.cantidad),
    motivo: m.motivo,
    documento: m.documento,
    // Sin nombre no se inventa uno: se dice que no se sabe.
    usuario: m.usuarios?.nombre ?? "—",
  }));
}

/**
 * Existencia calculada desde el kardex.
 *
 * `existencia` cuenta todo; `existenciaFisica` solo lo que movió mercancía de
 * verdad. La diferencia son las regularizaciones fiscales: papeles que cuadran
 * el inventario de Valery sin que nada se haya movido del almacén.
 */
export async function existencias(empresa: string, codigos?: string[]): Promise<Existencia[]> {
  const sb = await createClient();
  let q = sb.from("existencias").select("codigo, existencia, existencia_fisica").eq("empresa_id", empresa);
  if (codigos?.length) q = q.in("codigo", codigos);

  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las existencias: ${error.message}`);

  type Fila = { codigo: string; existencia: number; existencia_fisica: number };
  return ((data as Fila[] | null) ?? []).map((e) => ({
    codigo: e.codigo,
    existencia: Number(e.existencia) || 0,
    existenciaFisica: Number(e.existencia_fisica) || 0,
  }));
}

/** Existencia de un solo código. 0 si nunca tuvo movimientos. */
export async function existenciaDe(codigo: string, empresa: string): Promise<number> {
  const [e] = await existencias(empresa, [codigo]);
  return e?.existencia ?? 0;
}

/**
 * Revierte un movimiento con otro en sentido contrario.
 *
 * NO borra la fila original. Un kardex del que se borran renglones reescribe la
 * historia: la existencia cambia y nadie puede ver que hubo un error. Con un
 * movimiento contrario quedan los dos —el error y la corrección— y la suma da
 * lo mismo que si se hubiera borrado, pero explicando por qué.
 */
export async function revertirMovimiento(
  id: number,
  empresa: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const sb = await createClient();
  const { data: orig, error: errLeer } = await sb
    .from("movimientos_inventario")
    .select("direccion, origen, codigo, nombre, cantidad, documento")
    .eq("id", id)
    .eq("empresa_id", empresa)
    .maybeSingle();

  if (errLeer || !orig) return { ok: false, error: "No se encontró el movimiento." };
  if (orig.origen !== "manual") {
    // Los movimientos que vienen de una venta, compra o import se revierten
    // corrigiendo su origen, no a mano: si no, el kardex y el documento dejan
    // de coincidir.
    return { ok: false, error: "Solo se revierten movimientos manuales." };
  }

  return registrarMovimiento({
    direccion: orig.direccion === "entrada" ? "salida" : "entrada",
    origen: "manual",
    codigo: orig.codigo,
    nombre: orig.nombre,
    cantidad: Number(orig.cantidad),
    motivo: `Reversión del movimiento #${id}`,
    documento: orig.documento ?? undefined,
  }, empresa);
}
