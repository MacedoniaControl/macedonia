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
import { ConteosRampa } from "./ConteosRampa";
import { AltaCilindros } from "./AltaCilindros";
import { ResumenParque } from "./ResumenParque";
import { HistorialCilindros } from "./HistorialCilindros";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar } from "@/lib/ux/exportar";
import { esGerencia, puedeContar, useRol } from "@/lib/ux/session";

type Tab = "entrega" | "parque" | "saldos" | "historial";

// «Descargar» baja la pestaña abierta (Parque, Rampa o Historial).
export default function CylindersPage() {
  return <ProveedorExportar><Cilindros /></ProveedorExportar>;
}

function Cilindros() {
  const empresa = useEmpresaActiva();
  const [tabElegida, setTab] = useState<Tab>("entrega");
  // El historial es del Owner y el Administrador, como en el inventario.
  const { rol } = useRol();
  const gerencia = esGerencia(rol);
  const tab: Tab = tabElegida === "historial" && !gerencia ? "entrega" : tabElegida;
  const [recarga, setRecarga] = useState(0);

  const refrescar = () => setRecarga((n) => n + 1);

  const tabs: { id: Tab; label: string }[] = [
    // Entrega va primero: es lo que hacen seis técnicos todos los días.
    { id: "entrega", label: "Registrar Entrega" },
    // Parque va antes que Rampa: responde "cuantos tengo y donde estan", que es
    // la pregunta de quien mira; Rampa es el detalle por gas y estado. Dentro
    // de Parque también se mueve: cambiar de estado (todos) y dar de alta
    // (la gerencia), que antes era una pestaña aparte.
    { id: "parque", label: "Parque" },
    { id: "saldos", label: "Rampa" },
    ...(gerencia ? [{ id: "historial" as const, label: "Historial" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Cilindros"
        breadcrumbs={[{ label: "Inventario" }, { label: "Cilindros" }]}
        actions={
          // Los gases se agregan y se quitan en Parque → Dar de Alta.
          <BotonDescargar empresa={empresa} />
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

      {tab === "entrega" && <EntregaCilindros empresa={empresa} recarga={recarga} onRegistrada={refrescar} />}
      {tab === "parque" && (
        <ResumenParque empresa={empresa} recarga={recarga}
          acciones={<AltaCilindros empresa={empresa} gerencia={gerencia} recarga={recarga} onRegistrada={refrescar} />} />
      )}
      {tab === "saldos" && <SaldosCilindros empresa={empresa} puedeContar={puedeContar(rol)} gerencia={gerencia} recarga={recarga} onCambio={refrescar} onIrAHistorial={() => setTab("historial")} />}
      {tab === "historial" && (
        <div className="grid gap-4">
          {/* Primero lo que espera una decisión: los conteos por aprobar. */}
          <ConteosRampa empresa={empresa} recarga={recarga} onCambio={refrescar} />
          <HistorialCilindros empresa={empresa} recarga={recarga} onCambio={refrescar} />
        </div>
      )}
    </>
  );
}
