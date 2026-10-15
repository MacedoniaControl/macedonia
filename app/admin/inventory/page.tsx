"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar } from "@/lib/ux/exportar";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { esGerencia, puedeContar, useRol } from "@/lib/ux/session";
import { MasterInventario } from "./MasterInventario";
import { ConteoFisico } from "./conteo/ConteoFisico";
import { CatalogoProductos } from "@/app/admin/products/CatalogoProductos";
import { MovimientosPanel } from "./MovimientosPanel";

const inputClass = "sumi-campo sumi-campo--con-icono";

type Tab = "master" | "conteo" | "movimientos" | "productos";

// El boton "Descargar" de la cabecera baja la pestaña que este abierta: cada
// una declara su tabla adentro de este proveedor.
export default function InventoryPage() {
  return <Suspense fallback={null}><ConVista /></Suspense>;
}

// ?vista=conteo-historial&conteo=ID abre el Historial de Conteos con ese
// conteo desplegado: así llegan las alertas de «por verificar».
function ConVista() {
  const p = useSearchParams();
  const historial = p.get("vista") === "conteo-historial";
  const conteo = Number(p.get("conteo")) || null;
  return (
    <ProveedorExportar>
      <Inventario key={`${historial}:${conteo}`} inicial={historial ? { vista: "historial", abrir: conteo } : null} />
    </ProveedorExportar>
  );
}

function Inventario({ inicial }: { inicial: { vista: "historial"; abrir: number | null } | null }) {
  // Empresa activa según la ruta (consolidado -> sumigases).
  const empresa = useEmpresaActiva();
  const [tabElegida, setTab] = useState<Tab>(inicial ? "conteo" : "master");
  // Movimientos: Owner y Administrador. Conteo: además el Técnico. La base lo
  // vuelve a comprobar; aca solo no se ofrece lo que no se puede abrir.
  const { rol } = useRol();
  const gerencia = esGerencia(rol);
  const cuenta = puedeContar(rol);
  const permitidas: Tab[] = ["master", "productos", ...(cuenta ? ["conteo" as const] : []), ...(gerencia ? ["movimientos" as const] : [])];
  const tab: Tab = permitidas.includes(tabElegida) ? tabElegida : "master";
  const [recargaMaster, setRecargaMaster] = useState(0);
  // «Iniciar Conteo» desde el Master: lleva a Conteo con la ventana ya abierta.
  const [iniciar, setIniciar] = useState(false);
  const irA = (t: Tab) => { setTab(t); setIniciar(false); };
  const [q, setQ] = useState("");


  return (
    <>
      <PageHeader
        title="Inventario"
        breadcrumbs={[{ label: "Inventario" }, { label: "Inventario" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Iniciar Conteo va primero: es la acción principal de esta
                pantalla, y la razón por la que el Master significa algo. Dentro
                de Conteo no se muestra: ahí está su propio botón. */}
            {cuenta && tab !== "conteo" && <Button icon="inventory" onClick={() => { setTab("conteo"); setIniciar(true); }}>Iniciar Conteo</Button>}
            <BotonDescargar empresa={empresa} />
          </div>
        }
      />


      <div className="sumi-tabs mb-4 rounded-xl border border-border bg-surface p-1">
        {/* Orden pedido por el usuario (14-10-2026): Master, Productos y Catálogo, Conteo, Movimientos. */}
        {([
          ["master", "Master"],
          // Productos y catalogo pasa a subdepartamento del inventario.
          ["productos", "Productos y Catálogo"],
          ["conteo", "Conteo"],
          ["movimientos", "Movimientos"],
        ] as [Tab, string][]).filter(([id]) => permitidas.includes(id)).map(([id, label]) => (
          <button key={id} onClick={() => irA(id)}
            className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === id ? "bg-brand-strong text-white" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Productos trae su propio buscador. */}
      {tab !== "movimientos" && tab !== "conteo" && tab !== "productos" && (
        <div className="mb-3">
          <label className="relative flex max-w-md items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input type="search" placeholder="Buscar por código o nombre…" aria-label="Buscar" className={inputClass}
              value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      )}

      {/* Productos y catalogo: subdepartamento del inventario, no seccion aparte. */}
      {tab === "productos" && <CatalogoProductos embebido />}

      {tab === "movimientos" && <MovimientosPanel empresa={empresa} />}

      {/* El conteo fisico: planilla, historial y actas. */}
      {tab === "conteo" && <ConteoFisico empresa={empresa} gerencia={gerencia} inicial={inicial} iniciarAlEntrar={iniciar} onCerrado={() => setRecargaMaster((n) => n + 1)} />}


      {/* -------- MASTER dividido en 3 apartados -------- */}
      {tab === "master" && (
        <>
          {/* Valery contra lo contado a mano. Es la razon de ser del producto:
              lo que se fue sin registrarse no aparece en ningun kardex. */}
          <MasterInventario empresa={empresa} filtro={q} recarga={recargaMaster} onContar={cuenta ? () => { setTab("conteo"); setIniciar(true); } : undefined} />
        </>
      )}



    </>
  );
}

