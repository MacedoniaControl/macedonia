"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";

type Venta = { id: number; correlativo: string; cliente: string; producto: string; qty: number; total: number; tipo: "Contado" | "Crédito" };

const CLIENTES = ["Taller Lago C.A.", "Metalúrgica T.", "Tigasco Gas", "Náutica RS", "Cliente genérico"];
const PRODUCTOS = [
  { n: "Oxígeno gaseoso cil 6M³", p: 16.01 },
  { n: "Nitrógeno gaseoso cil 6M³", p: 38.04 },
  { n: "Antorcha TIG 200A flex", p: 172.65 },
  { n: "Electrodo 7018 5/32 Linconl", p: 5.86 },
  { n: "Manguera morocha 1/4 GNC", p: 5.78 },
];
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

export default function SalesPage() {
  const empresaKey = useEmpresaActiva();
  const [ventas, setVentas] = usePersistedState<Venta[]>(`nv:lista:${empresaKey}`, []);
  const [seq, setSeq] = usePersistedState(`nv:seq:${empresaKey}`, 189);
  const [cliente, setCliente] = useState(CLIENTES[0]);
  const [prod, setProd] = useState(PRODUCTOS[0].n);
  const [qty, setQty] = useState(1);
  const [tipo, setTipo] = useState<"Contado" | "Crédito">("Contado");
  const [msg, setMsg] = useState("");

  function registrar() {
    setMsg("");
    const q = Number(qty);
    if (!q || q < 1) return setMsg("ERR:La cantidad debe ser al menos 1.");
    const p = PRODUCTOS.find((x) => x.n === prod)!;
    const correlativo = `NV-2026-${String(seq).padStart(6, "0")}`;
    setVentas((prev) => [{ id: Date.now(), correlativo, cliente, producto: p.n, qty: q, total: q * p.p, tipo }, ...prev]);
    setSeq((s) => s + 1);
    setMsg(`${correlativo} registrada (${tipo}). ${tipo === "Crédito" ? "Genera cuenta por cobrar." : "Registra el cobro contado."}`);
    setQty(1);
  }

  const total = ventas.reduce((a, v) => a + v.total, 0);
  const credito = ventas.filter((v) => v.tipo === "Crédito").reduce((a, v) => a + v.total, 0);
  const contado = total - credito;

  return (
    <>
      <PageHeader
        title="Ventas internas"
        description="Registro operativo de ventas; se relaciona con el cobro contado y las cuentas por cobrar (crédito)."
        breadcrumbs={[{ label: "Operación" }, { label: "Ventas internas" }]}
        actions={<StatusBadge tone="brand">{ventas.length} venta(s)</StatusBadge>}
      />
      <SectionCard title="Resumen de la sesión">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total vendido" value={fmtUsd(total)} accent />
          <StatCard label="Contado" value={fmtUsd(contado)} />
          <StatCard label="Crédito" value={fmtUsd(credito)} />
          <StatCard label="Documentos" value={String(ventas.length)} />
        </div>
      </SectionCard>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <SectionCard title="Registrar venta">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cli">Cliente</label>
              <select id="cli" className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)}>
                {CLIENTES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prod">Producto</label>
              <select id="prod" className={inputClass} value={prod} onChange={(e) => setProd(e.target.value)}>
                {PRODUCTOS.map((p) => <option key={p.n} value={p.n}>{p.n} · {fmtUsd(p.p)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="qty">Cantidad</label>
                <input id="qty" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="tipo">Tipo</label>
                <select id="tipo" className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as "Contado" | "Crédito")}>
                  <option>Contado</option>
                  <option>Crédito</option>
                </select>
              </div>
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="sales" onClick={registrar} className="w-full">Registrar venta</Button>
          </div>
        </SectionCard>
        <SectionCard title="Ventas registradas">
          {ventas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Sin ventas en esta sesión. Registra una a la izquierda.</p>
          ) : (
            <ul className="space-y-2">
              {ventas.map((v) => (
                <li key={v.id} className="rounded-xl border border-border-strong bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{v.correlativo}</span>
                    <StatusBadge tone={v.tipo === "Contado" ? "ok" : "warn"}>{v.tipo}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text">{v.cliente} · {v.qty} × {v.producto} · {fmtUsd(v.total)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Crédito alimenta CxC; contado se cobra al registrar la venta.</p>
    </>
  );
}
