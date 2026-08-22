"use server";

// Configuración por empresa, en la base.
//
// Antes vivía en localStorage: cada persona tenía la suya. Para el IVA y la tasa
// eso es un problema real — dos vendedores con IVA distinto emiten documentos
// con totales distintos por el mismo producto, y nadie se entera hasta que el
// cliente reclama.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type Configuracion = Record<string, string>;

/** Valores si la base no tiene la clave. Deben coincidir con 12-configuracion.sql. */
const POR_DEFECTO: Configuracion = {
  iva_pct: "16",
  tasa_manual: "0",
  dias_vencimiento_cotizacion: "3",
  alerta_comodato_dias: "60",
};

export async function leerConfig(empresa: string): Promise<Configuracion> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("configuracion")
    .select("clave, valor")
    .eq("empresa_id", empresa);

  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);

  const filas = (data as { clave: string; valor: string }[] | null) ?? [];
  return { ...POR_DEFECTO, ...Object.fromEntries(filas.map((f) => [f.clave, f.valor])) };
}

export async function guardarConfig(
  cambios: Configuracion,
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  // El IVA cambia el total de todos los documentos: un valor absurdo aquí sale
  // impreso en papeles que van al cliente.
  if (cambios.iva_pct !== undefined) {
    const iva = Number(cambios.iva_pct);
    if (!Number.isFinite(iva) || iva < 0 || iva > 100) {
      return { ok: false, error: "El IVA debe ser un porcentaje entre 0 y 100." };
    }
  }

  const sb = await createClient();
  const filas = Object.entries(cambios).map(([clave, valor]) => ({
    empresa_id: empresa,
    clave,
    valor: String(valor),
    actualizado_por: usuario.id,
    actualizado_en: new Date().toISOString(),
  }));

  const { error } = await sb.from("configuracion").upsert(filas, { onConflict: "empresa_id,clave" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
