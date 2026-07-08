"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { AlertCard } from "@/components/ui/AlertCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BiVentasUtilidad, BiVentasCompras, BiCategoriasDonut } from "@/components/ui/BiCharts";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { useBcvRate } from "@/lib/ux/bcv-rate";
import { Icon } from "@/components/ui/Icon";
import {
  RATE_BS,
  productosMayorRetorno,
  categoriasMasRentables,
  cilindrosPorEstado,
  stockCriticoPorAlmacen,
  importacionesRecientes,
  alertasOperativas,
} from "@/lib/ux/dashboard-data";

const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text";

// Factores demo por empresa (Sudematin sin data propia → 0,35× etiquetado)
const FACTORES: Record<string, number> = { sumigases: 1, sudematin: 0.35, all: 1.35 };
const RANGOS: Record<string, number> = { year: 12, sem: 6, tri: 3, mes: 1 };

type Filtros = { empresa: string; rango: string; moneda: string };

export default function DashboardPage() {
  const [f, setF] = usePersistedState<Filtros>("dash:filtros", { empresa: "sumigases", rango: "year", moneda: "usd" });
  const factor = FACTORES[f.empresa] ?? 1;
  const count = RANGOS[f.rango] ?? 12;
  const bs = f.moneda === "bs";
  const frac = count / 12; // proporción del año para KPIs monetarios acumulados

  const money = (usd: number) => {
    const v = usd * factor;
    const n = bs ? v * RATE_BS : v;
    return (bs ? "" : "$") + Math.round(n).toLocaleString("es-VE") + (bs ? " Bs" : "");
  };
  const cnt = (n: number) => String(Math.max(0, Math.round(n * factor)));

  const kpis = [
    { key: "vh", label: "Ventas hoy", value: money(1036), sub: bs ? undefined : `≈ ${Math.round(1036 * factor * RATE_BS).toLocaleString("es-VE")} Bs`, tone: "brand" as const, demo: true },
    { key: "cxc", label: "Cuentas por cobrar", value: money(18500), sub: `${cnt(12)} documentos`, tone: "warn" as const, demo: true },
    { key: "cxp", label: "Cuentas por pagar", value: money(9200), sub: `${cnt(5)} proveedores`, tone: "danger" as const, demo: true },
    { key: "sc", label: "Stock crítico", value: cnt(7), sub: "productos bajo mínimo", tone: "warn" as const, demo: true },
    { key: "cp", label: "Cilindros pendientes", value: cnt(9), sub: "por retorno", tone: "info" as const, demo: true },
    { key: "rp", label: "Recargas pendientes", value: cnt(5), sub: "en cola", tone: "info" as const, demo: true },
    { key: "pp", label: "Pedidos pendientes", value: cnt(3), sub: "por despachar", tone: "navy" as const, demo: true },
    { key: "bg", label: "Balance del período", value: money(106826 * frac), sub: "utilidad neta 2024", tone: "ok" as const },
  ];

  const roiCards = [
    { label: "ROI del período", value: "53,3%", sub: "utilidad / inversión", accent: true },
    { label: "Utilidad estimada", value: money(106826 * frac), sub: `acumulado ${count} mes(es)` },
    { label: "Margen bruto", value: "48,0%", sub: "sobre ventas" },
    { label: "Ventas vs compras", value: `${money(310865 * frac)} / ${money(89203 * frac)}`, sub: "ratio 3,5x" },
  ];

  const empresaLabel = f.empresa === "sumigases" ? "Sumigases" : f.empresa === "sudematin" ? "Sudematin (demo 0,35×)" : "Consolidado";

  const bcv = useBcvRate();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Visión ejecutiva · ${empresaLabel} · cifras 2024 reales de Sumigases. Los filtros recalculan KPIs y gráficas.`}
        breadcrumbs={[{ label: "Resumen" }, { label: "Dashboard" }]}
        filters={
          <>
            <label className="sr-only" htmlFor="f-empresa">Empresa</label>
            <select id="f-empresa" className={selectClass} value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}>
              <option value="sumigases">Sumigases</option>
              <option value="sudematin">Sudematin</option>
              <option value="all">Consolidado</option>
            </select>
            <label className="sr-only" htmlFor="f-rango">Rango</label>
            <select id="f-rango" className={selectClass} value={f.rango} onChange={(e) => setF({ ...f, rango: e.target.value })}>
              <option value="year">Año 2024</option>
              <option value="sem">Últimos 6 meses</option>
              <option value="tri">Último trimestre</option>
              <option value="mes">Último mes</option>
            </select>
            <label className="sr-only" htmlFor="f-moneda">Moneda</label>
            <select id="f-moneda" className={selectClass} value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
              <option value="usd">USD</option>
              <option value="bs">Bs (tasa {RATE_BS})</option>
            </select>
          </>
        }
      />

      {/* Precio del dólar BCV (se actualiza con el botón "Dolar Price" del header) */}
      <div className="mb-4 flex justify-end">
        <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-sm sm:max-w-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon name="dollar" size={18} /></span>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Precio del dólar · BCV</p>
          </div>
          {bcv ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-text">{bcv.tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs</p>
              <p className="mt-1 text-xs text-muted">
                {bcv.fecha ? `Fecha valor BCV: ${bcv.fecha} · ` : ""}Consultado: {new Date(bcv.fetchedAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-muted">— Bs</p>
              <p className="mt-1 text-xs text-muted">Sin consulta. Pulsa “Dolar Price” en la barra superior.</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} sub={k.sub} tone={k.tone} demo={k.demo} />
        ))}
      </div>

      <div className="mt-6">
        <SectionCard title="Rentabilidad / ROI" description={`Indicadores del período (${count} mes(es)). Base real 2024.`}
          action={<StatusBadge tone="brand">Métrica clave</StatusBadge>}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {roiCards.map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} accent={c.accent} />
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-text">Productos con mayor retorno</p>
              <ul className="space-y-1.5">
                {productosMayorRetorno.map((p) => (
                  <li key={p.nombre} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted">{p.nombre}</span>
                    <StatusBadge tone="ok">ROI {p.roi}%</StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-text">Categorías más rentables</p>
              <ul className="space-y-1.5">
                {categoriasMasRentables.map((c) => (
                  <li key={c.nombre} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted">{c.nombre}</span>
                    <StatusBadge tone="brand">Margen {c.margen}%</StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Ventas vs utilidad" description={`${empresaLabel} · ${count} mes(es) · ${bs ? "Bs" : "USD"}. Interactivo.`}>
          <BiVentasUtilidad factor={factor} bs={bs} count={count} />
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Ventas vs compras" description="Responde a los filtros. Interactivo.">
          <BiVentasCompras factor={factor} bs={bs} count={count} />
        </SectionCard>
        <SectionCard title="Categorías más rentables" description="Margen por categoría.">
          <BiCategoriasDonut />
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cilindros por estado" description="Inventario operativo de cilindros.">
          <ul className="space-y-3">
            {cilindrosPorEstado.map((c) => {
              const total = cilindrosPorEstado.reduce((a, b) => a + b.cantidad, 0);
              const pct = Math.round((c.cantidad / total) * 100);
              return (
                <li key={c.estado}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <StatusBadge tone={c.tone}>{c.estado}</StatusBadge>
                    <span className="font-medium text-text">{Math.round(c.cantidad * factor)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Stock crítico por almacén" description="Productos bajo el mínimo definido.">
          <ul className="divide-y divide-border">
            {stockCriticoPorAlmacen.map((s) => (
              <li key={s.almacen} className="flex items-center justify-between py-3 text-sm">
                <span className="text-text">{s.almacen}</span>
                <StatusBadge tone={s.criticos > 3 ? "danger" : "warn"}>{Math.max(1, Math.round(s.criticos * factor))} críticos</StatusBadge>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Importaciones recientes" description="Últimas matrices cargadas.">
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Archivo</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Filas</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {importacionesRecientes.map((imp) => (
                  <tr key={imp.archivo}>
                    <td className="max-w-[14rem] truncate py-2.5 pr-3 text-text">{imp.archivo}</td>
                    <td className="py-2.5 pr-3 text-muted">{imp.fecha}</td>
                    <td className="py-2.5 pr-3 text-muted">{imp.filas}</td>
                    <td className="py-2.5"><StatusBadge tone="ok">{imp.estado}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard title="Alertas operativas" description="Atención requerida.">
          <div className="space-y-3">
            {alertasOperativas.map((a) => (
              <AlertCard key={a.titulo} tone={a.tone} titulo={a.titulo} mensaje={a.mensaje} />
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
