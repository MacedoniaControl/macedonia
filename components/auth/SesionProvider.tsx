"use client";

// El rol del usuario, bajado desde el servidor.
//
// Antes salia de localStorage y por defecto era "owner": cualquiera podia
// abrir la consola, escribir su propio rol y ver secciones que no le tocan.
// Los datos nunca estuvieron expuestos -RLS en Postgres es la barrera real y
// no lee el navegador- pero la interfaz mostraba de mas, que para quien la usa
// es lo mismo que estar abierta.
//
// Ahora el rol viene de la tabla `usuarios`, resuelto en el servidor, y el
// cliente solo lo lee. No hay forma de cambiarlo desde el navegador.

import { createContext, useContext, type ReactNode } from "react";
import type { Rol } from "@/lib/ux/session";

const Ctx = createContext<Rol | null>(null);

export function SesionProvider({ rol, children }: { rol: Rol | null; children: ReactNode }) {
  return <Ctx.Provider value={rol}>{children}</Ctx.Provider>;
}

/** El rol de la sesion. `null` mientras no haya sesion resuelta. */
export function useRolSesion(): Rol | null {
  return useContext(Ctx);
}
