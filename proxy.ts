// Proxy de sesión y protección de rutas.
// (En Next 16 esto se llama `proxy`; antes era `middleware`.)
//
// Hace dos cosas:
//  1. Refresca el token de Supabase en cada navegación (si no, la sesión se cae
//     sola a los pocos minutos y la gente tiene que volver a entrar).
//  2. Cierra el paso a quien no tiene sesión.
//
// OJO: esto es la PRIMERA barrera, no la única. La barrera real es el RLS en
// Postgres. Si alguien se saltara esta capa, la base seguiría sin
// entregarle datos de otra empresa.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Rutas que se ven sin haber entrado. */
const PUBLICAS = ["/login", "/auth"];

export async function proxy(req: NextRequest) {
  // Sin backend configurado, la app sigue funcionando en modo demo (localStorage).
  // Permite desarrollar y desplegar por partes sin dejar la app inservible.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next();

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida el token contra Supabase. No usar getSession() para decidir
  // permisos: ese lee la cookie sin verificarla.
  const { data: { user } } = await supabase.auth.getUser();

  const ruta = req.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => ruta === p || ruta.startsWith(p + "/"));

  if (!user && !esPublica) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Para devolverlo a donde iba, una vez que entre.
    url.searchParams.set("destino", ruta);
    return NextResponse.redirect(url);
  }

  // Ya autenticado: no tiene sentido volver a ver el login.
  if (user && ruta === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos, imágenes y el endpoint público del BCV.
    "/((?!_next/static|_next/image|favicon.ico|api/bcv|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
