// Sesión leída EN EL SERVIDOR. Es la fuente de verdad del rol y la empresa.
//
// El rol NUNCA se lee del navegador para decidir permisos: allí es solo apariencia.
// Quien manda es esto (y por debajo, el RLS de Postgres, que vuelve a comprobarlo
// aunque el front tenga un bug).

import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/ux/session";
import type { EmpresaId } from "@/lib/ux/empresas";

export type UsuarioSesion = {
  id: string;
  nombre: string;
  rol: Rol;
  /** null = acceso a todas las empresas (solo tiene sentido para el owner). */
  empresaId: EmpresaId | null;
  usuario: string;
};

/** Usuario autenticado, o null. Consulta la tabla `usuarios`, no el token. */
export async function getUsuarioSesion(): Promise<UsuarioSesion | null> {
  const sb = await createClient();

  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;

  // El rol vive en `usuarios`, no en los metadatos del token: los metadatos los
  // puede alterar el propio usuario en algunas configuraciones, la tabla no.
  const { data, error } = await sb
    .from("usuarios")
    .select("id, nombre, rol, empresa_id, activo")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error || !data || !data.activo) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    rol: data.rol as Rol,
    empresaId: (data.empresa_id as EmpresaId | null) ?? null,
    usuario: (auth.user.email ?? "").split("@")[0],
  };
}

/** ¿Puede entrar al panel de esta empresa? Owner: todas. Los demás: solo la suya. */
export function puedeEntrarAEmpresa(u: UsuarioSesion, empresa: string): boolean {
  return u.rol === "owner" || u.empresaId === empresa;
}

/** A dónde mandar a cada quien después de entrar. */
export function rutaPostLogin(u: UsuarioSesion): string {
  // El owner elige empresa en el Centro de Control; el resto va directo a la suya.
  if (u.rol === "owner" || !u.empresaId) return "/";
  if (u.rol === "tecnico") return `/admin/${u.empresaId}/cylinders`;
  return `/admin/${u.empresaId}/dashboard`;
}
