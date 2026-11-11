import type { SupabaseClient } from "@supabase/supabase-js";
import { leerUsdt } from "./leer";

// Consulta usdt.com.ve y guarda la lectura (tasas_usdt) y cómo le fue
// (usdt_estado). Lo usan la tarea programada cada 30 minutos
// (/api/bcv/actualizar, junto con el BCV) y el botón «USDT». Siempre con el
// cliente de servicio: nadie de la app escribe estas tablas (migración 55).

export async function actualizarDesdeUsdt(admin: SupabaseClient): Promise<{ ok: true; tasa: number } | { ok: false; error: string }> {
  const ahora = new Date().toISOString();
  try {
    const { tasa, compra, venta } = await leerUsdt();
    const { error } = await admin.from("tasas_usdt").insert({ leida_en: ahora, tasa, compra, venta });
    if (error) throw new Error(`No se pudo guardar la tasa USDT: ${error.message}`);
    await admin.from("usdt_estado").update({ ultima_consulta: ahora, ultimo_ok: ahora, ultimo_error: null }).eq("id", 1);
    return { ok: true, tasa };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await admin.from("usdt_estado").update({ ultima_consulta: ahora, ultimo_error: error }).eq("id", 1);
    return { ok: false, error };
  }
}
