// Estadísticas históricas REALES (Valery) por empresa. Datos en lib/ux/history-data.ts.
// Todos los montos en USD. Cada componente recibe `empresa`: sumigases | sudematin | all.
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtBsCorto, fmtUsd } from "@/lib/ux/format";
import { getHistory } from "@/lib/ux/history-data";

type Props = { empresa?: string };

/** KPIs del histórico completo de la empresa. */
// Los bolívares son lo facturado: cada venta a la tasa de su día, no a la de hoy.
export function HistoryKpis({ empresa = "sumigases" }: Props) {
  const h = getHistory(empresa);
  const mes = (ym: string) => ym.split("-").reverse().join("-");
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Ventas Históricas" value={fmtUsd(h.totals.venta)} bsAproximado={false} bs={fmtBsCorto(h.totals.ventaBs)} sub={`${mes(h.meta.desde)} → ${mes(h.meta.hasta)}`} accent />
      <StatCard label="Utilidad Total" value={fmtUsd(h.totals.util)} bsAproximado={false} bs={fmtBsCorto(h.totals.utilBs)} sub="ganancia acumulada" />
      <StatCard label="ROI Histórico" value={`${h.totals.roi.toLocaleString("es-VE")}%`} sub="utilidad / costo" />
      <StatCard label="Margen Bruto" value={`${h.totals.margen.toLocaleString("es-VE")}%`} sub="sobre ventas" />
      <StatCard label="Compras Históricas" value={fmtUsd(h.totals.compra)} bsAproximado={false} bs={fmtBsCorto(h.totals.compraBs)} sub="inversión total" />
      <StatCard label="Costo de Ventas" value={fmtUsd(h.totals.costo)} bsAproximado={false} bs={fmtBsCorto(h.totals.costoBs)} sub="costo de lo vendido" />
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
              <td className="py-2.5 pr-3 text-right text-muted">{y.margen.toLocaleString("es-VE")}%</td>
              <td className="py-2.5 text-right"><StatusBadge tone="ok">{y.roi.toLocaleString("es-VE")}%</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">* {ultimoAnio} es parcial.</p>
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
