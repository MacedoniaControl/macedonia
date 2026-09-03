// Decisiones de acceso, en funciones puras.
//
// Se separan del guardia (lib/auth/guard.ts) para poder PROBARLAS sin base de
// datos, sin sesión y sin navegador: aquí vive el criterio, allá la fontanería.

import { claveDeRuta } from "./permisos.ts";
import type { Permisos } from "./permisos.ts";
import { CLAVES_MODULO } from "./permisos.ts";

export type Rol = "owner" | "admin" | "vendedor" | "tecnico";

export type Sesion = {
  id: string;
  nombre: string;
  rol: Rol;
  empresaId: string | null;
  permisos: Permisos;
};

/** El Owner siempre puede. Misma regla que la función `puede` de la base. */
export function sesionPuede(u: Sesion, clave: string): boolean {
  return u.rol === "owner" || u.permisos[clave] === true;
}

/** Primera sección visible para esta persona, o null si no tiene ninguna. */
/**
 * Seccion preferida por rol, antes de caer al orden del menu.
 *
 * El orden del menu no sabe a que vino cada quien: al darle `inventory` al
 * tecnico -porque el conteo fisico vive ahi- el tecnico paso a aterrizar en
 * Inventario en vez de Cilindros, que es lo que hace todos los dias.
 */
export const ATERRIZAJE: Partial<Record<Sesion["rol"], string>> = {
  tecnico: "cylinders",
  vendedor: "dashboard",
  admin: "dashboard",
};

export function primeraClaveVisible(u: Sesion): string | null {
  const preferida = ATERRIZAJE[u.rol];
  if (preferida && sesionPuede(u, preferida)) return preferida;
  return CLAVES_MODULO.find((c) => sesionPuede(u, c)) ?? null;
}

/** Ruta a la que redirigir a quien no tiene permiso. */
export function rutaDeInicio(u: Sesion): string {
  const base = u.empresaId ? `/admin/${u.empresaId}` : "/admin";
  const clave = primeraClaveVisible(u);
  return clave ? `${base}/${clave}` : "/sin-acceso";
}

export type Decision =
  | { tipo: "permitir" }
  | { tipo: "fuera-del-panel" }
  | { tipo: "denegar"; clave: string; destino: string };

/**
 * ¿Qué hacer con esta petición?
 *
 * Devuelve la decisión sin ejecutarla: el guardia se encarga de redirigir,
 * registrar en auditoría y alertar. Así el criterio se puede probar aparte.
 */
export function decidirAcceso(u: Sesion, pathname: string): Decision {
  const clave = claveDeRuta(pathname);
  if (clave === null) return { tipo: "fuera-del-panel" };
  if (sesionPuede(u, clave)) return { tipo: "permitir" };
  return { tipo: "denegar", clave, destino: `${rutaDeInicio(u)}?sinpermiso=${encodeURIComponent(clave)}` };
}

/** Clave de agrupación de la alerta: una por persona y sección. */
export function claveAlerta(usuarioId: string, clave: string): string {
  return `acceso-denegado:${usuarioId}:${clave}`;
}
