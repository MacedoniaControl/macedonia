"use client";

// Rol del usuario en sesión. PLACEHOLDER hasta que exista autenticación real:
// hoy se guarda en el navegador y por defecto es "owner". Cuando entre el backend,
// el rol vendrá del servidor (Supabase) y esto solo lo leerá.
// Regla de negocio: los registros/logs (historial de documentos, auditoría) son solo del OWNER.

import { useEffect, useState } from "react";

export type Rol = "owner" | "admin" | "vendedor" | "tecnico";

export const ROLES: { id: Rol; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "admin", label: "Administrador" },
  { id: "vendedor", label: "Vendedor" },
  { id: "tecnico", label: "Técnico de recargas" },
];

const KEY = "sumi:rol";
const EV = "sumi:rol";

export function getRol(): Rol {
  if (typeof localStorage === "undefined") return "owner";
  const r = localStorage.getItem(KEY);
  return r === "admin" || r === "vendedor" || r === "tecnico" ? r : "owner";
}

export function setRol(r: Rol) {
  try {
    localStorage.setItem(KEY, r);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EV));
}

/** Rol actual, reactivo. `ready` evita parpadeo entre servidor y cliente. */
export function useRol(): { rol: Rol; ready: boolean } {
  const [rol, setR] = useState<Rol>("owner");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const load = () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setR(getRol());
      setReady(true);
    };
    load();
    window.addEventListener(EV, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EV, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return { rol, ready };
}

/** Solo el OWNER ve registros, historiales y logs. */
export function puedeVerRegistros(rol: Rol): boolean {
  return rol === "owner";
}
