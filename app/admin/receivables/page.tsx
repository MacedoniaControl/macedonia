"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarCuentas, abonar, type Cuenta as CuentaDb } from "@/lib/finanzas/cuentas-db";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";
import { downloadCsv } from "@/lib/ux/export-csv";

type Cuenta = { id: number; cliente: string; doc: string; monto: number; abonado: number; venc: string };



function estadoDe(saldo: number, dias: number): { label: string; tone: Tone } {
  if (saldo <= 0) return { label: "Pagado", tone: "ok" };
  if (dias < 0) return { label: `Vencido (${-dias}d)`, tone: "danger" };
  if (dias <= 8) return { label: `Por vencer (${dias}d)`, tone: "warn" };
  return { label: "Al día", tone: "info" };
}

const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

export default function ReceivablesPage() {
  const empresaKey = useEmpresaActiva();
  // Las cuentas viven en la base y el saldo lo calcula la vista sumando abonos.
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarCuentas(empresaKey, "cobrar"));
  const cuentas: CuentaDb[] = carga.datos ?? [];
  const [docSel, setDocSel] = useState("");
  const [abono, setAbono] = useState(0);
  const [msg, setMsg] = useState("");

  async function registrarAbono() {
    setMsg("");
    const a = Number(abono);
    const c = cuentas.find((x) => x.documento === docSel);
    if (!c) return setMsg("ERR:Selecciona un documento.");
    if (!a || a <= 0) return setMsg("ERR:Ingresa un abono mayor a 0.");

    // La base vuelve a comprobar que el abono no supere el saldo: dos personas
    // abonando a la vez podrian pasarse si solo se validara aqui.
    const r = await abonar(c.id, a);
    if (!r.ok) return setMsg(`ERR:${r.error}`);

    setRecarga((n) => n + 1);
    setMsg(`Abono de ${fmtUsd(a)} aplicado a ${docSel}.`);
    setAbono(0);
  }

    // saldo y dias los calcula la BASE. La version anterior usaba una fecha de
  // "hoy" escrita a mano (23/06/2026) que quedo congelada: una cuenta vencida
  // hace dos meses se mostraba al dia.
  const conSaldo = cuentas;
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
        actions={<Button variant="secondary" icon="report" onClick={() => downloadCsv("cuentas-por-cobrar", [["Cliente", "Documento", "Monto", "Abonado", "Saldo", "Vence"], ...conSaldo.map((c) => [c.contraparte, c.documento, c.monto, c.abonado, c.saldo, c.vence])])}>Exportar CSV</Button>}
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
                  <option key={c.documento} value={c.documento}>{c.documento} · {c.contraparte} · saldo {fmtUsd(c.saldo)}</option>
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
                      <td className="py-2.5 pr-3 text-text">{c.contraparte}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">{c.documento}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(c.monto)}</td>
                      <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(c.saldo)}</td>
                      <td className="py-2.5 pr-3 text-muted">{c.vence}</td>
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
