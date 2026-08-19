"use client";

// Cliente de Supabase para el NAVEGADOR.
// Usa la clave ANÓNIMA, que es pública por diseño: viaja al navegador y no da
// acceso a nada por sí sola. Quien protege los datos es el RLS (supabase/02-rls.sql).

import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** ¿Está configurado el backend? Permite migrar módulo por módulo sin romper nada. */
export const backendActivo = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
