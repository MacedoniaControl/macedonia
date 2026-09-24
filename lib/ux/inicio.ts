"use client";

// La pantalla de inicio de quien esta en sesion, en la empresa que esta mirando.
//
// Es la MISMA regla que usan el login y el proxy (lib/auth/acceso.ts): el
// tecnico empieza en Cilindros, los demas en el Dashboard, y si no pueden ver
// esa, la primera seccion que si. "Inicio" en las migas y en el menu lleva
// siempre aca, asi volver a la pantalla principal es el mismo gesto en todas.

import { useSesion } from "@/components/auth/SesionProvider";
import { inicioEn } from "@/lib/auth/acceso";
import { useEmpresaActiva } from "./use-empresa";

export function useInicio(): string {
  const s = useSesion();
  const empresa = useEmpresaActiva();
  if (!s) return "/";
  return inicioEn({ id: "", nombre: s.nombre, rol: s.rol, empresaId: s.empresaId, permisos: s.permisos }, empresa);
}
