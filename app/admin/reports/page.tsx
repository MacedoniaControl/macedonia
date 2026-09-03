"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { RANGO_HISTORICO, type Rango } from "@/lib/ux/rango";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { historicoEnRango, totalesDe, AGRUPACIONES_HISTORICO, type Periodo } from "@/lib/ux/historico-rango";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { printDoc } from "@/lib/ux/doc-templates";
import { fmtUsd } from "@/lib/ux/format";

type Col = { h: string; get: (p: Periodo) => number };
type Reporte = { id: string; title: string; desc: string; cols: Col[] };

const REPORTES: Reporte[] = [
  { id: "ventas",   title: "Ventas",            desc: "Ingresos del período (USD).",
    cols: [{ h: "Ventas", get: (p) => p.venta }] },
  { id: "utilidad", title: "Utilidad",          desc: "Venta, costo y lo que quedó.",
    cols: [{ h: "Ventas", get: (p) => p.venta }, { h: "Costo", get: (p) => p.costo }, { h: "Utilidad", get: (p) => p.util }] },
  { id: "vc",       title: "Ventas vs compras", desc: "Comparativo del período.",
    cols: [{ h: "Ventas", get: (p) => p.venta }, { h: "Compras", get: (p) => p.compra }] },
  { id: "roi",      title: "Rentabilidad",      desc: "Margen sobre venta y retorno sobre compra.",
    cols: [{ h: "Utilidad", get: (p) => p.util }, { h: "Margen %", get: (p) => p.margen }, { h: "ROI %", get: (p) => p.roi }] },
];

export default function ReportsPage() {
  const empresa = useEmpresaActiva();
  const [rango, setRango] = useState<Rango>(RANGO_HISTORICO);
  const [sel, setSel] = useState<Reporte>(REPORTES[0]);

  const periodos = historicoEnRango(empresa, rango);
  const tot = totalesDe(periodos);
  const totales = sel.cols.map((c) => periodos.reduce((a, p) => a + c.get(p), 0));

  // PDF por impresión del navegador: sin librería, y sale igual en toda máquina.
  function descargarPdf() {
    const filas = periodos
      .map((p) => `<tr><td>${p.etiqueta}</td>${sel.cols.map((c) => `<td style="text-align:right">${c.get(p).toLocaleString("es-VE")}</td>`).join("")}</tr>`)
      .join("");
    printDoc(`
      <h1 style="font:600 18px system-ui;margin:0 0 4px">${sel.title}</h1>
      <p style="font:12px system-ui;color:#555;margin:0 0 16px">
        ${empresa} · ${rango.desde} a ${rango.hasta} · por ${rango.agrupacion === "anio" ? "año" : "mes"}
      </p>
      <table style="width:100%;border-collapse:collapse;font:12px system-ui">
        <thead><tr style="border-bottom:2px solid #333">
          <th style="text-align:left;padding:6px 4px">Período</th>
          ${sel.cols.map((c) => `<th style="text-align:right;padding:6px 4px">${c.h}</th>`).join("")}
        </tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr style="border-top:2px solid #333;font-weight:600">
          <td style="padding:6px 4px">Total</td>
          ${totales.map((t) => `<td style="text-align:right;padding:6px 4px">${t.toLocaleString("es-VE")}</td>`).join("")}
        </tr></tfoot>
      </table>`);
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        breadcrumbs={[{ label: "Inteligencia" }, { label: "Reportes" }]}
        actions={<Button variant="secondary" icon="report" onClick={descargarPdf}>Descargar PDF</Button>}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.8fr]">
        <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
        <SelectorRango valor={rango} onCambio={setRango} agrupaciones={AGRUPACIONES_HISTORICO} />
      </div>

      <SectionCard title="Reportes disponibles">
          <ul className="space-y-2">
            {REPORTES.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSel(r)}
                  className={`w-full rounded-xl border p-3 text-left transition ${sel.id === r.id ? "border-brand bg-brand-soft" : "border-border bg-surface-2 hover:border-brand/40"}`}
                >
                  <span className={`block text-sm font-medium ${sel.id === r.id ? "text-brand" : "text-text"}`}>{r.title}</span>
                  <span className="block text-xs text-muted">{r.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={sel.title} description={sel.desc} action={<StatusBadge tone="brand">2024 · USD</StatusBadge>}>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Mes</th>
                  {sel.cols.map((c) => <th key={c.h} className="py-2.5 pr-3 text-right font-medium">{c.h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periodos.length === 0 && (
                  <tr><td colSpan={sel.cols.length + 1} className="py-8 text-center text-muted">
                    Sin datos en este período.
                  </td></tr>
                )}
                {periodos.map((p) => (
                  <tr key={p.clave} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 text-text">{p.etiqueta}</td>
                    {sel.cols.map((c) => <td key={c.h} className="py-2.5 pr-3 text-right text-text">{fmtUsd(c.get(p))}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2.5 pr-3 text-text">Total</td>
                  {totales.map((t, i) => <td key={i} className="py-2.5 pr-3 text-right text-text">{fmtUsd(t)}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Cifras reales 2024 de Sumigases (matrices Excel; ver `docs/data/dashboard-mock-2024.md`).</p>
    </>
  );
}
