"use client";

// Lo que muestra el histórico espera a tener los meses leídos de la base.
// Antes, al abrir la página, se veían 1–2 segundos las cifras viejas del Excel.

import type { ReactNode } from "react";
import { useEstadoHistorico } from "@/lib/ux/use-meses-cargados";

export function EsperaHistorico({ children, className = "" }: { children: ReactNode; className?: string }) {
  const estado = useEstadoHistorico();
  if (estado === "listo") return <>{children}</>;
  return (
    <div role="status" aria-live="polite" className={`${className} rounded-2xl border border-border bg-surface p-6 text-sm text-muted`}>
      {estado === "error"
        ? "No se pudo leer el histórico. Recarga la página para intentarlo de nuevo."
        : "Leyendo el histórico…"}
    </div>
  );
}
