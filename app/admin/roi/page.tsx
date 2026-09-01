"use client";

import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { RANGO_POR_DEFECTO, type Rango } from "@/lib/ux/rango";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeriesChart } from "@/components/ui/SeriesChart";
import {
  roiCards,
  series,
  productosMayorRetorno,
  categoriasMasRentables,
} from "@/lib/ux/dashboard-data";
import {
  HistoryKpis,
  HistoryTrend,
  HistoryYearly,
  HistoryTopProductos,
  HistoryTopClientes,
  HistoryTopProveedores,
} from "@/components/ui/HistoryStats";
import { getHistory } from "@/lib/ux/history-data";
import { historicoEnRango, totalesDe, AGRUPACIONES_HISTORICO } from "@/lib/ux/historico-rango";

const EMPRESAS = [
  { id: "sumigases", label: "Sumigases" },
  { id: "sudematin", label: "Sudematin" },
];

export default function RoiPage() {
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO);
  const [empresa, setEmpresa] = usePersistedState("roi:empresa", "sumigases");
  const h = getHistory(empresa);
  // Los indicadores siguen el rango elegido; antes eran siempre el total
  // historico, dijera lo que dijera el selector.
  const periodos = historicoEnRango(empresa, rango);
  const t = totalesDe(periodos);
  const label = EMPRESAS.find((e) => e.id === empresa)?.label ?? "Sumigases";

  return (
    <>
      <PageHeader
        title="ROI / Rentabilidad"
        description=""
        breadcrumbs={[{ label: "Inteligencia" }, { label: "ROI / Rentabilidad" }]}
        filters={
          <>
            <label className="sr-only" htmlFor="roi-empresa">Empresa</label>
            <select id="roi-empresa" className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
              value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
              {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </>
        }
      />

      {/* ---- Histórico real (Valery) ---- */}
      <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
        <SelectorRango valor={rango} onCambio={setRango} agrupaciones={AGRUPACIONES_HISTORICO} />
      </div>

      <SectionCard
        title={`ROI histórico real · ${label}`}
        action={<StatusBadge tone="ok">ROI {t.roi}%</StatusBadge>}
      >
        <HistoryKpis empresa={empresa} />
        <div className="mt-5 border-t border-border pt-4">
          <HistoryTrend empresa={empresa} />
        </div>
      </SectionCard>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="ROI por año" description="Ventas, compras, utilidad, margen y ROI anual.">
          <HistoryYearly empresa={empresa} />
        </SectionCard>
        <SectionCard title="Productos de mayor utilidad" description="Ganancia acumulada real por producto (histórico).">
          <HistoryTopProductos empresa={empresa} />
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Clientes de mayor facturación" description="Ventas acumuladas por cliente (histórico).">
          <HistoryTopClientes empresa={empresa} />
        </SectionCard>
        <SectionCard title="Proveedores de mayor compra" description="Compras acumuladas por proveedor (histórico).">
          <HistoryTopProveedores empresa={empresa} />
        </SectionCard>
      </div>

      <div className="mb-6 mt-8 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Indicadores</h2>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SectionCard title="Indicadores del período" action={<StatusBadge tone="brand">2024</StatusBadge>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {roiCards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} accent={c.accent} />
          ))}
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Ventas vs utilidad" description="Evolución mensual de la rentabilidad (USD).">
          <SeriesChart
            labels={periodos.map((p) => p.etiqueta)}
            series={[
              { name: "Ventas", color: "var(--color-brand)", values: periodos.map((p) => p.venta) },
              { name: "Utilidad", color: "var(--color-navy)", values: periodos.map((p) => p.util) },
            ]}
            height={260}
          />
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="ROI por producto" description="Mayor retorno sobre costo.">
          <ul className="divide-y divide-border">
            {productosMayorRetorno.map((p) => (
              <li key={p.nombre} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="truncate text-text">{p.nombre}</span>
                <StatusBadge tone="ok">ROI {p.roi}%</StatusBadge>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="ROI por categoría" description="Margen bruto promedio.">
          <ul className="divide-y divide-border">
            {categoriasMasRentables.map((c) => (
              <li key={c.nombre} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="truncate text-text">{c.nombre}</span>
                <StatusBadge tone="brand">Margen {c.margen}%</StatusBadge>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
