import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeriesChart } from "@/components/ui/SeriesChart";
import {
  roiCards,
  months,
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
import { histTotals, histMeta } from "@/lib/ux/history-data";

export default function RoiPage() {
  return (
    <>
      <PageHeader
        title="ROI / Rentabilidad"
        description="ROI como métrica transversal, sobre el histórico real de ventas y compras (Valery)."
        breadcrumbs={[{ label: "Inteligencia" }, { label: "ROI / Rentabilidad" }]}
      />

      {/* ---- Histórico real (Valery) ---- */}
      <SectionCard
        title="ROI histórico real"
        description={`Todo el histórico de operaciones (${histMeta.desde} → ${histMeta.hasta}).`}
        action={<StatusBadge tone="ok">ROI {histTotals.roi}%</StatusBadge>}
      >
        <HistoryKpis />
        <div className="mt-5 border-t border-border pt-4">
          <HistoryTrend />
        </div>
      </SectionCard>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="ROI por año" description="Ventas, compras, utilidad, margen y ROI anual.">
          <HistoryYearly />
        </SectionCard>
        <SectionCard title="Productos de mayor utilidad" description="Ganancia acumulada real por producto (histórico).">
          <HistoryTopProductos />
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Clientes de mayor facturación" description="Ventas acumuladas por cliente (histórico).">
          <HistoryTopClientes />
        </SectionCard>
        <SectionCard title="Proveedores de mayor compra" description="Compras acumuladas por proveedor (histórico).">
          <HistoryTopProveedores />
        </SectionCard>
      </div>

      <div className="mb-6 mt-8 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Indicadores demo (proyección 2024)</h2>
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
            labels={months}
            series={[
              { name: "Ventas", color: "var(--color-brand)", values: series.ventas },
              { name: "Utilidad", color: "var(--color-navy)", values: series.utilidad },
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
