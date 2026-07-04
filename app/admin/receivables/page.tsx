"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";

type Cuenta = { id: number; cliente: string; doc: string; monto: number; abonado: number; venc: string };

const HOY = new Date("2026-06-23");

const SEED: Cuenta[] = [
  { id: 1, cliente: "Taller Lago C.A.", doc: "NE-2026-000101", monto: 1200, abonado: 0, venc: "2026-06-10" },
  { id: 2, cliente: "Metalúrgica T.", doc: "NE-2026-000098", monto: 3400, abonado: 1000, venc: "2026-06-30" },
  { id: 3, cliente: "Tigasco Gas", doc: "FAC-000259", monto: 860, abonado: 0, venc: "2026-07-15" },
  { id: 4, cliente: "Náutica RS", doc: "NE-2026-000110", monto: 540, abonado: 200, venc: "2026-06-18" },
];

function diasVenc(venc: string): number {
  return Math.round((new Date(venc).getTime() - HOY.getTime()) / 86400000);
}
function estadoDe(saldo: number, dias: number): { label: string; tone: Tone } {
  if (saldo <= 0) return { label: "Pagado", tone: "ok" };
  if (dias < 0) return { label: `Vencido (${-dias}d)`, tone: "danger" };
  if (dias <= 8) return { label: `Por vencer (${dias}d)`, tone: "warn" };
  return { label: "Al día", tone: "info" };
}

const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function ReceivablesPage() {
  const [cuentas, setCuentas] = usePersistedState<Cuenta[]>("cxc:cuentas", SEED);
  const [docSel, setDocSel] = useState(SEED[0].doc);
  const [abono, setAbono] = useState(0);
  const [msg, setMsg] = useState("");

  function registrarAbono() {
    setMsg("");
    const a = Number(abono);
    if (!a || a <= 0) return setMsg("ERR:Ingresa un abono mayor a 0.");
    const c = cuentas.find((x) => x.doc === docSel)!;
    const saldo = c.monto - c.abonado;
    if (a > saldo) return setMsg(`ERR:El abono supera el saldo (${fmtUsd(saldo)}).`);
    setCuentas((prev) => prev.map((x) => (x.doc === docSel ? { ...x, abonado: x.abonado + a } : x)));
    setMsg(`Abono de ${fmtUsd(a)} aplicado a ${docSel}.`);
    setAbono(0);
  }

  const conSaldo = cuentas.map((c) => ({ ...c, saldo: c.monto - c.abonado, dias: diasVenc(c.venc) }));
  const totalSaldo = conSaldo.reduce((a, c) => a + c.saldo, 0);
  const vencido = conSaldo.filter((c) => c.saldo > 0 && c.dias < 0).reduce((a, c) => a + c.saldo, 0);
  const porVencer = conSaldo.filter((c) => c.saldo > 0 && c.dias >= 0 && c.dias <= 8).reduce((a, c) => a + c.saldo, 0);
  const nVencidas = conSaldo.filter((c) => c.saldo > 0 && c.dias < 0).length;

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Saldos por cliente, vencimientos, abonos parciales y alertas. Demo funcional."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Cuentas por cobrar" }]}
        actions={<Button variant="secondary" icon="report">Exportar</Button>}
      />

      <SectionCard title="Resumen de cartera">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total por cobrar" value={fmtUsd(totalSaldo)} accent />
          <StatCard label="Vencido" value={fmtUsd(vencido)} />
          <StatCard label="Por vencer (≤8d)" value={fmtUsd(porVencer)} />
          <StatCard label="Cuentas vencidas" value={String(nVencidas)} />
        </div>
      </SectionCard>

      {nVencidas > 0 && (
        <div className="mt-4">
          <AlertCard tone="danger" titulo="Cartera vencida"
            mensaje={`${nVencidas} cuenta(s) vencida(s) por ${fmtUsd(vencido)}. Venta a cliente moroso requiere aprobación (§23).`} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <SectionCard title="Registrar abono">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="doc">Documento</label>
              <select id="doc" className={inputClass} value={docSel} onChange={(e) => setDocSel(e.target.value)}>
                {conSaldo.filter((c) => c.saldo > 0).map((c) => (
                  <option key={c.doc} value={c.doc}>{c.doc} · {c.cliente} · saldo {fmtUsd(c.saldo)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="ab">Abono (USD)</label>
              <input id="ab" type="number" min={0} value={abono} onChange={(e) => setAbono(Number(e.target.value))} className={inputClass} />
            </div>
            {msg && (
              <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
                {msg.replace("ERR:", "")}
              </p>
            )}
            <Button icon="cash" onClick={registrarAbono} className="w-full">Registrar abono</Button>
          </div>
        </SectionCard>

        <SectionCard title="Cartera" description="Saldos y vencimientos por documento.">
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Cliente</th>
                  <th className="py-2.5 pr-3 font-medium">Documento</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Monto</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Saldo</th>
                  <th className="py-2.5 pr-3 font-medium">Vence</th>
                  <th className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conSaldo.map((c) => {
                  const e = estadoDe(c.saldo, c.dias);
                  return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="py-2.5 pr-3 text-text">{c.cliente}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">{c.doc}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(c.monto)}</td>
                      <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(c.saldo)}</td>
                      <td className="py-2.5 pr-3 text-muted">{c.venc}</td>
                      <td className="py-2.5"><StatusBadge tone={e.tone}>{e.label}</StatusBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side (hoy = 2026-06-23). Reglas en §23 del planning / `docs/decisions`.</p>
    </>
  );
}
