import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SesionProvider } from "@/components/auth/SesionProvider";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

// El rol se resuelve aca, en el servidor, contra la tabla `usuarios`. Antes lo
// ponia el navegador y por defecto era "owner".
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioSesion();
  return (
    <SesionProvider rol={usuario?.rol ?? null}>
      <AppShell>{children}</AppShell>
    </SesionProvider>
  );
}
