"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { fmtEstadoValery, type TablaExport } from "@/lib/ux/tabla-export";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { MasterInventario } from "./MasterInventario";
import { ConteoFisico } from "./conteo/ConteoFisico";
import { CatalogoProductos } from "@/app/admin/products/CatalogoProductos";
import { MovimientosPanel } from "./MovimientosPanel";
import { useTableView } from "@/lib/ux/use-table-view";
import { useCarga } from "@/lib/ux/use-carga";
import { TablePager } from "@/components/ui/TablePager";
import { SortableTh } from "@/components/ui/SortableTh";
import { inventarioDe, type ItemInventario } from "@/lib/inventory/inventario-db";

const inputClass = "sumi-campo sumi-campo--con-icono";

type Tab = "master" | "conteo" | "movimientos" | "valery" | "productos";

// El boton "Descargar" de la cabecera baja la pestaña que este abierta: cada
// una declara su tabla adentro de este proveedor.
export default function InventoryPage() {
  return <ProveedorExportar><Inventario /></ProveedorExportar>;
}

function Inventario() {
  // Empresa activa según la ruta (consolidado -> sumigases).
  const empresa = useEmpresaActiva();
  const [tab, setTab] = useState<Tab>("master");
  const [recargaMaster, setRecargaMaster] = useState(0);
  const [q, setQ] = useState("");

  // El físico viene de la BASE: catálogo + existencia calculada del kardex.
  // Antes salía de un JSON del código con la existencia congelada del día del
  // export de Valery, que dejaba de ser cierta al primer movimiento.
  // Se DERIVA la carga en vez de guardarla: llamar a setState dentro del efecto
  // encadena renders. Mismo patron que el resto de la app.
  const cargaInv = useCarga(empresa, () => inventarioDe(empresa));
  const fisico: ItemInventario[] = cargaInv.datos ?? [];

  const t = q.trim().toLowerCase();
  const match = (codigo: string, nombre: string) =>
    !t || codigo.toLowerCase().includes(t) || nombre.toLowerCase().includes(t);

  const fisicoF = useMemo(() => fisico.filter((f) => match(f.codigo, f.nombre)), [t, fisico]);

  // La tabla de Valery: lo único que queda aquí, y sale de la base.
  const accValery = useMemo(
    () => ({
      codigo: (r: ItemInventario) => r.codigo,
      nombre: (r: ItemInventario) => r.nombre,
      und: (r: ItemInventario) => r.undPpal,
      existencia: (r: ItemInventario) => r.existPpal,
      alt: (r: ItemInventario) => r.existAlt,
    }),
    [],
  );
  const tVal = useTableView(fisicoF, accValery);

  return (
    <>
      <PageHeader
        title="Inventario"
        breadcrumbs={[{ label: "Inventario" }, { label: "Inventario" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Cargar conteo va primero: es la acción principal de esta
                pantalla, y la razón por la que el Master significa algo. */}
            <Button icon="inventory" onClick={() => setTab("conteo")}>Cargar conteo</Button>
            <BotonDescargar empresa={empresa} />
          </div>
        }
      />


      <div className="sumi-tabs mb-4 rounded-xl border border-border bg-surface p-1">
        {([
          ["master", "Master"],
          ["conteo", "Conteo"],
          ["valery", `Valery (${fisico.length})`],
          // Productos y catalogo pasa a subdepartamento del inventario.
          ["productos", "Productos y Catálogo"],
          ["movimientos", "Movimientos"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
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
      {tab === "conteo" && <ConteoFisico empresa={empresa} onCerrado={() => setRecargaMaster((n) => n + 1)} />}


      {/* -------- MASTER dividido en 3 apartados -------- */}
      {tab === "master" && (
        <>
          {/* Valery contra lo contado a mano. Es la razon de ser del producto:
              lo que se fue sin registrarse no aparece en ningun kardex. */}
          <MasterInventario empresa={empresa} filtro={q} recarga={recargaMaster} />
        </>
      )}


      {tab === "valery" && (
        <SectionCard title="Inventario Valery">
          <ExportaValery filas={tVal.ordenadas} busqueda={q} />
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <SortableTh label="Código" sortKey="codigo" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Nombre" sortKey="nombre" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Und." sortKey="und" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Existencia" sortKey="existencia" align="right" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Exist. Alt." sortKey="alt" align="right" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <th scope="col" className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tVal.visible.map((f) => (
                  <tr key={f.codigo} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{f.codigo}</td>
                    <td className="py-2.5 pr-3 text-text">{f.nombre}</td>
                    <td className="py-2.5 pr-3 text-muted">{f.undPpal}</td>
                    <td className={`py-2.5 pr-3 text-right ${f.existPpal < 0 ? "text-danger" : "text-text"}`}>{f.existPpal}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{f.existAlt || "—"}</td>
                    <td className="py-2.5">
                      {f.existPpal < 0 ? <StatusBadge tone="danger">Negativa</StatusBadge>
                        : f.existPpal === 0 ? <StatusBadge tone="warn">En cero</StatusBadge>
                        : <StatusBadge tone="ok">Disponible</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager {...tVal} etiqueta="productos" />
        </SectionCard>
      )}

    </>
  );
}

/** La tabla de Valery tal como se ve: su busqueda y su orden. */
function ExportaValery({ filas, busqueda }: { filas: ItemInventario[]; busqueda: string }) {
  useExportable((): TablaExport => ({
    seccion: "Valery",
    titulo: "Inventario Valery",
    detalle: [busqueda.trim() ? `Búsqueda: «${busqueda.trim()}»` : "Todos los productos", "Existencia calculada de los movimientos"],
    columnas: [
      { titulo: "Código", tipo: "codigo" }, { titulo: "Nombre" }, { titulo: "Und." },
      { titulo: "Existencia", tipo: "num" }, { titulo: "Exist. Alt.", tipo: "num" }, { titulo: "Estado" },
    ],
    filas: filas.map((f) => [f.codigo, f.nombre, f.undPpal, f.existPpal, f.existAlt || null, fmtEstadoValery(f.existPpal)]),
    totales: ["", `Total · ${filas.length.toLocaleString("es-VE")} productos`, "", filas.reduce((a, f) => a + f.existPpal, 0), null, ""],
  }));
  return null;
}
