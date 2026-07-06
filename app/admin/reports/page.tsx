"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { months, series } from "@/lib/ux/dashboard-data";
import { fmtUsd } from "@/lib/ux/format";
import { downloadCsv } from "@/lib/ux/export-csv";

type Col = { h: string; get: (i: number) => number };
type Reporte = { id: string; title: string; desc: string; cols: Col[] };

const REPORTES: Reporte[] = [
  { id: "ventas", title: "Ventas mensuales", desc: "Ingresos por mes (USD).", cols: [{ h: "Ventas", get: (i) => series.ventas[i] }] },
  { id: "utilidad", title: "Utilidad", desc: "Utilidad neta por mes.", cols: [{ h: "Ventas", get: (i) => series.ventas[i] }, { h: "Utilidad", get: (i) => series.utilidad[i] }] },
  { id: "vc", title: "Ventas vs compras", desc: "Comparativo mensual.", cols: [{ h: "Ventas", get: (i) => series.ventas[i] }, { h: "Compras", get: (i) => series.compras[i] }] },
  { id: "fne", title: "Facturas vs notas de entrega", desc: "Documentos emitidos por mes.", cols: [{ h: "Facturas", get: (i) => series.factura[i] }, { h: "Notas de entrega", get: (i) => series.notasEntrega[i] }] },
  { id: "cc", title: "Crédito vs contado", desc: "Composición de cobros (proxy NE=crédito).", cols: [{ h: "Contado", get: (i) => series.factura[i] }, { h: "Crédito", get: (i) => series.notasEntrega[i] }] },
];

export default function ReportsPage() {
  const [sel, setSel] = useState<Reporte>(REPORTES[0]);

  const totales = sel.cols.map((c) => months.reduce((a, _, i) => a + c.get(i), 0));

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Selecciona un reporte para ver la tabla con cifras reales 2024 y descárgalo en CSV."
        breadcrumbs={[{ label: "Inteligencia" }, { label: "Reportes" }]}
        actions={<Button variant="secondary" icon="report" onClick={() => downloadCsv(sel.title, [["Mes", ...sel.cols.map((c) => c.h)], ...months.map((m, i) => [m, ...sel.cols.map((c) => c.get(i))]), ["Total", ...totales]])}>Exportar CSV</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.8fr]">
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
                {months.map((m, i) => (
                  <tr key={m} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 text-text">{m}</td>
                    {sel.cols.map((c) => <td key={c.h} className="py-2.5 pr-3 text-right text-text">{fmtUsd(c.get(i))}</td>)}
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
