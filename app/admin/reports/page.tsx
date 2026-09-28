"use client";

// Reportes del histórico de Valery: ventas, utilidad, ventas contra compras y
// rentabilidad, por el período que se elija.
//
// Antes la pantalla tenía la tabla apretada debajo del selector de fechas, una
// etiqueta «2024 · USD» fija aunque los datos fueran de 2025-2026, y el total
// de Rentabilidad SUMABA porcentajes (y los escribía con $). Ahora:
//   · arriba, el reporte y el período en una sola barra;
//   · cuatro cifras del período, con su equivalente en bolívares;
//   · el gráfico del reporte y la tabla a todo el ancho;
//   · margen y ROI del total se calculan de los totales, no sumando meses;
//   · «Descargar» es el mismo de toda la app (Excel y PDF).

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeriesChart } from "@/components/ui/SeriesChart";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { RANGO_HISTORICO, type Rango } from "@/lib/ux/rango";
import { historicoEnRango, totalesDe, AGRUPACIONES_HISTORICO, type Periodo } from "@/lib/ux/historico-rango";
import { HISTORY, type EmpresaHist } from "@/lib/ux/history-data";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import { enBs, fmtUsd } from "@/lib/ux/format";
import type { TipoColumna } from "@/lib/ux/tabla-export";

type Totales = ReturnType<typeof totalesDe>;
type Col = { h: string; get: (p: Periodo | Totales) => number; tipo: "usd" | "pct" };
type Cifra = { label: string; value: string; bs?: string | null; sub?: string; accent?: boolean };
type Reporte = {
  id: string;
  title: string;
  cols: Col[];
  /** Lo que se dibuja: una barra por serie en cada período. */
  series: { name: string; color: string; get: (p: Periodo) => number }[];
  pct?: boolean;
  cifras: (t: Totales, ps: Periodo[], tasa: number | null) => Cifra[];
};

const pct = (n: number) => `${n.toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const veces = (a: number, b: number) => (b > 0 ? `${(a / b).toLocaleString("es-VE", { maximumFractionDigits: 2 })}x` : "—");
const mejor = (ps: Periodo[], get: (p: Periodo) => number) =>
  ps.reduce<Periodo | null>((m, p) => (!m || get(p) > get(m) ? p : m), null);

const REPORTES: Reporte[] = [
  {
    id: "ventas", title: "Ventas",
    cols: [{ h: "Ventas", get: (p) => p.venta, tipo: "usd" }],
    series: [{ name: "Ventas", color: "var(--color-brand)", get: (p) => p.venta }],
    cifras: (t, ps, tasa) => {
      const m = mejor(ps, (p) => p.venta);
      const prom = ps.length ? t.venta / ps.length : 0;
      return [
        { label: "Ventas", value: fmtUsd(t.venta), bs: enBs(t.venta, tasa), sub: `${ps.length} período(s)`, accent: true },
        { label: "Promedio", value: fmtUsd(prom), bs: enBs(prom, tasa), sub: "por período" },
        { label: "Mejor Período", value: m ? fmtUsd(m.venta) : "—", sub: m?.etiqueta },
        { label: "Utilidad", value: fmtUsd(t.util), bs: enBs(t.util, tasa), sub: `margen ${pct(t.margen)}` },
      ];
    },
  },
  {
    id: "utilidad", title: "Utilidad",
    cols: [
      { h: "Ventas", get: (p) => p.venta, tipo: "usd" },
      { h: "Costo", get: (p) => p.costo, tipo: "usd" },
      { h: "Utilidad", get: (p) => p.util, tipo: "usd" },
      { h: "Margen", get: (p) => p.margen, tipo: "pct" },
    ],
    series: [
      { name: "Ventas", color: "var(--color-brand)", get: (p) => p.venta },
      { name: "Costo", color: "var(--color-muted)", get: (p) => p.costo },
      { name: "Utilidad", color: "var(--color-ok)", get: (p) => p.util },
    ],
    cifras: (t, _ps, tasa) => [
      { label: "Utilidad", value: fmtUsd(t.util), bs: enBs(t.util, tasa), sub: "ventas menos costo", accent: true },
      { label: "Ventas", value: fmtUsd(t.venta), bs: enBs(t.venta, tasa) },
      { label: "Costo", value: fmtUsd(t.costo), bs: enBs(t.costo, tasa), sub: "de lo vendido" },
      { label: "Margen", value: pct(t.margen), sub: "utilidad sobre ventas" },
    ],
  },
  {
    id: "vc", title: "Ventas vs Compras",
    cols: [
      { h: "Ventas", get: (p) => p.venta, tipo: "usd" },
      { h: "Compras", get: (p) => p.compra, tipo: "usd" },
      { h: "Diferencia", get: (p) => p.venta - p.compra, tipo: "usd" },
    ],
    series: [
      { name: "Ventas", color: "var(--color-brand)", get: (p) => p.venta },
      { name: "Compras", color: "var(--color-warn)", get: (p) => p.compra },
    ],
    cifras: (t, _ps, tasa) => [
      { label: "Ventas", value: fmtUsd(t.venta), bs: enBs(t.venta, tasa), accent: true },
      { label: "Compras", value: fmtUsd(t.compra), bs: enBs(t.compra, tasa) },
      { label: "Diferencia", value: fmtUsd(t.venta - t.compra), bs: enBs(t.venta - t.compra, tasa), sub: "ventas menos compras" },
      { label: "Ventas / Compras", value: veces(t.venta, t.compra), sub: "por cada dólar comprado" },
    ],
  },
  {
    id: "roi", title: "Rentabilidad", pct: true,
    cols: [
      { h: "Utilidad", get: (p) => p.util, tipo: "usd" },
      { h: "Margen", get: (p) => p.margen, tipo: "pct" },
      { h: "ROI", get: (p) => p.roi, tipo: "pct" },
    ],
    series: [
      { name: "Margen %", color: "var(--color-info)", get: (p) => p.margen },
      { name: "ROI %", color: "var(--color-ok)", get: (p) => p.roi },
    ],
    cifras: (t, ps, tasa) => {
      const m = mejor(ps, (p) => p.roi);
      return [
        { label: "ROI", value: pct(t.roi), sub: "utilidad sobre costo", accent: true },
        { label: "Margen", value: pct(t.margen), sub: "utilidad sobre ventas" },
        { label: "Utilidad", value: fmtUsd(t.util), bs: enBs(t.util, tasa) },
        { label: "Mejor ROI", value: m ? pct(m.roi) : "—", sub: m?.etiqueta },
      ];
    },
  },
];

const fmt = (c: Col, v: number) => (c.tipo === "pct" ? pct(v) : fmtUsd(v));

export default function ReportsPage() {
  return <ProveedorExportar><Reportes /></ProveedorExportar>;
}

function Reportes() {
  const empresa = useEmpresaActiva();
  const tasa = useTasaViva();
  const [rango, setRango] = useState<Rango>(RANGO_HISTORICO);
  const [selId, setSel] = useState(REPORTES[0].id);
  const sel = REPORTES.find((r) => r.id === selId) ?? REPORTES[0];

  const periodos = historicoEnRango(empresa, rango);
  const t = totalesDe(periodos);
  const meta = (HISTORY[empresa as EmpresaHist] ?? HISTORY.sumigases).meta;
  const hasta = meta.hasta.split("-").reverse().join("-");
  const porAnio = rango.agrupacion === "anio";
  const desdeVista = rango.desde.split("-").reverse().join("-");
  const hastaVista = rango.hasta.split("-").reverse().join("-");

  useExportable(() => ({
    seccion: `Reporte de ${sel.title}`,
    titulo: `Reporte de ${sel.title}`,
    detalle: [`Del ${desdeVista} al ${hastaVista}`, `Por ${porAnio ? "año" : "mes"}`, `Histórico de Valery, hasta ${hasta}`],
    columnas: [{ titulo: porAnio ? "Año" : "Mes" }, ...sel.cols.map((c) => ({ titulo: c.h, tipo: c.tipo as TipoColumna }))],
    filas: periodos.map((p) => [p.etiqueta, ...sel.cols.map((c) => c.get(p))]),
    totales: ["Total", ...sel.cols.map((c) => c.get(t))],
    nota: "Margen = utilidad / ventas. ROI = utilidad / costo de lo vendido. Los porcentajes del total salen de los totales, no de sumar meses.",
  }));

  return (
    <>
      <PageHeader
        title="Reportes"
        breadcrumbs={[{ label: "Inteligencia" }, { label: "Reportes" }]}
        actions={<BotonDescargar empresa={empresa} />}
      />

      {/* El reporte y el período, juntos: es lo único que se elige. */}
      <div className="mb-4 space-y-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div role="tablist" aria-label="Reporte" className="sumi-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {REPORTES.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={sel.id === r.id} onClick={() => setSel(r.id)}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition ${
                sel.id === r.id ? "bg-brand-strong text-white" : "border border-border text-muted hover:text-text"}`}>
              {r.title}
            </button>
          ))}
        </div>
        <div className="border-t border-border pt-3">
          <SelectorRango valor={rango} onCambio={setRango} agrupaciones={AGRUPACIONES_HISTORICO} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sel.cifras(t, periodos, tasa).map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} bs={c.bs ?? undefined} sub={c.sub} accent={c.accent} />
        ))}
      </div>

      <SectionCard
        title={sel.title}
        action={<StatusBadge tone="brand">{periodos.length} {porAnio ? "año(s)" : "mes(es)"} · USD</StatusBadge>}
      >
        <SeriesChart
          labels={periodos.map((p) => p.etiqueta)}
          formato={sel.pct ? pct : (v) => fmtUsd(v)}
          height={240}
          series={sel.series.map((s) => ({ name: s.name, color: s.color, values: periodos.map(s.get) }))}
        />

        <div className="sumi-scroll mt-5 max-w-full overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th scope="col" className="pb-2.5 pr-3 text-left font-medium">{porAnio ? "Año" : "Mes"}</th>
                {sel.cols.map((c) => <th key={c.h} scope="col" className="pb-2.5 pl-3 text-right font-medium">{c.h}</th>)}
              </tr>
            </thead>
            <tbody>
              {periodos.length === 0 && (
                <tr><td colSpan={sel.cols.length + 1} className="py-8 text-center text-muted">Sin datos en este período.</td></tr>
              )}
              {periodos.map((p) => (
                <tr key={p.clave} className="border-t border-border/60 hover:bg-surface-2/60">
                  <td className="py-2.5 pr-3 font-medium text-text">{p.etiqueta}</td>
                  {sel.cols.map((c) => {
                    const v = c.get(p);
                    return (
                      <td key={c.h} className={`py-2.5 pl-3 text-right tabular-nums ${
                        c.h === "Diferencia" && v < 0 ? "text-danger" : c.tipo === "pct" ? "text-muted" : "text-text"}`}>
                        {fmt(c, v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {periodos.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border-strong font-semibold text-text">
                  <td className="pt-3 pr-3">Total</td>
                  {sel.cols.map((c) => <td key={c.h} className="pt-3 pl-3 text-right tabular-nums">{fmt(c, c.get(t))}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      <p className="mt-3 text-xs text-muted">
        Del histórico de Valery, que llega hasta {hasta}. Margen = utilidad / ventas · ROI = utilidad / costo de lo vendido.
      </p>
    </>
  );
}
