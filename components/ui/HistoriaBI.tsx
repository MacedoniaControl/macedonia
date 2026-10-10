"use client";

// El histórico de ventas, compras y utilidad como gráfico dinámico (BI).
//
// Antes era una imagen fija de 40 meses: no se podía ver un número, ni acotar
// el período, ni comparar trimestres. Ahora:
//   · ventana (12 o 24 meses, un año o todo) en un desplegable, agrupación
//     (mes, trimestre, año) y moneda (dólares o los bolívares FACTURADOS);
//   · el gráfico (GraficoBI): líneas o barras, series que se encienden y
//     apagan, globo con montos, variación, margen y ROI;
//   · arriba, el resumen de lo que se está viendo; abajo, la tabla.
// Las cuentas están en lib/ux/historico-bi.ts. Cada empresa ve sus números.

import { useMemo, useState } from "react";
import { getHistory } from "@/lib/ux/history-data";
import { GraficoBI } from "@/components/ui/GraficoBI";
import { fmtBs, fmtUsd } from "@/lib/ux/format";
import {
  abreviar, agrupar, aniosDe, mesesEnVentana, resumir,
  type AgrupacionBI, type MonedaBI, type PeriodoBI, type SerieBI, type VentanaBI,
} from "@/lib/ux/historico-bi";

const SERIES: { key: SerieBI; nombre: string; color: string; encendida: boolean }[] = [
  { key: "venta", nombre: "Ventas", color: "var(--color-brand)", encendida: true },
  { key: "compra", nombre: "Compras", color: "var(--color-warn)", encendida: true },
  { key: "util", nombre: "Utilidad", color: "var(--color-ok)", encendida: true },
  { key: "costo", nombre: "Costo", color: "var(--color-info)", encendida: false },
];

/** Un control segmentado: las opciones juntas en una sola cápsula. */
function Segmentos<T extends string>({ etiqueta, opciones, valor, onCambio }: {
  etiqueta: string; opciones: { id: T; label: string; titulo?: string }[]; valor: T; onCambio: (v: T) => void;
}) {
  return (
    <div className="inline-flex h-11 shrink-0 items-center rounded-full border border-border bg-surface-2 p-[3px]" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => onCambio(o.id)}
          title={o.titulo} aria-label={o.titulo}
          className={`h-full rounded-full px-3.5 text-xs font-medium transition-colors ${valor === o.id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function HistoriaBI({ empresa = "sumigases", height = 280 }: { empresa?: string; height?: number }) {
  const h = getHistory(empresa);
  const [ventana, setVentana] = useState<VentanaBI>("todo");
  const [agr, setAgr] = useState<AgrupacionBI>("mes");
  const [moneda, setMoneda] = useState<MonedaBI>("usd");

  const anios = aniosDe(h.months);
  const incompletos = h.meta.incompletos.map((m) => m.ym);
  const ps: PeriodoBI[] = useMemo(
    () => agrupar(mesesEnVentana(h.months, ventana), agr, moneda, incompletos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empresa, ventana, agr, moneda],
  );
  const r = resumir(ps);
  const n = ps.length;
  const fmt = (v: number) => (moneda === "bs"
    ? fmtBs(v)
    : fmtUsd(v));

  if (h.months.length === 0) return <p className="text-sm text-muted">Sin datos para esta empresa.</p>;

  return (
    <div className="w-full min-w-0">
      {/* ---------------- Filtros: una sola fila. El período es un desplegable
          (eran siete píldoras); agrupar y moneda, dos controles segmentados. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`hbi-periodo-${empresa}`}>Período</label>
        <select id={`hbi-periodo-${empresa}`} className="sumi-campo sumi-campo--auto text-xs font-medium" style={{ borderRadius: 9999, borderColor: "var(--border)", paddingInline: "0.875rem" }}
          value={ventana} onChange={(e) => setVentana(e.target.value as VentanaBI)}>
          <option value="12m">Últimos 12 meses</option>
          <option value="24m">Últimos 24 meses</option>
          {[...anios].reverse().map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="todo">Todo el histórico</option>
        </select>
        <Segmentos etiqueta="Agrupar por" valor={agr} onCambio={setAgr}
          opciones={[{ id: "mes", label: "Mes" }, { id: "trimestre", label: "Trimestre" }, { id: "anio", label: "Año" }]} />
        <Segmentos etiqueta="Moneda" valor={moneda} onCambio={setMoneda}
          opciones={[{ id: "usd", label: "US$", titulo: "Dólares" }, { id: "bs", label: "Bs", titulo: "Bolívares facturados" }]} />
      </div>

      {/* ---------------- Resumen de lo que se ve */}
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
        {[
          ["Ventas", fmt(r.venta)], ["Compras", fmt(r.compra)], ["Utilidad", fmt(r.util)],
          ["Margen", `${r.margen.toLocaleString("es-VE")}%`], ["ROI", `${r.roi.toLocaleString("es-VE")}%`],
          ["Mejor período", r.mejor ? `${r.mejor.etiquetaLarga}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{k}</dt>
            <dd className="text-sm font-semibold tabular-nums text-text [overflow-wrap:break-word]">{v}</dd>
          </div>
        ))}
      </dl>

      <GraficoBI
        puntos={ps}
        series={SERIES.map((s) => ({ ...s, valores: ps.map((q) => q[s.key]) }))}
        formato={fmt}
        abreviar={(v) => abreviar(v, moneda)}
        alto={height}
        descripcion="Histórico de ventas, compras y utilidad"
        pie={(i) => (
          <p className="flex justify-between">
            <span>Margen {ps[i].margen.toLocaleString("es-VE")}%</span><span>ROI {ps[i].roi.toLocaleString("es-VE")}%</span>
          </p>
        )}
      />

      {/* ---------------- La tabla, para leer o copiar los números */}
      <details className="mt-3 rounded-xl border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-text">Ver tabla ({n} período{n === 1 ? "" : "s"})</summary>
        <div className="sumi-scroll max-h-80 overflow-auto border-t border-border">
          <table className="w-full min-w-[560px] text-right text-xs tabular-nums">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Período</th>
                <th className="px-3 py-2 font-medium">Ventas</th><th className="px-3 py-2 font-medium">Compras</th>
                <th className="px-3 py-2 font-medium">Costo</th><th className="px-3 py-2 font-medium">Utilidad</th>
                <th className="px-3 py-2 font-medium">Margen</th><th className="px-3 py-2 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ps.map((q) => (
                <tr key={q.clave}>
                  <td className="px-3 py-1.5 text-left text-text">{q.etiquetaLarga}{q.incompleto && <span className="text-warn"> *</span>}</td>
                  <td className="px-3 py-1.5 text-text">{fmt(q.venta)}</td><td className="px-3 py-1.5 text-muted">{fmt(q.compra)}</td>
                  <td className="px-3 py-1.5 text-muted">{fmt(q.costo)}</td><td className="px-3 py-1.5 text-text">{fmt(q.util)}</td>
                  <td className="px-3 py-1.5 text-muted">{q.margen.toLocaleString("es-VE")}%</td><td className="px-3 py-1.5 text-muted">{q.roi.toLocaleString("es-VE")}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong font-semibold text-text">
              <tr>
                <td className="px-3 py-2 text-left">Total</td><td className="px-3 py-2">{fmt(r.venta)}</td><td className="px-3 py-2">{fmt(r.compra)}</td>
                <td className="px-3 py-2">{fmt(r.costo)}</td><td className="px-3 py-2">{fmt(r.util)}</td>
                <td className="px-3 py-2">{r.margen.toLocaleString("es-VE")}%</td><td className="px-3 py-2">{r.roi.toLocaleString("es-VE")}%</td>
              </tr>
            </tfoot>
          </table>
          {ps.some((q) => q.incompleto) && <p className="px-3 py-2 text-left text-[11px] text-muted">* Mes con días sin ventas registradas.</p>}
        </div>
      </details>
    </div>
  );
}
