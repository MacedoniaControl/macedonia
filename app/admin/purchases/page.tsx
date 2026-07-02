"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";

type Estado = "Abierta" | "Recibida parcial" | "Recibida";
type Orden = { id: number; correlativo: string; proveedor: string; producto: string; qty: number; recibido: number; costo: number; estado: Estado; cxp: boolean };

const PROVEEDORES = ["Linconl Import C.A.", "Gases del Oriente", "Hoffman Supply", "Carboweld Andina"];
const PRODUCTOS = [
  { n: "Electrodo 7018 5/32 Linconl", c: 1.47 },
  { n: "Oxígeno gaseoso cil 6M³", c: 8.98 },
  { n: "Antorcha TIG 200A flex", c: 122.69 },
  { n: "Regulador de argón c/ flujómetro", c: 25.81 },
  { n: "Manguera morocha 1/4 GNC", c: 3.3 },
];
const toneOf: Record<Estado, Tone> = { Abierta: "info", "Recibida parcial": "warn", Recibida: "ok" };
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function PurchasesPage() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [seq, setSeq] = useState(17);
  const [prov, setProv] = useState(PROVEEDORES[0]);
  const [prod, setProd] = useState(PRODUCTOS[0].n);
  const [qty, setQty] = useState(10);
  const [msg, setMsg] = useState("");

  function crear() {
    setMsg("");
    const q = Number(qty);
    if (!q || q < 1) return setMsg("ERR:La cantidad debe ser al menos 1.");
    const p = PRODUCTOS.find((x) => x.n === prod)!;
    const correlativo = `OC-2026-${String(seq).padStart(6, "0")}`;
    setOrdenes((prev) => [{ id: Date.now(), correlativo, proveedor: prov, producto: p.n, qty: q, recibido: 0, costo: p.c, estado: "Abierta", cxp: false }, ...prev]);
    setSeq((s) => s + 1);
    setMsg(`Orden ${correlativo} creada (presupuesto reservado: ${fmtUsd(q * p.c)}).`);
  }

  function recibir(id: number, cant: number) {
    setOrdenes((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      const rec = Math.min(o.qty, o.recibido + cant);
      const estado: Estado = rec >= o.qty ? "Recibida" : "Recibida parcial";
      return { ...o, recibido: rec, estado, cxp: true };
    }));
    setMsg("Recepción registrada: stock y costo actualizados; cuenta por pagar generada.");
  }

  return (
    <>
      <PageHeader
        title="Compras"
        description="Orden → recepción parcial → actualiza stock/costo y genera cuenta por pagar (§25)."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Compras" }]}
        actions={<StatusBadge tone="brand">{ordenes.length} orden(es)</StatusBadge>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <SectionCard title="Nueva orden de compra">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prov">Proveedor</label>
              <select id="prov" className={inputClass} value={prov} onChange={(e) => setProv(e.target.value)}>
                {PROVEEDORES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prod">Producto</label>
              <select id="prod" className={inputClass} value={prod} onChange={(e) => setProd(e.target.value)}>
                {PRODUCTOS.map((p) => <option key={p.n} value={p.n}>{p.n} · costo {fmtUsd(p.c)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="qty">Cantidad</label>
              <input id="qty" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className={inputClass} />
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="purchase" onClick={crear} className="w-full">Crear orden de compra</Button>
          </div>
        </SectionCard>

        <SectionCard title="Órdenes" description="Registra recepciones totales o parciales.">
          {ordenes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Sin órdenes. Crea una a la izquierda.</p>
          ) : (
            <ul className="space-y-2">
              {ordenes.map((o) => (
                <li key={o.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{o.correlativo}</span>
                    <StatusBadge tone={toneOf[o.estado]}>{o.estado}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text">{o.proveedor} · {o.qty} × {o.producto}</p>
                  <p className="text-xs text-muted">
                    Recibido {o.recibido}/{o.qty} · total {fmtUsd(o.qty * o.costo)}{o.cxp ? " · CxP generada ✓" : ""}
                  </p>
                  {o.estado !== "Recibida" && (
                    <div className="mt-2 flex gap-2">
                      <Button variant="secondary" onClick={() => recibir(o.id, Math.ceil(o.qty / 2))}>Recepción parcial</Button>
                      <Button variant="ghost" onClick={() => recibir(o.id, o.qty)}>Recibir todo</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Reglas §25: último costo, CxP automática al recibir; el pago se registra en Caja.</p>
    </>
  );
}
