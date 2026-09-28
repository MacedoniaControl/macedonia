import type { SupabaseClient } from "@supabase/supabase-js";
import { leerBcv } from "./leer";

// Consulta el BCV y guarda la tasa en la base (tasas_bcv, por fecha valor) y
// cómo le fue (bcv_estado). Lo usan la tarea programada cada 30 minutos
// (/api/bcv/actualizar) y el botón «Tasa BCV». Siempre con el cliente de
// servicio: nadie de la app escribe estas tablas.

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

export async function actualizarDesdeBcv(admin: SupabaseClient): Promise<{ ok: true; tasa: number; fechaValor: string } | { ok: false; error: string }> {
  const ahora = new Date().toISOString();
  try {
    const { tasa, fechaValor } = await leerBcv();
    const fecha = fechaValor ?? hoyCaracas();
    const { data: hay } = await admin.from("tasas_bcv").select("tasa").eq("fecha_valor", fecha).maybeSingle();
    const { error } = hay
      ? await admin.from("tasas_bcv").update({ tasa, ultima_vez: ahora }).eq("fecha_valor", fecha)
      : await admin.from("tasas_bcv").insert({ fecha_valor: fecha, tasa, primera_vez: ahora, ultima_vez: ahora });
    if (error) throw new Error(`No se pudo guardar la tasa: ${error.message}`);
    await admin.from("bcv_estado").update({ ultima_consulta: ahora, ultimo_ok: ahora, ultimo_error: null }).eq("id", 1);
    return { ok: true, tasa, fechaValor: fecha };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await admin.from("bcv_estado").update({ ultima_consulta: ahora, ultimo_error: error }).eq("id", 1);
    return { ok: false, error };
  }
}
