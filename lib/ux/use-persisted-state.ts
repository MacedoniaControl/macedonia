"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useState con persistencia en localStorage (M1 del benchmark Fina):
 * los datos de la demo sobreviven a la navegación y al refresh.
 * SSR-safe: arranca con `initial` y se hidrata en el primer efecto.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`sumi:${key}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(`sumi:${key}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
