"use client";

import { usePathname } from "next/navigation";
import { isEmpresaId, type EmpresaId } from "./empresas";

/**
 * Empresa activa según la URL (/admin/<empresa>/...).
 * En la vista consolidada (/admin/...) no hay empresa en la ruta: se usa
 * "sumigases" como contexto de escritura para no perder datos, pero cada
 * módulo debe leer/escribir SIEMPRE con la clave de esta empresa.
 */
/**
 * A qué empresa se cae cuando la ruta no la nombra.
 *
 * Lo usan el hook Y el selector de la cabecera. Si cada uno tiene el suyo, la
 * pantalla lee de una empresa y muestra el nombre de la otra — que es
 * exactamente lo que pasó.
 */
export const EMPRESA_POR_DEFECTO = "sumigases" as const;

export function useEmpresaActiva(): EmpresaId {
  const pathname = usePathname();
  const m = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/);
  return m && isEmpresaId(m[1]) ? m[1] : EMPRESA_POR_DEFECTO;
}

/**
 * Clave de almacenamiento aislada por empresa.
 * Los datos de Sumigases y Sudematin NUNCA deben compartir clave:
 * ni los documentos, ni los correlativos, ni las existencias.
 */
export function claveEmpresa(base: string, empresa: string): string {
  return `${base}:${empresa}`;
}
