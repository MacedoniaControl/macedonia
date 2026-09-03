// Catálogo de permisos por usuario.
//
// Las claves son los SLUGS DE LAS RUTAS del menú, no nombres inventados. Así el
// menú y los permisos no se pueden desincronizar: si aparece una sección nueva,
// su permiso ya tiene nombre y nadie tiene que acordarse de registrarlo aparte.

// Import relativo, no con alias "@/": el ejecutor de pruebas de Node no lee
// tsconfig y no resuelve el alias. Relativo funciona en Next y en las pruebas.
import { navGroups } from "../ux/nav.ts";
import type { Rol } from "../ux/session.ts";

/** Los módulos del menú, derivados de la navegación real. */
// Subdepartamentos: existen como ruta y como permiso, pero no como item del
// menu principal. "sales" (Ventas externas) vive dentro de Cotizaciones y
// "products" dentro de Inventario.
const SUBDEPARTAMENTOS = ["sales", "products"] as const;

export const CLAVES_MODULO: readonly string[] = [
  ...navGroups.flatMap((g) => g.items).map((i) => i.href.replace("/admin/", "")),
  ...SUBDEPARTAMENTOS,
];

/** Capacidades transversales: no son secciones del menú, son cosas que se pueden hacer. */
export const CLAVES_ESPECIALES = ["ver_registros", "ver_costos", "otra_empresa"] as const;

export const TODAS_LAS_CLAVES: readonly string[] = [...CLAVES_MODULO, ...CLAVES_ESPECIALES];

export type Permisos = Record<string, boolean>;

const todas = (valor: boolean): Permisos =>
  Object.fromEntries(TODAS_LAS_CLAVES.map((k) => [k, valor]));

/** Secciones del vendedor: vende y consulta existencias. Sin finanzas. */
const VENDEDOR = ["dashboard", "quotes", "delivery-notes", "sales", "products", "inventory"];

/**
 * El técnico entra desde el celular, registra la recarga y sale.
 *
 * Lleva `inventory` porque el conteo fisico vive ahi, y el conteo lo hace
 * el almacen: la plantilla se escribio antes que el conteo y lo dejo del otro
 * lado de la pared. Las dos personas de almacen abrian la pantalla en blanco.
 *
 * Y lleva `products` porque contar es elegir de un catalogo: master() lee la
 * tabla productos, asi que sin ese permiso la pantalla de conteo sigue vacia
 * aunque `inventory` este encendido. Se vio probando con la sesion real de
 * Almacen PLC, no leyendo el SQL.
 *
 * Sigue siendo una plantilla: el Owner apaga o enciende cada interruptor.
 */
const TECNICO = ["cylinders", "inventory", "products"];

/**
 * El admin ve todo de SU empresa, salvo estas.
 *
 * `otra_empresa` estaba encendido y no debia: esa clave no agrega una seccion,
 * abre la pared. En puede_empresa() vale tanto como ser owner, asi que un admin
 * de Puerto La Cruz veia Cumana entero. La regla de Greeg es separacion
 * estricta, y "administrador de una empresa" no significa "de las dos".
 *
 * Sigue siendo un interruptor: el Owner puede encenderlo para alguien que de
 * verdad trabaje en las dos. Lo que cambia es que ya no viene puesto de fabrica.
 */
const ADMIN_APAGADOS = ["users", "ver_registros", "otra_empresa"];

/**
 * Permisos iniciales al crear un usuario.
 *
 * El rol es una PLANTILLA, no una jaula: a partir de aquí el Owner mueve cada
 * interruptor como quiera. Ninguna plantilla deja a nadie sin acceso a nada,
 * porque un usuario sin permisos entra a un sistema vacío y parece que la app
 * está rota.
 */
export function plantillaDeRol(rol: Rol): Permisos {
  if (rol === "owner") return todas(true);

  if (rol === "admin") {
    const p = todas(true);
    for (const k of ADMIN_APAGADOS) p[k] = false;
    return p;
  }

  const p = todas(false);
  for (const k of rol === "vendedor" ? VENDEDOR : TECNICO) p[k] = true;
  return p;
}

/**
 * Ruta -> clave de permiso.
 * Normaliza `/admin/<empresa>/<slug>` a `<slug>` y reconoce sub-rutas
 * (`/inventory/movimientos` sigue siendo `inventory`).
 */
export function claveDeRuta(pathname: string): string | null {
  const norm = pathname.replace(/^\/admin\/(sumigases|sudematin)(\/|$)/, "/admin$2");
  if (!norm.startsWith("/admin/")) return null;

  const resto = norm.slice("/admin/".length);
  if (!resto) return null;

  // La clave más larga primero: si no, un prefijo corto se quedaría con una ruta
  // que pertenece a otra sección.
  const porLongitud = [...CLAVES_MODULO].sort((a, b) => b.length - a.length);
  return porLongitud.find((c) => resto === c || resto.startsWith(`${c}/`)) ?? null;
}

/**
 * ¿Puede ver esta clave?
 *
 * El Owner SIEMPRE puede, sin mirar sus permisos. Es irrevocable por
 * construcción, no por una regla de pantalla que alguien pueda olvidar: aunque
 * se le apaguen todos los interruptores, sigue entrando. Para eso es el Owner.
 */
export function puedeVer(permisos: Permisos, rol: Rol, clave: string): boolean {
  if (rol === "owner") return true;
  return permisos[clave] === true;
}
