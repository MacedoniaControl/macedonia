"use client";

import { usePathname } from "next/navigation";
import { isEmpresaId, type EmpresaId } from "./empresas";

/**
 * Empresa activa según la URL (/admin/<empresa>/...).
 * En la vista consolidada (/admin/...) no hay empresa en la ruta: se usa
 * "sumigases" como contexto de escritura para no perder datos, pero cada
 * módulo debe leer/escribir SIEMPRE con la clave de esta empresa.
 */
export function useEmpresaActiva(): EmpresaId {
  const pathname = usePathname();
  const m = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/);
  return m && isEmpresaId(m[1]) ? m[1] : "sumigases";
}

/**
 * Clave de almacenamiento aislada por empresa.
 * Los datos de Sumigases y Sudematin NUNCA deben compartir clave:
 * ni los documentos, ni los correlativos, ni las existencias.
 */
export function claveEmpresa(base: string, empresa: string): string {
  return `${base}:${empresa}`;
}
