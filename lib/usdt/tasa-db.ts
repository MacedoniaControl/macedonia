"use server";

// La tasa USDT que se ve arriba: la de la base, la misma para todos.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { actualizarDesdeUsdt } from "./actualizar";

export type TasaUsdt = {
  tasa: number;
  compra: number | null;
  venta: number | null;
  /** Cuándo se leyó (ISO). */
  leidaEn: string;
  /** Si la última consulta falló, el motivo. */
  error: string | null;
};

/** La última lectura. Null sin sesión o sin ninguna lectura (o sin la migración 55). */
export async function tasaUsdtVigente(): Promise<TasaUsdt | null> {
  const u = await getUsuarioSesion();
  if (!u) return null;
  const sb = await createClient();
  const [t, e] = await Promise.all([
    sb.from("tasas_usdt").select("leida_en, tasa, compra, venta").order("leida_en", { ascending: false }).limit(1).maybeSingle(),
    sb.from("usdt_estado").select("ultimo_error").eq("id", 1).maybeSingle(),
  ]);
  const f = t.data as { leida_en: string; tasa: number; compra: number | null; venta: number | null } | null;
  if (!f) return null;
  return {
    tasa: Number(f.tasa), compra: f.compra === null ? null : Number(f.compra), venta: f.venta === null ? null : Number(f.venta),
    leidaEn: f.leida_en, error: (e.data as { ultimo_error: string | null } | null)?.ultimo_error ?? null,
  };
}

/** El botón «USDT»: consulta ya, sin esperar la próxima media hora. Una vez por minuto como mucho. */
export async function actualizarUsdtAhora(): Promise<{ ok: boolean; error?: string; tasa: TasaUsdt | null }> {
  const u = await getUsuarioSesion();
  if (!u) return { ok: false, error: "Sin sesión.", tasa: null };
  const admin = createAdminClient();
  const { data: est, error: sinTabla } = await admin.from("usdt_estado").select("ultima_consulta").eq("id", 1).maybeSingle();
  if (sinTabla) return { ok: false, error: "Falta la migración 55 (tasa USDT).", tasa: null };
  const hace = est?.ultima_consulta ? Date.now() - new Date(est.ultima_consulta as string).getTime() : Infinity;
  if (hace > 60_000) {
    const r = await actualizarDesdeUsdt(admin);
    if (!r.ok) return { ok: false, error: r.error, tasa: await tasaUsdtVigente() };
  }
  return { ok: true, tasa: await tasaUsdtVigente() };
}
