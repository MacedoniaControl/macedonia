// Usuarios y roles. Server Component: la sesión y el rol se leen EN EL SERVIDOR.
// Regla de negocio: gestionar usuarios es SOLO del Owner. Ni los administradores.

import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { backendActivo } from "@/lib/supabase/server";
import { listarUsuarios } from "./actions";
import { UsuariosPanel } from "./UsuariosPanel";

export default async function UsersPage() {
  // Sin backend configurado la app sigue en modo demo: se avisa en vez de reventar.
  if (!backendActivo) {
    return (
      <>
        <PageHeader title="Usuarios y roles" breadcrumbs={[{ label: "Sistema" }, { label: "Usuarios" }]} />
        <SectionCard title="Backend no configurado">
          <p className="text-sm text-muted">
            Falta conectar Supabase. Define <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
        </SectionCard>
      </>
    );
  }

  const yo = await getUsuarioSesion();

  if (!yo || yo.rol !== "owner") {
    return (
      <>
        <PageHeader title="Usuarios y roles" breadcrumbs={[{ label: "Sistema" }, { label: "Usuarios" }]} />
        <SectionCard title="Sin acceso">
          <p className="text-sm text-muted">
            Solo el Owner puede gestionar usuarios. Si necesitas un cambio, pídeselo.
          </p>
        </SectionCard>
      </>
    );
  }

  const usuarios = await listarUsuarios();

  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        description="Quién entra al sistema, con qué rol y en qué empresa."
        breadcrumbs={[{ label: "Sistema" }, { label: "Usuarios" }]}
      />
      <UsuariosPanel usuarios={usuarios} />
    </>
  );
}
