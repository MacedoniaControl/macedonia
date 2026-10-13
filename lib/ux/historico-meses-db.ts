"use server";

// Leer y guardar los meses cerrados a mano (supabase/45-historico-meses.sql).
// Quién puede lo decide el RLS: leer, quien ve la empresa; cargar o corregir,
// el Owner y los Administradores de esa empresa.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import type { MesCargado } from "./historico-meses";

const AVISO_MIGRACION = "Falta correr la migración 45 (supabase/45-historico-meses.sql).";
const sinTabla = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /historico_meses/.test(e.message ?? ""));

/** Todos los meses cargados que el usuario puede ver (de una o de las dos empresas). */
export async function listarMesesCargados(): Promise<MesCargado[]> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return [];
  const sb = await createClient();
  const { data, error } = await sb.from("historico_meses")
    .select("empresa_id, ym, venta, costo, compra, venta_bs, costo_bs, compra_bs, nota, creado_nombre, actualizado_en")
    .order("ym");
  if (error) return [];   // sin la migración, el histórico sigue siendo el de Valery
  return (data ?? []).map((m) => ({
    empresa: m.empresa_id as string, ym: m.ym as string,
    venta: Number(m.venta), costo: Number(m.costo), compra: Number(m.compra),
    ventaBs: Number(m.venta_bs), costoBs: Number(m.costo_bs), compraBs: Number(m.compra_bs),
    nota: (m.nota as string | null) ?? null, creadoNombre: (m.creado_nombre as string | null) ?? null,
    actualizadoEn: (m.actualizado_en as string | null) ?? null,
  }));
}

export type MesNuevo = Omit<MesCargado, "creadoNombre" | "actualizadoEn">;

/** Cierra un mes (o lo corrige si ya estaba cargado). */
export async function guardarMesCargado(m: MesNuevo): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.ym)) return { ok: false, error: "Mes inválido." };
  for (const [k, v] of Object.entries({ Ventas: m.venta, Costo: m.costo, Compras: m.compra })) {
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: `${k}: el monto no puede ser negativo.` };
  }
  if (!(m.venta > 0)) return { ok: false, error: "Faltan las ventas del mes." };
  const sb = await createClient();
  const { error } = await sb.from("historico_meses").upsert({
    empresa_id: m.empresa, ym: m.ym, venta: m.venta, costo: m.costo, compra: m.compra,
    venta_bs: m.ventaBs, costo_bs: m.costoBs, compra_bs: m.compraBs, nota: m.nota?.trim() || null,
  }, { onConflict: "empresa_id,ym" });
  if (error) {
    if (sinTabla(error)) return { ok: false, error: AVISO_MIGRACION };
    if (/row-level security/i.test(error.message)) return { ok: false, error: "Cerrar un mes lo hacen el Owner o un Administrador de la empresa." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Borra un mes cargado a mano (vuelve a no tener datos hasta que se cargue o llegue de Valery). */
export async function borrarMesCargado(empresa: string, ym: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  const sb = await createClient();
  const { error, count } = await sb.from("historico_meses").delete({ count: "exact" }).eq("empresa_id", empresa).eq("ym", ym);
  if (error) return { ok: false, error: sinTabla(error) ? AVISO_MIGRACION : error.message };
  if (!count) return { ok: false, error: "No se pudo borrar: solo el Owner o un Administrador de la empresa." };
  return { ok: true };
}
