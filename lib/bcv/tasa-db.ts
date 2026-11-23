"use server";

// La tasa BCV que usa toda la app: la de la base, no la de cada navegador.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { actualizarDesdeBcv } from "./actualizar";
import { elegirVigente, type FilaTasa } from "./vigente";

export type TasaBcv = {
  tasa: number;
  /** La fecha para la que vale (YYYY-MM-DD). */
  fechaValor: string;
  /** La última vez que el BCV la confirmó (ISO). */
  actualizada: string;
  /** Si la última consulta falló, el motivo. */
  error: string | null;
  /** La del siguiente día hábil, si el BCV ya la publicó. */
  proxima: { tasa: number; fechaValor: string } | null;
  /** Hoy no fue día hábil del BCV: vale la ya publicada para el siguiente (lib/bcv/vigente.ts). */
  adelantada: boolean;
};

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

/**
 * La que vale hoy: la última con fecha valor ≤ hoy (en la tarde el BCV publica
 * la de mañana); un día de semana sin fecha valor propia, la ya publicada para
 * el siguiente día hábil (lib/bcv/vigente.ts).
 */
export async function tasaVigente(): Promise<TasaBcv | null> {
  const u = await getUsuarioSesion();
  if (!u) return null;
  const sb = await createClient();
  const [t, e] = await Promise.all([
    sb.from("tasas_bcv").select("fecha_valor, tasa, primera_vez, ultima_vez").order("fecha_valor", { ascending: false }).limit(10),
    sb.from("bcv_estado").select("ultima_consulta, ultimo_ok, ultimo_error").eq("id", 1).maybeSingle(),
  ]);
  const filas = (t.data ?? []) as FilaTasa[];
  const eleccion = elegirVigente(filas, hoyCaracas());
  if (!eleccion) return null;
  const { vigente, proxima: nueva, adelantada } = eleccion;
  const est = e.data as { ultima_consulta: string | null; ultimo_ok: string | null; ultimo_error: string | null } | null;
  return {
    tasa: Number(vigente.tasa),
    fechaValor: vigente.fecha_valor,
    actualizada: est?.ultimo_ok ?? vigente.ultima_vez,
    error: est?.ultimo_error ?? null,
    proxima: nueva ? { tasa: Number(nueva.tasa), fechaValor: nueva.fecha_valor } : null,
    adelantada,
  };
}

/** El botón «Tasa BCV»: consulta ya, sin esperar la próxima media hora. Una vez por minuto como mucho. */
export async function actualizarTasaAhora(): Promise<{ ok: boolean; error?: string; tasa: TasaBcv | null }> {
  const u = await getUsuarioSesion();
  if (!u) return { ok: false, error: "Sin sesión.", tasa: null };
  const admin = createAdminClient();
  const { data: est } = await admin.from("bcv_estado").select("ultima_consulta").eq("id", 1).maybeSingle();
  const hace = est?.ultima_consulta ? Date.now() - new Date(est.ultima_consulta as string).getTime() : Infinity;
  if (hace > 60_000) {
    const r = await actualizarDesdeBcv(admin);
    if (!r.ok) return { ok: false, error: r.error, tasa: await tasaVigente() };
  }
  return { ok: true, tasa: await tasaVigente() };
}
