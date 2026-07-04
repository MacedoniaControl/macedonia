"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";

type Estado = "Verificado" | "Pendiente";
type Pago = { id: number; hora: string; metodo: string; monto: number; cliente: string; ref: string; estado: Estado };

// Cada método: requiere referencia/comprobante? y si se verifica automáticamente (efectivo).
const METODOS = [
  { v: "Efectivo USD", ref: false, auto: true },
  { v: "Efectivo Bs", ref: false, auto: true },
  { v: "Punto de venta", ref: true, auto: false },
  { v: "Transferencia Bs", ref: true, auto: false },
  { v: "Pago móvil", ref: true, auto: false },
  { v: "Zelle", ref: true, auto: false },
  { v: "Binance", ref: true, auto: false },
];
const CLIENTES = ["Taller Lago C.A.", "Metalúrgica T.", "Tigasco Gas", "Náutica RS", "Cliente genérico"];
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function CashPage() {
  const [pagos, setPagos] = usePersistedState<Pago[]>("caja:pagos", []);
  const [metodo, setMetodo] = useState(METODOS[0].v);
  const [monto, setMonto] = useState(0);
  const [cliente, setCliente] = useState(CLIENTES[0]);
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState("");

  const metaMetodo = METODOS.find((m) => m.v === metodo)!;

  function registrar() {
    setMsg("");
    const m = Number(monto);
    if (!m || m <= 0) return setMsg("ERR:Ingresa un monto mayor a 0.");
    if (metaMetodo.ref && !ref.trim()) return setMsg(`ERR:${metodo} requiere referencia/comprobante.`);
    const estado: Estado = metaMetodo.auto ? "Verificado" : "Pendiente";
    setPagos((prev) => [
      {
        id: Date.now(),
        hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
        metodo, monto: m, cliente, ref: ref.trim(), estado,
      },
      ...prev,
    ]);
    setMsg(estado === "Verificado" ? `Pago en ${metodo} verificado automáticamente.` : `Pago en ${metodo} registrado como pendiente por verificar.`);
    setMonto(0);
    setRef("");
  }

  function verificar(id: number) {
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: "Verificado" } : p)));
    setMsg("Pago verificado.");
  }

  const verificado = pagos.filter((p) => p.estado === "Verificado").reduce((a, p) => a + p.monto, 0);
  const pendiente = pagos.filter((p) => p.estado === "Pendiente").reduce((a, p) => a + p.monto, 0);

  return (
    <>
      <PageHeader
        title="Caja y pagos"
        description="Registra pagos y verifícalos. Los pagos no verificados NO cuentan como cobrados (payments-cash.md)."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Caja y pagos" }]}
      />

      <SectionCard title="Flujo de caja" description="Se actualiza con cada pago.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Cobrado verificado" value={fmtUsd(verificado)} accent />
          <StatCard label="Pendiente por verificar" value={fmtUsd(pendiente)} />
          <StatCard label="Total cobros" value={fmtUsd(verificado + pendiente)} />
          <StatCard label="N° de pagos" value={String(pagos.length)} />
        </div>
      </SectionCard>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <SectionCard title="Registrar pago">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="met">Método</label>
              <select id="met" className={inputClass} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS.map((m) => <option key={m.v}>{m.v}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                {metaMetodo.auto ? "Efectivo → se verifica automáticamente." : `Requiere referencia → queda pendiente por verificar.`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="monto">Monto (USD)</label>
                <input id="monto" type="number" min={0} value={monto} onChange={(e) => setMonto(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cli">Cliente</label>
                <select id="cli" className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)}>
                  {CLIENTES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="ref">Referencia / comprobante {metaMetodo.ref ? "(obligatorio)" : "(opcional)"}</label>
              <input id="ref" className={inputClass} value={ref} placeholder="N° de referencia" onChange={(e) => setRef(e.target.value)} />
            </div>
            {msg && (
              <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
                {msg.replace("ERR:", "")}
              </p>
            )}
            <Button icon="cash" onClick={registrar} className="w-full">Registrar pago</Button>
          </div>
        </SectionCard>

        <SectionCard title="Pagos" description="Verifica los pendientes para que cuenten como cobrados.">
          {pagos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Sin pagos registrados. Registra uno a la izquierda.</p>
          ) : (
            <ul className="space-y-2">
              {pagos.map((p) => (
                <li key={p.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">{fmtUsd(p.monto)} · {p.metodo}</span>
                    <StatusBadge tone={p.estado === "Verificado" ? "ok" : "warn"}>{p.estado}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.cliente} · {p.hora}{p.ref ? ` · ref ${p.ref}` : ""}
                  </p>
                  {p.estado === "Pendiente" && (
                    <Button variant="secondary" icon="check" onClick={() => verificar(p.id)} className="mt-2">Verificar pago</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Reglas en `docs/decisions/payments-cash.md` (verificación por método; pendientes no cuentan como cobrados).</p>
    </>
  );
}
