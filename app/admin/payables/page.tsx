"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarCuentas, abonar, type Cuenta as CuentaDb } from "@/lib/finanzas/cuentas-db";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { FormularioCuenta } from "@/components/finanzas/FormularioCuenta";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";
import { downloadCsv } from "@/lib/ux/export-csv";

type Cta = { id: number; proveedor: string; doc: string; monto: number; abonado: number; venc: string };
const estadoDe = (saldo: number, d: number): { label: string; tone: Tone } =>
  saldo <= 0 ? { label: "Pagada", tone: "ok" }
  : d < 0 ? { label: `Vencida (${-d}d)`, tone: "danger" }
  : d <= 7 ? { label: `Alerta (${d}d)`, tone: "warn" }
  : { label: "Al día", tone: "info" };
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

export default function PayablesPage() {
  const empresaKey = useEmpresaActiva();
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarCuentas(empresaKey, "pagar"));
  const ctas: CuentaDb[] = carga.datos ?? [];
  const [docSel, setDocSel] = useState("");
  const [abono, setAbono] = useState(0);
  const [msg, setMsg] = useState("");

  async function registrarAbono(): Promise<boolean> {
    setMsg("");
    const a = Number(abono);
    const c = ctas.find((x) => x.documento === docSel);
    if (!c) { setMsg("ERR:Selecciona un documento."); return false; }
    if (!a || a <= 0) { setMsg("ERR:Ingresa un abono mayor a 0."); return false; }

    // La base vuelve a comprobar que el abono no supere el saldo: dos personas
    // abonando a la vez podrian pasarse si solo se validara aqui.
    const r = await abonar(c.id, a);
    if (!r.ok) { setMsg(`ERR:${r.error}`); return false; }

    setRecarga((n) => n + 1);
    setMsg(`Abono de ${fmtUsd(a)} aplicado a ${docSel}.`);
    setAbono(0);
    return true;
  }

    // saldo y dias los calcula la BASE, contra la fecha de hoy real.
  const conSaldo = ctas.map((c) => ({ ...c, d: c.dias }));

  // Funcion que devuelve JSX, no componente: un componente definido adentro de
  // otro es un tipo nuevo en cada render, React lo remonta y el input pierde
  // el foco a cada tecla.
  const panelAbono = (cerrar: () => void) => (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">Registrar abono</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Documento</span>
        <select className={inputClass} value={docSel} onChange={(e) => setDocSel(e.target.value)}>
          <option value="">Elegí un documento…</option>
          {conSaldo.filter((c) => c.saldo > 0).map((c) => (
            <option key={c.documento} value={c.documento}>
              {c.documento} · {c.contraparte} · saldo {fmtUsd(c.saldo)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Abono (USD)</span>
        <input type="number" min={0} value={abono}
          onChange={(e) => setAbono(Number(e.target.value))} className={`${inputClass} tabular-nums`} />
      </label>
      {msg && (
        <p role="alert" className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
          {msg.replace("ERR:", "")}
        </p>
      )}
      <div className="flex gap-2">
        <Button icon="cash" className="flex-1"
          onClick={async () => { if (await registrarAbono()) cerrar(); }}>Registrar abono</Button>
        <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
      </div>
    </div>
  );
  const total = conSaldo.reduce((a, c) => a + c.saldo, 0);
  const vencido = conSaldo.filter((c) => c.saldo > 0 && c.d < 0).reduce((a, c) => a + c.saldo, 0);
  const alerta = conSaldo.filter((c) => c.saldo > 0 && c.d >= 0 && c.d <= 7).reduce((a, c) => a + c.saldo, 0);
  const nVenc = conSaldo.filter((c) => c.saldo > 0 && c.d < 0).length;

  return (
    <>
      <PageHeader
        title="Cuentas por pagar"
        description=""
        breadcrumbs={[{ label: "Finanzas" }, { label: "Cuentas por pagar" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PildoraPanel etiqueta="Nueva cuenta" icono="plus">
              {(cerrar) => (
                <FormularioCuenta tipo="pagar" empresa={empresaKey}
                  onCreada={() => setRecarga((n) => n + 1)} onCerrar={cerrar} />
              )}
            </PildoraPanel>
            <PildoraPanel etiqueta="Registrar abono" icono="cash">
              {(cerrar) => panelAbono(cerrar)}
            </PildoraPanel>
            <Button variant="secondary" icon="report" onClick={() => downloadCsv("cuentas-por-pagar", [["Proveedor", "Documento", "Monto", "Abonado", "Saldo", "Vence"], ...conSaldo.map((c) => [c.contraparte, c.documento, c.monto, c.abonado, c.saldo, c.vence])])}>Exportar CSV</Button>
          </div>
        }
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
      <div className="mt-6">
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
                      <td className="py-2.5 pr-3 text-text">{c.contraparte}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">{c.documento}</td>
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
    </>
  );
}
