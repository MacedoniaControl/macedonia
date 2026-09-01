"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { RANGO_POR_DEFECTO, type Rango } from "@/lib/ux/rango";
import { SubirArchivo } from "@/components/ui/SubirArchivo";
import { SectionCard } from "@/components/ui/SectionCard";
import { historicoEnRango, totalesDe, AGRUPACIONES_HISTORICO } from "@/lib/ux/historico-rango";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { fmtUsd } from "@/lib/ux/format";

export default function MatricesPage() {
  const empresa = useEmpresaActiva();
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO);
  // Sale del historico con mes y año, no de los doce meses sueltos de 2024:
  // con aquellos el selector de rango no podia significar nada.
  const periodos = historicoEnRango(empresa, rango);
  const rows = periodos.map((p) => ({
    m: p.etiqueta, ventas: p.venta, compras: p.compra,
    costo: p.costo, utilidad: p.util, roi: p.roi,
  }));
  const t = totalesDe(periodos);
  const tot = { ventas: t.venta, compras: t.compra, costo: t.costo, utilidad: t.util };
  const totRoi = Math.round((tot.utilidad / tot.costo) * 100);

  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Matrices administrativas"
        description=""
        breadcrumbs={[{ label: "Inteligencia" }, { label: "Matrices administrativas" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {aviso && <span className="text-xs text-muted">{aviso}</span>}
            <SubirArchivo
              etiqueta="Crear Matriz" acepta=".xls,.xlsx"
              onArchivos={(fs) => {
                if (!fs?.length) return;
                // Todavia no se procesa: el parseo de la matriz va en su propia
                // tanda. Se avisa en vez de fingir que se cargo.
                setAviso(`${fs.length} archivo(s) recibido(s) · lectura pendiente`);
              }}
            />
          </div>
        }
      />
      <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
        <SelectorRango valor={rango} onCambio={setRango} agrupaciones={AGRUPACIONES_HISTORICO} />
      </div>

      <SectionCard title="Matriz ROI (USD)" description={`${periodos.length} período(s) · ${rango.desde} a ${rango.hasta}`}>
        <div className="sumi-scroll max-w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="py-2.5 pr-3 font-medium">Mes</th>
                <th className="py-2.5 pr-3 text-right font-medium">Ventas</th>
                <th className="py-2.5 pr-3 text-right font-medium">Compras</th>
                <th className="py-2.5 pr-3 text-right font-medium">Costo</th>
                <th className="py-2.5 pr-3 text-right font-medium">Utilidad</th>
                <th className="py-2.5 text-right font-medium">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.m} className="hover:bg-surface-2">
                  <td className="py-2.5 pr-3 text-text">{r.m}</td>
                  <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(r.ventas)}</td>
                  <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(r.compras)}</td>
                  <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(r.costo)}</td>
                  <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(r.utilidad)}</td>
                  <td className="py-2.5 text-right font-medium text-ok">{r.roi}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2.5 pr-3 text-text">Total</td>
                <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(tot.ventas)}</td>
                <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(tot.compras)}</td>
                <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(tot.costo)}</td>
                <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(tot.utilidad)}</td>
                <td className="py-2.5 text-right text-ok">{totRoi}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
