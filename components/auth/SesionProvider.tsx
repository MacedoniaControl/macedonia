"use client";

// Quién es el usuario en sesión, bajado desde el servidor.
//
// Antes solo bajaba el rol, y el rol salía de localStorage con "owner" por
// defecto: cualquiera podía abrir la consola y escribir el suyo. Los datos
// nunca estuvieron expuestos -RLS en Postgres es la barrera real y no lee el
// navegador- pero la interfaz mostraba de más.
//
// Ahora baja la identidad completa desde la tabla `usuarios`, resuelta en el
// servidor, y el cliente solo la lee.

import { createContext, useContext, type ReactNode } from "react";
import type { Rol } from "@/lib/ux/session";

export type Identidad = {
  nombre: string;
  usuario: string;
  rol: Rol;
  empresaId: string | null;
};

const Ctx = createContext<Identidad | null>(null);

export function SesionProvider({
  identidad,
  children,
}: {
  identidad: Identidad | null;
  children: ReactNode;
}) {
  return <Ctx.Provider value={identidad}>{children}</Ctx.Provider>;
}

/** La sesión completa, o `null` si todavía no hay ninguna. */
export function useSesion(): Identidad | null {
  return useContext(Ctx);
}

/** Solo el rol. `null` mientras no haya sesión resuelta. */
export function useRolSesion(): Rol | null {
  return useContext(Ctx)?.rol ?? null;
}
