"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useState con persistencia en localStorage.
 * SSR-safe: arranca con `initial` y se hidrata en el primer efecto.
 *
 * IMPORTANTE — cambio de clave (ej. al cambiar de empresa):
 * si la clave nueva no tiene datos guardados, el estado VUELVE a `initial`.
 * Sin esto, el valor de la empresa anterior quedaba en memoria y se escribía
 * en la clave de la nueva empresa: los datos se copiaban de una a otra.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  // Clave que está realmente cargada en `value`. Evita escribir en una clave
  // nueva un valor que todavía pertenece a la anterior.
  const claveCargada = useRef<string | null>(null);
  const inicial = useRef(initial);

  useEffect(() => {
    let cargado: T = inicial.current;
    try {
      const raw = localStorage.getItem(`sumi:${key}`);
      if (raw !== null) cargado = JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(cargado);
    claveCargada.current = key;
  }, [key]);

  useEffect(() => {
    // Solo persistir cuando el valor corresponde a esta clave.
    if (claveCargada.current !== key) return;
    try {
      localStorage.setItem(`sumi:${key}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
