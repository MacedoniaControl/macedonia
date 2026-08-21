// Portada de Macedonia.
//
// Sin sesión: SOLO el login. Nada más.
//
// Antes esta página mostraba las ventas, el margen y el ROI reales de ambas
// empresas a cualquiera que abriera la URL, sin haber entrado. Con el
// repositorio público, esos números salían por dos vías distintas.
//
// Con sesión: el Centro de Control, para que el Owner elija empresa.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { backendActivo } from "@/lib/supabase/server";
import { getUsuarioSesion, rutaPostLogin } from "@/lib/auth/sesion-servidor";
import { LoginForm } from "./login/LoginForm";
import { CentroDeControl } from "./CentroDeControl";

export const metadata: Metadata = { title: "Macedonia" };

// Depende de quién eres: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export default async function Portada() {
  // Sin backend configurado la app sigue en modo demo: se muestra el Centro de
  // Control como hasta ahora, para no dejarla inservible a medio migrar.
  if (!backendActivo) return <CentroDeControl />;

  const usuario = await getUsuarioSesion();

  if (!usuario) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
              Macedonia
            </h1>
            <p className="mt-1.5 text-sm text-muted">Centro de Control Estratégico</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <LoginForm destino="" />
          </div>
        </div>
      </main>
    );
  }

  // Quien no es Owner no elige empresa: va directo a la suya.
  if (usuario.rol !== "owner") redirect(rutaPostLogin(usuario));

  return <CentroDeControl />;
}
