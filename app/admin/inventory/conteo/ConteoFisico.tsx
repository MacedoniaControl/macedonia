"use client";

// Conteo físico: contar y ver el historial, en una sola pestaña del Inventario.
//
// Reemplaza al panel desplegable de antes, que era un producto a la vez y no
// servia para pasar una planilla de papel. El diseño es el de la maqueta que
// aprobo el owner (23-09-2026).

import { useState } from "react";
import { Contar } from "./Contar";
import { Historial } from "./Historial";
import { IniciarConteo } from "./IniciarConteo";
import { Icon } from "@/components/ui/Icon";

// El historial es del Owner y el Administrador: el Técnico solo cuenta.
export function ConteoFisico({ empresa, gerencia, inicial, onCerrado }: {
  empresa: string; gerencia: boolean; onCerrado: () => void;
  /** Para llegar desde una alerta directo al historial, con un conteo abierto. */
  inicial?: { vista: "historial"; abrir: number | null } | null;
}) {
  const [vista, setVista] = useState<"contar" | "historial">(inicial?.vista ?? "contar");
  const [abrir, setAbrir] = useState<number | null>(inicial?.abrir ?? null);
  const [recarga, setRecarga] = useState(0);
  // «Iniciar Conteo»: la ventana que pregunta qué se va a contar.
  const [iniciar, setIniciar] = useState(false);

  return (
    <div className="space-y-4">
      {/* «Iniciar Conteo» es a la vez la pestaña de contar: abre la planilla y
          la ventana que pregunta qué contar (si ya hay uno abierto, ahí mismo
          se sigue con ese). El Historial es del Owner y el Administrador. */}
      <div role="tablist" aria-label="Vista del conteo" className="inline-flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
        <button type="button" role="tab" aria-selected={vista === "contar" || !gerencia}
          onClick={() => { setVista("contar"); setIniciar(true); }}
          className={`sumi-pulsable inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${vista === "contar" || !gerencia ? "bg-brand-strong text-white shadow-sm" : "text-muted hover:text-text"}`}>
          <Icon name="plus" size={16} /> Iniciar Conteo
        </button>
        {gerencia && (
          <button type="button" role="tab" aria-selected={vista === "historial"} onClick={() => setVista("historial")}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition ${vista === "historial" ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>
            Historial
          </button>
        )}
      </div>

      {vista === "contar" || !gerencia ? (
        <Contar
          key={recarga}
          empresa={empresa}
          gerencia={gerencia}
          onIniciar={() => setIniciar(true)}
          onCerrado={(id) => {
            setRecarga((n) => n + 1); onCerrado();
            if (gerencia) { setAbrir(id); setVista("historial"); }
          }}
        />
      ) : (
        <Historial empresa={empresa} abrirId={abrir} recarga={recarga} onIrAContar={() => setVista("contar")} />
      )}

      {iniciar && (
        <IniciarConteo empresa={empresa} onCerrar={() => setIniciar(false)}
          onListo={() => { setIniciar(false); setRecarga((n) => n + 1); setVista("contar"); }} />
      )}
    </div>
  );
}
