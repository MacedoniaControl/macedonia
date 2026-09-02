// Estadísticas históricas REALES (Valery) por empresa. Datos en lib/ux/history-data.ts.
// Todos los montos en USD. Cada componente recibe `empresa`: sumigases | sudematin | all.
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtUsd } from "@/lib/ux/format";
import { getHistory, type HistMonth } from "@/lib/ux/history-data";

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function labelMes(ym: string) {
  const [y, m] = ym.split("-");
  return `${MESES[Number(m)]} ${y.slice(2)}`;
}

type Props = { empresa?: string };

/** KPIs del histórico completo de la empresa. */
export function HistoryKpis({ empresa = "sumigases" }: Props) {
  const h = getHistory(empresa);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Ventas históricas" value={fmtUsd(h.totals.venta)} sub={`${h.meta.desde} → ${h.meta.hasta}`} accent />
      <StatCard label="Utilidad total" value={fmtUsd(h.totals.util)} sub="ganancia acumulada" />
      <StatCard label="ROI histórico" value={`${h.totals.roi}%`} sub="utilidad / costo" />
      <StatCard label="Margen bruto" value={`${h.totals.margen}%`} sub="sobre ventas" />
      <StatCard label="Compras históricas" value={fmtUsd(h.totals.compra)} sub="inversión total" />
      <StatCard label="Costo de ventas" value={fmtUsd(h.totals.costo)} sub="costo de lo vendido" />
    </div>
  );
}

/** Tendencia mensual: ventas vs compras vs utilidad (línea, SVG responsive). */
export function HistoryTrend({ empresa = "sumigases", height = 260 }: Props & { height?: number }) {
  const h = getHistory(empresa);
  const data: HistMonth[] = h.months;
  if (data.length === 0) return <p className="text-sm text-muted">Sin datos para esta empresa.</p>;

  const W = 760, H = height, padL = 8, padR = 8, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => Math.max(d.venta, d.compra, d.util)));
  const n = data.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  // El ultimo mes ya no se punteaba por incompleto: el historico se recalculo
  // hasta 2026-08, un mes cerrado. Antes cortaba a mitad de julio y la linea se
  // desplomaba al final; puntear un mes que SI esta completo mentiria al reves.
  const tramo = (key: keyof HistMonth, desde: number, hasta: number) =>
    data.slice(desde, hasta).map((d, k) => `${x(desde + k)},${y(d[key] as number)}`).join(" ");
  const line = (key: keyof HistMonth) => tramo(key, 0, n);
  const series = [
    { name: "Ventas", color: "var(--color-brand)", key: "venta" as const },
    { name: "Compras", color: "var(--color-warn)", key: "compra" as const },
    { name: "Utilidad", color: "var(--color-ok)", key: "util" as const },
  ];
  const marcas = data.map((d, i) => ({ i, ym: d.ym })).filter((d) => d.ym.endsWith("-01") || d.i === 0);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Tendencia mensual de ventas, compras y utilidad">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={padL} x2={W - padR} y1={padT + plotH * (1 - t)} y2={padT + plotH * (1 - t)} stroke="var(--color-border)" strokeWidth={1} />
        ))}
        {marcas.map((mk) => (
          <g key={mk.ym}>
            <line x1={x(mk.i)} x2={x(mk.i)} y1={padT} y2={padT + plotH} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(mk.i) + 3} y={H - 8} fontSize={11} fill="var(--color-muted)">{mk.ym.slice(0, 4)}</text>
          </g>
        ))}
        {series.map((s) => (
          <polyline key={s.name} points={line(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted">
        {labelMes(data[0].ym)} – {labelMes(data[n - 1].ym)} · {n} meses · fuente: exports de Valery
      </p>
    </div>
  );
}

/** Tabla comparativa por año con margen y ROI. */
export function HistoryYearly({ empresa = "sumigases" }: Props) {
  const h = getHistory(empresa);
  const ultimoAnio = h.years.length ? h.years[h.years.length - 1].year : null;
  return (
    <div className="sumi-scroll max-w-full overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-2.5 pr-3 font-medium">Año</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Ventas</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Compras</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Utilidad</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Margen</th>
            <th scope="col" className="py-2.5 text-right font-medium">ROI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {h.years.map((y) => (
            <tr key={y.year} className="hover:bg-surface-2">
              <td className="py-2.5 pr-3 font-medium text-text">{y.year}{y.year === ultimoAnio ? " *" : ""}</td>
              <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(y.venta)}</td>
              <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(y.compra)}</td>
              <td className="py-2.5 pr-3 text-right font-medium text-ok">{fmtUsd(y.util)}</td>
              <td className="py-2.5 pr-3 text-right text-muted">{y.margen}%</td>
              <td className="py-2.5 text-right"><StatusBadge tone="ok">{y.roi}%</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">* {ultimoAnio} es parcial (hasta {h.meta.hasta}).</p>
    </div>
  );
}

/** Top productos por utilidad histórica. */
export function HistoryTopProductos({ empresa = "sumigases" }: Props) {
  const h = getHistory(empresa);
  return (
    <ul className="divide-y divide-border">
      {h.topProductos.map((p) => (
        <li key={p.codigo + p.nombre} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="block truncate text-text">{p.nombre}</span>
            <span className="font-mono text-[11px] text-muted">{p.codigo}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-medium text-ok">{fmtUsd(p.util)}</span>
            <span className="text-[11px] text-muted">venta {fmtUsd(p.venta)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HistoryTopClientes({ empresa = "sumigases" }: Props) {
  const h = getHistory(empresa);
  return (
    <ul className="divide-y divide-border">
      {h.topClientes.map((c) => (
        <li key={c.nombre} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0 truncate text-text">{c.nombre}</span>
          <span className="shrink-0 font-medium text-text">{fmtUsd(c.venta)}</span>
        </li>
      ))}
    </ul>
  );
}

export function HistoryTopProveedores({ empresa = "sumigases" }: Props) {
  const h = getHistory(empresa);
  return (
    <ul className="divide-y divide-border">
      {h.topProveedores.map((p) => (
        <li key={p.nombre} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0 truncate text-text">{p.nombre}</span>
          <span className="shrink-0 font-medium text-text">{fmtUsd(p.compra)}</span>
        </li>
      ))}
    </ul>
  );
}
