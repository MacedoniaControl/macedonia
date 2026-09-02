"use client";

// Cilindros.
//
// Reemplaza al diseño provisional que tenía existencias inventadas escritas en
// el código (24 llenos, 12 vacíos…). Ahora todo sale de los movimientos
// registrados: si no hay movimientos, no hay cilindros, y eso es la verdad.
//
// El modelo y sus porqués están en supabase/11-cilindros.sql.

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { PageHeader } from "@/components/layout/PageHeader";
import { PanelGases } from "./PanelGases";
import { EntregaCilindros } from "./EntregaCilindros";
import { SaldosCilindros } from "./SaldosCilindros";
import { AltaCilindros } from "./AltaCilindros";
import { ResumenParque } from "./ResumenParque";
import { SalidaCilindros } from "./SalidaCilindros";

type Tab = "entrega" | "parque" | "saldos" | "alta";

export default function CylindersPage() {
  const empresa = useEmpresaActiva();
  const [tab, setTab] = useState<Tab>("entrega");
  const [recarga, setRecarga] = useState(0);

  const refrescar = () => setRecarga((n) => n + 1);

  const tabs: { id: Tab; label: string }[] = [
    // Entrega va primero: es lo que hacen seis técnicos todos los días.
    { id: "entrega", label: "Registrar entrega" },
    // Parque va antes que Rampa: responde "cuantos tengo y donde estan", que es
    // la pregunta de quien mira; Rampa es el detalle por gas y estado.
    { id: "parque", label: "Parque" },
    { id: "saldos", label: "Rampa" },
    { id: "alta", label: "Dar de alta" },
  ];

  return (
    <>
      <PageHeader
        title="Cilindros"
        description=""
        breadcrumbs={[{ label: "Inventario" }, { label: "Cilindros" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <SalidaCilindros empresa={empresa} onRegistrada={refrescar} />
            <PanelGases empresa={empresa} onCambio={refrescar} />
          </div>
        }
      />

      <div className="sumi-tabs mb-4 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`min-h-11 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-brand-strong text-white"
                : "border border-border text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "entrega" && <EntregaCilindros empresa={empresa} onRegistrada={refrescar} />}
      {tab === "parque" && <ResumenParque empresa={empresa} recarga={recarga} />}
      {tab === "saldos" && <SaldosCilindros empresa={empresa} recarga={recarga} onCambio={refrescar} />}
      {tab === "alta" && <AltaCilindros empresa={empresa} onRegistrada={refrescar} />}
    </>
  );
}
