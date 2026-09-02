"use client";

// Rol del usuario en sesion.
//
// Vivia en localStorage y por defecto era "owner", con un setRol() que dejaba
// a cualquiera ponerse el rol que quisiera desde la consola. Los datos nunca
// estuvieron expuestos -RLS en Postgres es la barrera real y no lee el
// navegador- pero la interfaz mostraba secciones que no correspondian.
//
// Ahora el rol lo resuelve el servidor contra la tabla `usuarios` y baja por
// contexto (components/auth/SesionProvider). Aca solo se lee.
//
// Regla de negocio: los registros/logs (historial de documentos, auditoria) son
// solo del OWNER.

import { useRolSesion } from "@/components/auth/SesionProvider";

export type Rol = "owner" | "admin" | "vendedor" | "tecnico";

export const ROLES: { id: Rol; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "admin", label: "Administrador" },
  { id: "vendedor", label: "Vendedor" },
  { id: "tecnico", label: "Tecnico de recargas" },
];

/**
 * Rol actual. `ready` sigue existiendo para no cambiar las pantallas, pero ya
 * no hay parpadeo: el rol llega renderizado desde el servidor.
 *
 * Sin sesion cae a "tecnico", el rol de MENOS permisos. Antes caia a "owner",
 * que es exactamente al reves de lo que conviene cuando algo falla.
 */
export function useRol(): { rol: Rol; ready: boolean } {
  const rol = useRolSesion();
  return { rol: rol ?? "tecnico", ready: rol !== null };
}

/**
 * Solo el OWNER ve registros, historiales y logs.
 * Decisión explícita de Greeg: NI SIQUIERA los administradores acceden a los registros.
 */
export function puedeVerRegistros(rol: Rol): boolean {
  return rol === "owner";
}

/**
 * Gastos, utilidad y Estado de Resultado: OWNER y ADMINISTRADOR.
 * "Es función de administración saber los números" (Greeg). Vendedores y técnicos no.
 */
export function puedeVerFinanzas(rol: Rol): boolean {
  return rol === "owner" || rol === "admin";
}
