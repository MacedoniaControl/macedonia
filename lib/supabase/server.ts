// Cliente de Supabase para el SERVIDOR (Route Handlers, Server Components).
//
// ESTADO: preparado, aún no activo. Ver docs/backend/SUPABASE-SETUP.md
//
// ⚠️ SUPABASE_SERVICE_ROLE_KEY se salta el RLS por completo.
// Úsala SOLO en el servidor y solo para tareas administrativas:
// importadores masivos, la tarea programada del BCV, carga inicial de datos.
// NUNCA la expongas al navegador ni la uses para consultas de usuario.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const backendActivo = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/*
Al activar, descomentar:

import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Respeta el RLS: actúa como el usuario autenticado.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component: las cookies las refresca el middleware.
        }
      },
    },
  });
}

// SE SALTA EL RLS. Solo para tareas administrativas del servidor.
export function createAdminClient() {
  return createSbClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
*/
