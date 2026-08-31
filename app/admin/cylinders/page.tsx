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
import { EntregaCilindros } from "./EntregaCilindros";
import { SaldosCilindros } from "./SaldosCilindros";
import { AltaCilindros } from "./AltaCilindros";

type Tab = "entrega" | "saldos" | "alta";

export default function CylindersPage() {
  const empresa = useEmpresaActiva();
  const [tab, setTab] = useState<Tab>("entrega");
  const [recarga, setRecarga] = useState(0);

  const refrescar = () => setRecarga((n) => n + 1);

  const tabs: { id: Tab; label: string }[] = [
    // Entrega va primero: es lo que hacen seis técnicos todos los días.
    { id: "entrega", label: "Registrar entrega" },
    { id: "saldos", label: "Dónde están" },
    { id: "alta", label: "Dar de alta" },
  ];

  return (
    <>
      <PageHeader
        title="Cilindros"
        description=""
        breadcrumbs={[{ label: "Inventario" }, { label: "Cilindros" }]}
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
      {tab === "saldos" && <SaldosCilindros empresa={empresa} recarga={recarga} />}
      {tab === "alta" && <AltaCilindros empresa={empresa} onRegistrada={refrescar} />}
    </>
  );
}
