// Cliente de Supabase para el SERVIDOR (Route Handlers, Server Components, middleware).

// Guarda de seguridad: este módulo NUNCA debe ejecutarse en el navegador.
// Next.js ya evita filtrar SUPABASE_SERVICE_ROLE_KEY al bundle del cliente (solo
// inserta las variables con prefijo NEXT_PUBLIC_), así que en el navegador llegaría
// vacía en vez de filtrarse. Pero un fallo silencioso es peor que un error ruidoso:
// si alguien importa esto desde un componente de cliente, que reviente aquí y no en
// producción con una clave que se salta todo el RLS.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/server.ts se importó en el navegador. " +
      "Este módulo maneja la SERVICE_ROLE_KEY, que se salta el RLS por completo. " +
      "Usa lib/supabase/client.ts en componentes de cliente.",
  );
}

import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const backendActivo = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Respeta el RLS: actúa como el usuario autenticado. Es el que se usa casi siempre. */
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

/**
 * ⚠️ SE SALTA EL RLS POR COMPLETO.
 * Solo para tareas administrativas del servidor donde ya se verificó el permiso
 * a mano: crear usuarios (solo Owner), importadores masivos, la tarea del BCV.
 * NUNCA usarlo para responder una consulta de un usuario sin comprobar antes su rol.
 */
export function createAdminClient() {
  if (!SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createSbClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
