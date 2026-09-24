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

/**
 * A que empresa va una ruta del panel que no la nombra (/admin/inventory).
 * Tiene que ser el MISMO valor que EMPRESA_POR_DEFECTO de lib/ux/use-empresa.ts
 * (una prueba lo vigila): ese archivo es de cliente y el proxy no lo importa.
 */
export const EMPRESA_SIN_RUTA = "sumigases";

/** La pantalla de inicio de esta persona dentro de una empresa. */
export function inicioEn(u: Sesion, empresa: string): string {
  const clave = primeraClaveVisible(u);
  return clave ? `/admin/${empresa}/${clave}` : "/sin-acceso";
}

/**
 * ¿Hay que llevar esta peticion del panel a otro lado? Devuelve el destino, o
 * null si puede quedarse. Lo aplica el proxy en cada navegacion.
 *
 *  - Ruta sin empresa (/admin/inventory): a la misma seccion DE SU empresa. La
 *    isla del telefono llevaba ahi, y el tecnico de Sudematin terminaba mirando
 *    el inventario de Sumigases, vacio.
 *  - Empresa ajena sin permiso "otra_empresa": a la misma seccion de la suya.
 *  - /admin o /admin/<empresa> a secas: a su inicio.
 *  - Seccion sin permiso: a su inicio, con ?sinpermiso=<clave> para avisarle.
 *    Antes entraba y veia la pantalla vacia ("Sin cuentas por pagar"), que
 *    parece un dato y es un permiso.
 */
export function redireccionPanel(u: Sesion, pathname: string): string | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;
  const propia = u.empresaId ?? EMPRESA_SIN_RUTA;
  const m = pathname.match(/^\/admin\/(sumigases|sudematin)(\/.*)?$/);
  const seguir = (destino: string) => redireccionPanel(u, destino) ?? destino;

  if (!m) {
    const resto = pathname.replace(/^\/admin\/?/, "");
    return seguir(resto ? `/admin/${propia}/${resto}` : `/admin/${propia}`);
  }
  const [, empresa, resto = ""] = m;
  const ajena = u.rol !== "owner" && u.empresaId !== null && empresa !== u.empresaId && u.permisos.otra_empresa !== true;
  if (ajena) return seguir(`/admin/${u.empresaId}${resto}`);
  if (resto === "" || resto === "/") return inicioEn(u, empresa);

  const d = decidirAcceso(u, pathname);
  if (d.tipo !== "denegar") return null;
  const inicio = inicioEn(u, empresa);
  return inicio === "/sin-acceso" ? inicio : `${inicio}?sinpermiso=${encodeURIComponent(d.clave)}`;
}
