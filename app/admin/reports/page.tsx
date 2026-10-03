"use client";

// Reportes del histórico de Valery: ventas, utilidad, ventas contra compras y
// rentabilidad, por el período que se elija.
//
// Antes la pantalla tenía la tabla apretada debajo del selector de fechas, una
// etiqueta «2024 · USD» fija aunque los datos fueran de 2025-2026, y el total
// de Rentabilidad SUMABA porcentajes (y los escribía con $). Ahora:
//   · arriba, el reporte y el período en una sola barra;
//   · cuatro cifras del período, con lo facturado en bolívares (cada venta a la
//     tasa de su día, no a la de hoy);
//   · el gráfico del reporte y la tabla a todo el ancho;
//   · margen y ROI del total se calculan de los totales, no sumando meses;
//   · «Descargar» es el mismo de toda la app (Excel y PDF).

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GraficoBI, Grupo, type PuntoGrafico } from "@/components/ui/GraficoBI";
import { abreviar, type MonedaBI } from "@/lib/ux/historico-bi";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { RANGO_HISTORICO, type Rango } from "@/lib/ux/rango";
import { historicoEnRango, totalesDe, AGRUPACIONES_HISTORICO, type Periodo } from "@/lib/ux/historico-rango";
import { HISTORY, type EmpresaHist } from "@/lib/ux/history-data";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { fmtBsCorto, fmtUsd } from "@/lib/ux/format";
import type { TipoColumna } from "@/lib/ux/tabla-export";

type Totales = ReturnType<typeof totalesDe>;
// `get` recibe la moneda: los montos en dólares o en los bolívares FACTURADOS
// (cada venta a la tasa de su día); los porcentajes no cambian.
type Col = { h: string; get: (p: Periodo | Totales, m: MonedaBI) => number; tipo: "usd" | "pct" };
type Cifra = { label: string; value: string; bs?: string | null; sub?: string; accent?: boolean };
type Reporte = {
  id: string;
  title: string;
  cols: Col[];
  /** Lo que se dibuja: una barra por serie en cada período. */
  series: { name: string; color: string; get: (p: Periodo, m: MonedaBI) => number }[];
  pct?: boolean;
  cifras: (t: Totales, ps: Periodo[]) => Cifra[];
};

type Campo = "venta" | "costo" | "util" | "compra";
const din = (p: Periodo | Totales, c: Campo, m: MonedaBI) => (m === "bs" ? p[`${c}Bs`] : p[c]);
const pct = (n: number) => `${n.toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const veces = (a: number, b: number) => (b > 0 ? `${(a / b).toLocaleString("es-VE", { maximumFractionDigits: 2 })}x` : "—");
const mejor = (ps: Periodo[], get: (p: Periodo) => number) =>
  ps.reduce<Periodo | null>((m, p) => (!m || get(p) > get(m) ? p : m), null);

const REPORTES: Reporte[] = [
  {
    id: "ventas", title: "Ventas",
    cols: [{ h: "Ventas", get: (p, m) => din(p, "venta", m), tipo: "usd" }],
    series: [{ name: "Ventas", color: "var(--color-brand)", get: (p, m) => din(p, "venta", m) }],
    cifras: (t, ps) => {
      const m = mejor(ps, (p) => p.venta);
      const prom = ps.length ? t.venta / ps.length : 0;
      return [
        { label: "Ventas", value: fmtUsd(t.venta), bs: fmtBsCorto(t.ventaBs), sub: `${ps.length} período(s)`, accent: true },
        { label: "Promedio", value: fmtUsd(prom), bs: fmtBsCorto(ps.length ? t.ventaBs / ps.length : 0), sub: "por período" },
        { label: "Mejor Período", value: m ? fmtUsd(m.venta) : "—", sub: m?.etiqueta },
        { label: "Utilidad", value: fmtUsd(t.util), bs: fmtBsCorto(t.utilBs), sub: `margen ${pct(t.margen)}` },
      ];
    },
  },
  {
    id: "utilidad", title: "Utilidad",
    cols: [
      { h: "Ventas", get: (p, m) => din(p, "venta", m), tipo: "usd" },
      { h: "Costo", get: (p, m) => din(p, "costo", m), tipo: "usd" },
      { h: "Utilidad", get: (p, m) => din(p, "util", m), tipo: "usd" },
      { h: "Margen", get: (p) => p.margen, tipo: "pct" },
    ],
    series: [
      { name: "Ventas", color: "var(--color-brand)", get: (p, m) => din(p, "venta", m) },
      { name: "Costo", color: "var(--color-muted)", get: (p, m) => din(p, "costo", m) },
      { name: "Utilidad", color: "var(--color-ok)", get: (p, m) => din(p, "util", m) },
    ],
    cifras: (t) => [
      { label: "Utilidad", value: fmtUsd(t.util), bs: fmtBsCorto(t.utilBs), sub: "ventas menos costo", accent: true },
      { label: "Ventas", value: fmtUsd(t.venta), bs: fmtBsCorto(t.ventaBs) },
      { label: "Costo", value: fmtUsd(t.costo), bs: fmtBsCorto(t.costoBs), sub: "de lo vendido" },
      { label: "Margen", value: pct(t.margen), sub: "utilidad sobre ventas" },
    ],
  },
  {
    id: "vc", title: "Ventas vs Compras",
    cols: [
      { h: "Ventas", get: (p, m) => din(p, "venta", m), tipo: "usd" },
      { h: "Compras", get: (p, m) => din(p, "compra", m), tipo: "usd" },
      { h: "Diferencia", get: (p, m) => din(p, "venta", m) - din(p, "compra", m), tipo: "usd" },
    ],
    series: [
      { name: "Ventas", color: "var(--color-brand)", get: (p, m) => din(p, "venta", m) },
      { name: "Compras", color: "var(--color-warn)", get: (p, m) => din(p, "compra", m) },
    ],
    cifras: (t) => [
      { label: "Ventas", value: fmtUsd(t.venta), bs: fmtBsCorto(t.ventaBs), accent: true },
      { label: "Compras", value: fmtUsd(t.compra), bs: fmtBsCorto(t.compraBs) },
      { label: "Diferencia", value: fmtUsd(t.venta - t.compra), bs: fmtBsCorto(t.ventaBs - t.compraBs), sub: "ventas menos compras" },
      { label: "Ventas / Compras", value: veces(t.venta, t.compra), sub: "por cada dólar comprado" },
    ],
  },
  {
    id: "roi", title: "Rentabilidad", pct: true,
    cols: [
      { h: "Utilidad", get: (p, m) => din(p, "util", m), tipo: "usd" },
      { h: "Margen", get: (p) => p.margen, tipo: "pct" },
      { h: "ROI", get: (p) => p.roi, tipo: "pct" },
    ],
    series: [
      { name: "Margen %", color: "var(--color-info)", get: (p) => p.margen },
      { name: "ROI %", color: "var(--color-ok)", get: (p) => p.roi },
    ],
    cifras: (t, ps) => {
      const m = mejor(ps, (p) => p.roi);
      return [
        { label: "ROI", value: pct(t.roi), sub: "utilidad sobre costo", accent: true },
        { label: "Margen", value: pct(t.margen), sub: "utilidad sobre ventas" },
        { label: "Utilidad", value: fmtUsd(t.util), bs: fmtBsCorto(t.utilBs) },
        { label: "Mejor ROI", value: m ? pct(m.roi) : "—", sub: m?.etiqueta },
      ];
    },
  },
];

const monto = (v: number, m: MonedaBI) => (m === "bs" ? `${Math.round(v).toLocaleString("es-VE")} Bs` : fmtUsd(v));
const fmt = (c: Col, v: number, m: MonedaBI) => (c.tipo === "pct" ? pct(v) : monto(v, m));

const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Para el gráfico: «ene 25» en el eje y «enero 2025» en el globo; el año, igual. */
function punto(p: Periodo, porAnio: boolean, incompletos: string[]): PuntoGrafico {
  if (porAnio) return { clave: p.clave, etiqueta: p.clave, etiquetaLarga: p.clave, incompleto: incompletos.some((ym) => ym.startsWith(`${p.clave}-`)) };
  const [y, mm] = p.clave.split("-");
  return { clave: p.clave, etiqueta: p.etiqueta.replace(/ (\d{2})(\d{2})$/, " $2"), etiquetaLarga: `${MES_LARGO[Number(mm) - 1]} ${y}`, incompleto: incompletos.includes(p.clave) };
}

export default function ReportsPage() {
  return <ProveedorExportar><Reportes /></ProveedorExportar>;
}

function Reportes() {
  const empresa = useEmpresaActiva();
  const [rango, setRango] = useState<Rango>(RANGO_HISTORICO);
  const [selId, setSel] = useState(REPORTES[0].id);
  const sel = REPORTES.find((r) => r.id === selId) ?? REPORTES[0];
  // La moneda del gráfico, la tabla y la descarga. Rentabilidad es en %: no aplica.
  const [monedaElegida, setMoneda] = useState<MonedaBI>("usd");
  const moneda: MonedaBI = sel.pct ? "usd" : monedaElegida;

  const periodos = historicoEnRango(empresa, rango);
  const t = totalesDe(periodos);
  const meta = (HISTORY[empresa as EmpresaHist] ?? HISTORY.sumigases).meta;
  const hasta = meta.hasta.split("-").reverse().join("-");
  const porAnio = rango.agrupacion === "anio";
  const puntos = periodos.map((p) => punto(p, porAnio, meta.incompletos.map((m) => m.ym)));
  const enBs = moneda === "bs";
  const desdeVista = rango.desde.split("-").reverse().join("-");
  const hastaVista = rango.hasta.split("-").reverse().join("-");

  useExportable(() => ({
    seccion: `Reporte de ${sel.title}`,
    titulo: `Reporte de ${sel.title}`,
    detalle: [`Del ${desdeVista} al ${hastaVista}`, `Por ${porAnio ? "año" : "mes"}`, `Histórico de Valery, hasta ${hasta}`,
      ...(enBs ? ["Montos en bolívares facturados (cada venta a la tasa de su día)"] : [])],
    columnas: [{ titulo: porAnio ? "Año" : "Mes" }, ...sel.cols.map((c) => ({
      titulo: enBs && c.tipo === "usd" ? `${c.h} (Bs)` : c.h,
      tipo: (enBs && c.tipo === "usd" ? "num" : c.tipo) as TipoColumna,
    }))],
    filas: periodos.map((p) => [p.etiqueta, ...sel.cols.map((c) => Math.round(c.get(p, moneda) * 100) / 100)]),
    totales: ["Total", ...sel.cols.map((c) => Math.round(c.get(t, moneda) * 100) / 100)],
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
        {sel.cifras(t, periodos).map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} bs={c.bs ?? undefined} bsAproximado={false} sub={c.sub} accent={c.accent} />
        ))}
      </div>

      <SectionCard
        title={sel.title}
        action={<StatusBadge tone="brand">{periodos.length} {porAnio ? "año(s)" : "mes(es)"} · {sel.pct ? "%" : enBs ? "Bs" : "USD"}</StatusBadge>}
      >
        {!sel.pct && (
          <div className="mb-3">
            <Grupo etiqueta="Moneda" valor={monedaElegida} onCambio={setMoneda}
              opciones={[{ id: "usd", label: "Dólares" }, { id: "bs", label: "Bolívares facturados" }]} />
          </div>
        )}
        {/* key: al cambiar de reporte, sus series arrancan todas encendidas. */}
        <GraficoBI key={sel.id}
          puntos={puntos}
          series={sel.series.map((s) => ({ key: s.name, nombre: s.name, color: s.color, valores: periodos.map((p) => s.get(p, moneda)) }))}
          formato={sel.pct ? pct : (v) => monto(v, moneda)}
          abreviar={sel.pct ? (v) => `${v.toLocaleString("es-VE")} %` : (v) => abreviar(v, moneda)}
          variacionEn={sel.pct ? "puntos" : "pct"}
          alto={260}
          descripcion={`Reporte de ${sel.title}`}
          pie={(i) => {
            const q = periodos[i];
            return sel.pct
              ? <p className="flex justify-between"><span>Utilidad</span><span className="tabular-nums">{fmtUsd(q.util)}</span></p>
              : <p className="flex justify-between"><span>Margen {pct(q.margen)}</span><span>ROI {pct(q.roi)}</span></p>;
          }}
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
                    const v = c.get(p, moneda);
                    return (
                      <td key={c.h} className={`py-2.5 pl-3 text-right tabular-nums ${
                        c.h === "Diferencia" && v < 0 ? "text-danger" : c.tipo === "pct" ? "text-muted" : "text-text"}`}>
                        {fmt(c, v, moneda)}
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
                  {sel.cols.map((c) => <td key={c.h} className="pt-3 pl-3 text-right tabular-nums">{fmt(c, c.get(t, moneda), moneda)}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      <p className="mt-3 text-xs text-muted">
        Margen = utilidad / ventas · ROI = utilidad / costo de lo vendido.
      </p>
    </>
  );
}
