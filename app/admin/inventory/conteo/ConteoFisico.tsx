"use client";

// Conteo físico: contar y ver el historial, en una sola pestaña del Inventario.
//
// Reemplaza al panel desplegable de antes, que era un producto a la vez y no
// servia para pasar una planilla de papel. El diseño es el de la maqueta que
// aprobo el owner (23-09-2026).

import { useState } from "react";
import { Contar } from "./Contar";
import { Historial } from "./Historial";

// El historial es del Owner y el Administrador: el Técnico solo cuenta.
export function ConteoFisico({ empresa, gerencia, onCerrado }: { empresa: string; gerencia: boolean; onCerrado: () => void }) {
  const [vista, setVista] = useState<"contar" | "historial">("contar");
  const [abrir, setAbrir] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);

  return (
    <div className="space-y-4">
      {gerencia && <div role="tablist" aria-label="Vista del conteo" className="inline-flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {([["contar", "Contar"], ["historial", "Historial"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${vista === id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>}

      {vista === "contar" || !gerencia ? (
        <Contar
          key={recarga}
          empresa={empresa}
          gerencia={gerencia}
          onCerrado={(id) => {
            setRecarga((n) => n + 1); onCerrado();
            if (gerencia) { setAbrir(id); setVista("historial"); }
          }}
        />
      ) : (
        <Historial empresa={empresa} abrirId={abrir} recarga={recarga} onIrAContar={() => setVista("contar")} />
      )}
    </div>
  );
}
