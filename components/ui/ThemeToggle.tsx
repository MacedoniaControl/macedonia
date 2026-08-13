"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type ThemeState = { mounted: boolean; dark: boolean };

export function ThemeToggle() {
  const [state, setState] = useState<ThemeState>({ mounted: false, dark: false });
  const { mounted, dark } = state;

  useEffect(() => {
    // Sincroniza el estado visual con el tema ya aplicado en <html> (sistema externo: DOM).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ mounted: true, dark: document.documentElement.classList.contains("dark") });
  }, []);

  function toggle() {
    const next = !dark;
    setState({ mounted: true, dark: next });
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("sumi-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-text hover:bg-surface-2"
    >
      {/* Hasta montar, ícono estable para evitar desajuste de hidratación */}
      <Icon name={mounted && dark ? "sun" : "moon"} />
    </button>
  );
}
