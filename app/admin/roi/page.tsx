"use client";

import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { RANGO_HISTORICO, type Rango } from "@/lib/ux/rango";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeriesChart } from "@/components/ui/SeriesChart";
import { enBs, fmtUsd } from "@/lib/ux/format";
import { useTasaViva } from "@/lib/ux/bcv-rate";
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
  const [rango, setRango] = useState<Rango>(RANGO_HISTORICO);
  const [empresa, setEmpresa] = usePersistedState("roi:empresa", "sumigases");
  const h = getHistory(empresa);
  // Los indicadores siguen el rango elegido; antes eran siempre el total
  // historico, dijera lo que dijera el selector.
  const periodos = historicoEnRango(empresa, rango);
  const t = totalesDe(periodos);
  const label = EMPRESAS.find((e) => e.id === empresa)?.label ?? "Sumigases";
  const tasa = useTasaViva();
  // ROI por producto del histórico real: utilidad / costo (venta - utilidad).
  const roiProductos = h.topProductos
    .map((p) => ({ ...p, roi: p.venta - p.util > 0 ? Math.round((p.util / (p.venta - p.util)) * 100) : null }))
    .filter((p) => p.roi !== null)
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));

  return (
    <>
      <PageHeader
        title="Rentabilidad"
        breadcrumbs={[{ label: "Inteligencia" }, { label: "Rentabilidad" }]}
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
        action={<StatusBadge tone="ok">ROI del período {t.roi}%</StatusBadge>}
      >
        <HistoryKpis empresa={empresa} tasa={tasa} />
        <div className="mt-5 border-t border-border pt-4">
          <HistoryTrend empresa={empresa} />
        </div>
      </SectionCard>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="ROI por Año" description="Ventas, compras, utilidad, margen y ROI anual.">
          <HistoryYearly empresa={empresa} />
        </SectionCard>
        <SectionCard title="Productos de Mayor Utilidad" description="Ganancia acumulada real por producto (histórico).">
          <HistoryTopProductos empresa={empresa} />
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Clientes de Mayor Facturación" description="Ventas acumuladas por cliente (histórico).">
          <HistoryTopClientes empresa={empresa} />
        </SectionCard>
        <SectionCard title="Proveedores de Mayor Compra" description="Compras acumuladas por proveedor (histórico).">
          <HistoryTopProveedores empresa={empresa} />
        </SectionCard>
      </div>

      <div className="mb-6 mt-8 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Indicadores</h2>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SectionCard title="Indicadores del Período" action={<StatusBadge tone="brand">{periodos.length} período(s)</StatusBadge>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="ROI del Período" value={`${t.roi.toLocaleString("es-VE")}%`} sub="utilidad / costo" accent />
          <StatCard label="Utilidad" value={fmtUsd(t.util)} bs={enBs(t.util, tasa)} sub="ventas menos costo" />
          <StatCard label="Margen Bruto" value={`${t.margen.toLocaleString("es-VE")}%`} sub="sobre ventas" />
          <StatCard label="Ventas" value={fmtUsd(t.venta)} bs={enBs(t.venta, tasa)} sub={`compras ${fmtUsd(t.compra)}`} />
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Ventas vs Utilidad" description="Evolución mensual de la rentabilidad (USD).">
          <SeriesChart
            labels={periodos.map((p) => p.etiqueta)}
            formato={(n) => fmtUsd(n)}
            series={[
              { name: "Ventas", color: "var(--color-brand)", values: periodos.map((p) => p.venta) },
              { name: "Utilidad", color: "var(--color-navy)", values: periodos.map((p) => p.util) },
            ]}
            height={260}
          />
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="ROI por Producto" description="Retorno sobre el costo, de los productos con más utilidad del histórico.">
          <ul className="divide-y divide-border">
            {roiProductos.map((p) => (
              <li key={p.codigo} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-text">{p.nombre}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted">{fmtUsd(p.util)}</span>
                  <StatusBadge tone="ok">ROI {(p.roi ?? 0).toLocaleString("es-VE")}%</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
