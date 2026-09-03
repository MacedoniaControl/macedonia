import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SesionProvider } from "@/components/auth/SesionProvider";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

// La identidad se resuelve aca, en el servidor, contra la tabla `usuarios`.
// Antes el rol lo ponia el navegador y por defecto era "owner".
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const u = await getUsuarioSesion();
  return (
    <SesionProvider
      identidad={
        u ? { nombre: u.nombre, usuario: u.usuario, rol: u.rol, empresaId: u.empresaId } : null
      }
    >
      <AppShell>{children}</AppShell>
    </SesionProvider>
  );
}
