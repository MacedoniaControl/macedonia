"use server";

// Quiénes pueden figurar en «Contó» del conteo físico: los usuarios de la
// empresa (y los Owner que ven las dos), menos Francisco —vendedor externo— y
// las cuentas genéricas de Administración (pedido del usuario, 13-10-2026).
// Solo los nombres. Se lee con la clave de servicio porque el Técnico, que es
// quien más cuenta, no puede leer la tabla de usuarios; por eso exige sesión.

import { createAdminClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

const FUERA = (nombre: string, rol: string) => /^francisco\b/i.test(nombre.trim()) || (rol === "admin" && /^administraci[oó]n\b/i.test(nombre.trim()));

export async function contadoresDe(empresa: string): Promise<string[]> {
  const u = await getUsuarioSesion();
  if (!u) return [];
  const { data } = await createAdminClient()
    .from("usuarios")
    .select("nombre, rol, empresa_id")
    .eq("activo", true)
    .or(`empresa_id.eq.${empresa},empresa_id.is.null`)
    .order("nombre");
  return (data ?? []).filter((x) => !FUERA(x.nombre, x.rol)).map((x) => x.nombre as string);
}
