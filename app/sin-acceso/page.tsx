// Para quien entró pero no tiene ninguna sección asignada.
//
// `primeraSeccion()` redirige acá cuando un usuario no puede ver nada, y esta
// ruta no existía: la persona caía en un 404 sin salida ni forma de cerrar
// sesión. No es hipotético — esta mañana los diez usuarios que no son Owner
// estaban así, con `permisos: {}`, y habrían llegado justo aquí.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUsuarioSesion, primeraSeccion } from "@/lib/auth/sesion-servidor";
import { SesionProvider } from "@/components/auth/SesionProvider";
import { MenuUsuario } from "@/components/layout/MenuUsuario";

export const metadata: Metadata = { title: "Sin acceso · Macedonia" };
export const dynamic = "force-dynamic";

export default async function SinAcceso() {
  const u = await getUsuarioSesion();
  if (!u) redirect("/login");

  // Si mientras tanto le dieron permisos, que entre en vez de leer un cartel.
  const destino = primeraSeccion(u);
  if (destino !== "/sin-acceso") redirect(destino);

  return (
    <SesionProvider
      identidad={{ nombre: u.nombre, usuario: u.usuario, rol: u.rol, empresaId: u.empresaId }}
    >
      <main className="flex min-h-dvh flex-col bg-bg px-4 py-6">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-white">
              M
            </span>
            <span className="font-semibold text-text">Macedonia</span>
          </span>
          <MenuUsuario />
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Todavía no tienes secciones asignadas
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Tu cuenta está activa y entraste bien, pero nadie te ha dado acceso
              a ninguna parte del sistema. No es un error tuyo y no hay nada que
              puedas hacer desde acá.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Pídele al Owner que te habilite lo que necesites para tu trabajo.
              Se hace desde <strong className="text-text">Usuarios</strong>, en tu ficha.
            </p>
          </div>
        </div>
      </main>
    </SesionProvider>
  );
}
