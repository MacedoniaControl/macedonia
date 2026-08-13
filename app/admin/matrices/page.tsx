import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { months, series } from "@/lib/ux/dashboard-data";
import { fmtUsd } from "@/lib/ux/format";

export default function MatricesPage() {
  const rows = months.map((m, i) => {
    const ventas = series.ventas[i];
    const compras = series.compras[i];
    const utilidad = series.utilidad[i];
    const costo = ventas - utilidad;
    const roi = costo > 0 ? Math.round((utilidad / costo) * 100) : 0;
    return { m, ventas, compras, costo, utilidad, roi };
  });
  const tot = rows.reduce(
    (a, r) => ({
      ventas: a.ventas + r.ventas,
      compras: a.compras + r.compras,
      costo: a.costo + r.costo,
      utilidad: a.utilidad + r.utilidad,
    }),
    { ventas: 0, compras: 0, costo: 0, utilidad: 0 },
  );
  const totRoi = Math.round((tot.utilidad / tot.costo) * 100);

  return (
    <>
      <PageHeader
        title="Matrices administrativas"
        description="Matriz ROI mensual/anual alimentada por las matrices 2024. Mes · Ventas · Compras · Costo · Utilidad · ROI."
        breadcrumbs={[{ label: "Inteligencia" }, { label: "Matrices administrativas" }]}
      />
      <SectionCard title="Matriz ROI 2024 (USD)" description="Cifras reales de Sumigases.">
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
