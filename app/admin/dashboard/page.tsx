"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { AlertCard } from "@/components/ui/AlertCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BiVentasUtilidad, BiVentasCompras, BiCategoriasDonut } from "@/components/ui/BiCharts";
import { HistoryKpis, HistoryTrend } from "@/components/ui/HistoryStats";
import { getHistory } from "@/lib/ux/history-data";
import { fmtUsd } from "@/lib/ux/format";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { useBcvRate, useTasaViva } from "@/lib/ux/bcv-rate";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { RANGO_POR_DEFECTO, type Rango } from "@/lib/ux/rango";
import { Icon } from "@/components/ui/Icon";
import {
  productosMayorRetorno,
  categoriasMasRentables,
  cilindrosPorEstado,
  stockCriticoPorAlmacen,
  importacionesRecientes,
  alertasOperativas,
} from "@/lib/ux/dashboard-data";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";

const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text";

// Las series mensuales provienen del histórico REAL de Sumigases. Sudematin no tiene
// desglose mensual cargado: antes se estimaba multiplicando por 0,35 — un número
// inventado que se veía igual que un dato real. Ahora va en 0 hasta cargar su serie.
const FACTORES: Record<string, number> = { sumigases: 1, sudematin: 0, all: 1 };

type Filtros = { empresa: string; rango: Rango; moneda: string };

// Vista de dashboard reutilizable. Con `empresaFija` queda bloqueada a una empresa
// (rutas /admin/[empresa]/dashboard, con su tema). Sin ella, es filtrable (consolidado).
export function DashboardView({ empresaFija }: { empresaFija?: string }) {
  // v2: el rango pasa a ser {desde,hasta,agrupacion}. Clave nueva para no
  // leer el formato viejo guardado en el navegador.
  const [f, setF] = usePersistedState<Filtros>("dash:filtros:v2", { empresa: "sumigases", rango: RANGO_POR_DEFECTO, moneda: "usd" });
  const empresa = empresaFija ?? f.empresa;
  const emp = isEmpresaId(empresa) ? EMPRESAS[empresa] : null;
  const factor = FACTORES[empresa] ?? 1;
  const dias = Math.max(1, Math.round((new Date(f.rango.hasta).getTime() - new Date(f.rango.desde).getTime()) / 86400000));
  const count = Math.max(1, Math.round(dias / 30));
  const bs = f.moneda === "bs";
  // La tasa sale del BCV, no de una constante. Antes convertia con 49,5
  // mientras el BCV estaba en 787: los montos en Bs salian 16 veces abajo.
  const tasa = useTasaViva();
  const frac = count / 12; // proporción del año para KPIs monetarios acumulados

  const money = (usd: number) => {
    const v = usd * factor;
    const n = bs && tasa ? v * tasa : v;
    return (bs ? "" : "$") + Math.round(n).toLocaleString("es-VE") + (bs ? " Bs" : "");
  };
  const cnt = (n: number) => String(Math.max(0, Math.round(n * factor)));

  // KPIs operativos: pendientes de conectar a la base.
  // Van en CERO a propósito. Antes traían cifras inventadas ($1.036 de "ventas hoy",
  // 7 productos en stock crítico...) indistinguibles de un dato verdadero, y alguien
  // podía decidir sobre ellas. Se llenarán cuando existan los datos reales.
  const kpis = [
    { key: "vh", label: "Ventas hoy", value: money(0), sub: bs ? undefined : "≈ 0 Bs", tone: "brand" as const },
    { key: "cxc", label: "Cuentas por cobrar", value: money(0), sub: "0 documentos", tone: "warn" as const },
    { key: "cxp", label: "Cuentas por pagar", value: money(0), sub: "0 proveedores", tone: "danger" as const },
    { key: "sc", label: "Stock crítico", value: cnt(0), sub: "productos bajo mínimo", tone: "warn" as const },
    { key: "cp", label: "Cilindros pendientes", value: cnt(0), sub: "por retorno", tone: "info" as const },
    { key: "rp", label: "Recargas pendientes", value: cnt(0), sub: "en cola", tone: "info" as const },
    { key: "pp", label: "Pedidos pendientes", value: cnt(0), sub: "por despachar", tone: "navy" as const },
    { key: "bg", label: "Balance del período", value: money(106826 * frac), sub: "utilidad neta 2024", tone: "ok" as const },
  ];

  // Estos porcentajes y listas derivan de la serie 2024 de Sumigases. Si la empresa
  // activa no tiene serie mensual cargada (factor 0), NO se muestran los números de
  // otra empresa: van en cero y las listas quedan vacías.
  const sinSerie = factor === 0;
  const roiCards = [
    { label: "ROI del período", value: sinSerie ? "0%" : "53,3%", sub: "utilidad / inversión", accent: true },
    { label: "Utilidad estimada", value: money(106826 * frac), sub: `acumulado ${count} mes(es)` },
    { label: "Margen bruto", value: sinSerie ? "0%" : "48,0%", sub: "sobre ventas" },
    { label: "Ventas vs compras", value: `${money(310865 * frac)} / ${money(89203 * frac)}`, sub: sinSerie ? "sin datos" : "ratio 3,5x" },
  ];

  const empresaLabel = empresa === "sumigases" ? "Sumigases" : empresa === "sudematin" ? "Sudematin" : "Consolidado";

  const bcv = useBcvRate();
  // Histórico real de la empresa seleccionada.
  const hist = getHistory(empresa);
  const histLabel = empresaLabel;

  return (
    <div className={emp ? `theme-${emp.id}` : ""}>
      {emp && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <img src={emp.logo} alt={emp.nombre} className="h-9 w-auto max-w-[160px] object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{emp.nombre}</p>
            <p className="text-xs text-muted">RIF {emp.rif}</p>
          </div>
          <StatusBadge tone="brand">Panel {emp.nombreCorto}</StatusBadge>
        </div>
      )}
      <PageHeader
        title="Dashboard"
        filters={
          <>
            {!empresaFija && (
              <>
                <label className="sr-only" htmlFor="f-empresa">Empresa</label>
                <select id="f-empresa" className={selectClass} value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}>
                  <option value="sumigases">Sumigases</option>
                  <option value="sudematin">Sudematin</option>
                </select>
              </>
            )}
            <label className="sr-only" htmlFor="f-moneda">Moneda</label>
            <select id="f-moneda" className={selectClass} value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
              <option value="usd">USD</option>
              <option value="bs">{tasa ? `Bs (tasa ${tasa.toFixed(2)})` : "Bs (sin tasa)"}</option>
            </select>
          </>
        }
      />

      <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
        <SelectorRango valor={f.rango} onCambio={(r) => setF({ ...f, rango: r })} />
      </div>

      {/* Banda superior: resumen real (histórico) + tipo de cambio BCV */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {/* Resumen del histórico */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ok/10 text-ok"><Icon name="roi" size={18} /></span>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Resumen real · histórico {histLabel}</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tabular-nums text-text sm:text-xl">{fmtUsd(hist.totals.venta)}</p>
              <p className="text-xs text-muted">Ventas</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tabular-nums text-text sm:text-xl">{fmtUsd(hist.totals.util)}</p>
              <p className="text-xs text-muted">Utilidad</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tabular-nums text-ok sm:text-xl">{hist.totals.roi}%</p>
              <p className="text-xs text-muted">ROI</p>
            </div>
          </div>
        </div>

        {/* Precio del dólar BCV (se actualiza con el botón "Dolar Price" del header) */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
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
          <KpiCard key={k.key} label={k.label} value={k.value} sub={k.sub} tone={k.tone} />
        ))}
      </div>

      {/* Histórico real de ventas y compras (Valery) */}
      <div className="mt-6">
        <SectionCard
          title="Histórico de ventas y compras"
          description={`Datos reales de Valery · ${histLabel} (USD).`}
          action={<StatusBadge tone="brand">Real {hist.meta.desde.slice(0, 4)}–{hist.meta.hasta.slice(0, 4)}</StatusBadge>}
        >
          <HistoryKpis empresa={empresa} />
          <div className="mt-5 border-t border-border pt-4">
            <HistoryTrend empresa={empresa} />
          </div>
        </SectionCard>
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
              {sinSerie && <p className="text-sm text-muted">Sin serie mensual cargada para esta empresa.</p>}
              <ul className="space-y-1.5">
                {(sinSerie ? [] : productosMayorRetorno).map((p) => (
                  <li key={p.nombre} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted">{p.nombre}</span>
                    <StatusBadge tone="ok">ROI {p.roi}%</StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-text">Categorías más rentables</p>
              {sinSerie && <p className="text-sm text-muted">Sin serie mensual cargada para esta empresa.</p>}
              <ul className="space-y-1.5">
                {(sinSerie ? [] : categoriasMasRentables).map((c) => (
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
    </div>
  );
}

// Entrada por defecto (/admin/dashboard): filtrable, incluye Consolidado (Owner/Admin).
export default function DashboardPage() {
  return <DashboardView />;
}
