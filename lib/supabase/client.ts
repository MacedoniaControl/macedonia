// Cliente de Supabase para el NAVEGADOR.
//
// ESTADO: preparado, aún no activo. La app sigue usando localStorage.
// Para activarlo:  npm install @supabase/supabase-js @supabase/ssr
// y definir en .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// Ver docs/backend/SUPABASE-SETUP.md

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** ¿Ya está configurado el backend? Permite migrar módulo por módulo. */
export const backendActivo = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/*
Al activar, descomentar:

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
*/
