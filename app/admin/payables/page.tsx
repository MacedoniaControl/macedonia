"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";
import { downloadCsv } from "@/lib/ux/export-csv";

type Cta = { id: number; proveedor: string; doc: string; monto: number; abonado: number; venc: string };
const HOY = new Date("2026-06-23");
const SEED: Cta[] = [
  { id: 1, proveedor: "Linconl Import C.A.", doc: "OC-2026-000012", monto: 4800, abonado: 1500, venc: "2026-06-20" },
  { id: 2, proveedor: "Gases del Oriente", doc: "OC-2026-000015", monto: 2300, abonado: 0, venc: "2026-06-28" },
  { id: 3, proveedor: "Hoffman Supply", doc: "OC-2026-000016", monto: 1250, abonado: 0, venc: "2026-07-10" },
];
const dias = (v: string) => Math.round((new Date(v).getTime() - HOY.getTime()) / 86400000);
const estadoDe = (saldo: number, d: number): { label: string; tone: Tone } =>
  saldo <= 0 ? { label: "Pagada", tone: "ok" }
  : d < 0 ? { label: `Vencida (${-d}d)`, tone: "danger" }
  : d <= 7 ? { label: `Alerta (${d}d)`, tone: "warn" }
  : { label: "Al día", tone: "info" };
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

export default function PayablesPage() {
  const empresaKey = useEmpresaActiva();
  const [ctas, setCtas] = usePersistedState<Cta[]>(`cxp:cuentas:${empresaKey}`, SEED);
  const [docSel, setDocSel] = useState(SEED[0].doc);
  const [abono, setAbono] = useState(0);
  const [msg, setMsg] = useState("");

  function registrarAbono() {
    setMsg("");
    const a = Number(abono);
    const c = ctas.find((x) => x.doc === docSel)!;
    const saldo = c.monto - c.abonado;
    if (!a || a <= 0) return setMsg("ERR:Ingresa un abono mayor a 0.");
    if (a > saldo) return setMsg(`ERR:El abono supera el saldo (${fmtUsd(saldo)}).`);
    setCtas((prev) => prev.map((x) => (x.doc === docSel ? { ...x, abonado: x.abonado + a } : x)));
    setMsg(`Abono de ${fmtUsd(a)} aplicado a ${docSel}.`);
    setAbono(0);
  }

  const conSaldo = ctas.map((c) => ({ ...c, saldo: c.monto - c.abonado, d: dias(c.venc) }));
  const total = conSaldo.reduce((a, c) => a + c.saldo, 0);
  const vencido = conSaldo.filter((c) => c.saldo > 0 && c.d < 0).reduce((a, c) => a + c.saldo, 0);
  const alerta = conSaldo.filter((c) => c.saldo > 0 && c.d >= 0 && c.d <= 7).reduce((a, c) => a + c.saldo, 0);
  const nVenc = conSaldo.filter((c) => c.saldo > 0 && c.d < 0).length;

  return (
    <>
      <PageHeader
        title="Cuentas por pagar"
        description="Saldos por proveedor, abonos y alertas desde 7 días. Visible para owner/admin (§24)."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Cuentas por pagar" }]}
        actions={<Button variant="secondary" icon="report" onClick={() => downloadCsv("cuentas-por-pagar", [["Proveedor", "Documento", "Monto", "Abonado", "Saldo", "Vence"], ...conSaldo.map((c) => [c.proveedor, c.doc, c.monto, c.abonado, c.saldo, c.venc])])}>Exportar CSV</Button>}
      />
      <SectionCard title="Resumen">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total por pagar" value={fmtUsd(total)} accent />
          <StatCard label="Vencido" value={fmtUsd(vencido)} />
          <StatCard label="Alerta (≤7d)" value={fmtUsd(alerta)} />
          <StatCard label="Cuentas vencidas" value={String(nVenc)} />
        </div>
      </SectionCard>
      {nVenc > 0 && (
        <div className="mt-4">
          <AlertCard tone="danger" titulo="Pagos vencidos" mensaje={`${nVenc} cuenta(s) vencida(s) por ${fmtUsd(vencido)}.`} />
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <SectionCard title="Registrar abono">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="doc">Compra / documento</label>
              <select id="doc" className={inputClass} value={docSel} onChange={(e) => setDocSel(e.target.value)}>
                {conSaldo.filter((c) => c.saldo > 0).map((c) => (
                  <option key={c.doc} value={c.doc}>{c.doc} · {c.proveedor} · saldo {fmtUsd(c.saldo)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="ab">Abono (USD)</label>
              <input id="ab" type="number" min={0} value={abono} onChange={(e) => setAbono(Number(e.target.value))} className={inputClass} />
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="cash" onClick={registrarAbono} className="w-full">Registrar abono</Button>
          </div>
        </SectionCard>
        <SectionCard title="Cuentas" description="Generadas automáticamente al recibir compras.">
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Proveedor</th>
                  <th className="py-2.5 pr-3 font-medium">Documento</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Monto</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Saldo</th>
                  <th className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conSaldo.map((c) => {
                  const e = estadoDe(c.saldo, c.d);
                  return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="py-2.5 pr-3 text-text">{c.proveedor}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">{c.doc}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(c.monto)}</td>
                      <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(c.saldo)}</td>
                      <td className="py-2.5"><StatusBadge tone={e.tone}>{e.label}</StatusBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Reglas §24 del planning.</p>
    </>
  );
}
