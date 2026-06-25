"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";

type Estado = "Borrador" | "Aprobada" | "Rechazada" | "Nota de entrega";
type Linea = { sku: string; nombre: string; precio: number; qty: number };
type Cotizacion = { id: number; correlativo: string; cliente: string; lineas: Linea[]; total: number; estado: Estado };

const CATALOGO = [
  { sku: "GAS-0001", nombre: "Oxígeno gaseoso cil 6M³", precio: 16.01 },
  { sku: "GAS-0003", nombre: "Argón cil 6M³", precio: 51.65 },
  { sku: "ANT-0001", nombre: "Antorcha TIG 200A flex", precio: 172.65 },
  { sku: "REG-0001", nombre: "Regulador de argón c/ flujómetro", precio: 63.87 },
  { sku: "ELE-0003", nombre: "Electrodo 7018 5/32 Linconl", precio: 5.86 },
  { sku: "REP-0001", nombre: "Manguera morocha 1/4 GNC", precio: 5.78 },
];
const CLIENTES = ["Taller Lago C.A.", "Metalúrgica T.", "Tigasco Gas", "Náutica RS", "Cliente genérico"];

const toneOf: Record<Estado, Tone> = {
  Borrador: "muted",
  Aprobada: "info",
  Rechazada: "danger",
  "Nota de entrega": "ok",
};

const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function QuotesPage() {
  const [cots, setCots] = useState<Cotizacion[]>([]);
  const [seq, setSeq] = useState(1);
  const [cliente, setCliente] = useState(CLIENTES[0]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [sel, setSel] = useState(CATALOGO[0].sku);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");

  function addLinea() {
    const p = CATALOGO.find((c) => c.sku === sel)!;
    const q = Math.max(1, Number(qty));
    setLineas((prev) => {
      const ex = prev.find((l) => l.sku === p.sku);
      if (ex) return prev.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + q } : l));
      return [...prev, { sku: p.sku, nombre: p.nombre, precio: p.precio, qty: q }];
    });
    setQty(1);
  }

  function crear() {
    setMsg("");
    if (lineas.length === 0) return setMsg("ERR:Agrega al menos un producto a la cotización.");
    const total = lineas.reduce((a, l) => a + l.precio * l.qty, 0);
    const correlativo = `COT-2026-${String(seq).padStart(6, "0")}`;
    setCots((prev) => [{ id: Date.now(), correlativo, cliente, lineas, total, estado: "Borrador" }, ...prev]);
    setSeq((s) => s + 1);
    setLineas([]);
    setMsg(`Cotización ${correlativo} creada en borrador.`);
  }

  function setEstado(id: number, estado: Estado, nota: string) {
    setCots((prev) => prev.map((c) => (c.id === id ? { ...c, estado } : c)));
    setMsg(nota);
  }

  const draftTotal = lineas.reduce((a, l) => a + l.precio * l.qty, 0);

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        description="Borrador → Aprobada → Nota de entrega. La cotización aprobada NO descuenta stock; la nota de entrega SÍ."
        breadcrumbs={[{ label: "Operación" }, { label: "Cotizaciones" }]}
        actions={<StatusBadge tone="brand">{cots.length} cotización(es)</StatusBadge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <SectionCard title="Nueva cotización">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cli">Cliente</label>
              <select id="cli" className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)}>
                {CLIENTES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prod">Producto</label>
                <select id="prod" className={inputClass} value={sel} onChange={(e) => setSel(e.target.value)}>
                  {CATALOGO.map((p) => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
                </select>
              </div>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))}
                className="h-10 w-16 rounded-xl border border-border bg-surface-2 px-2 text-center text-sm text-text" aria-label="Cantidad" />
              <Button variant="secondary" icon="plus" onClick={addLinea}>Línea</Button>
            </div>

            {lineas.length > 0 && (
              <ul className="space-y-1 border-t border-border pt-2 text-sm">
                {lineas.map((l) => (
                  <li key={l.sku} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate text-text">{l.qty} × {l.nombre}</span>
                    <span className="text-muted">{fmtUsd(l.precio * l.qty)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>{fmtUsd(draftTotal)}</span></li>
              </ul>
            )}

            {msg && (
              <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
                {msg.replace("ERR:", "")}
              </p>
            )}
            <Button icon="quote" onClick={crear} className="w-full">Crear cotización (borrador)</Button>
          </div>
        </SectionCard>

        <SectionCard title="Cotizaciones" description="Aprueba, rechaza o convierte a nota de entrega.">
          {cots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Aún no hay cotizaciones. Crea una a la izquierda.</p>
          ) : (
            <ul className="space-y-2">
              {cots.map((c) => (
                <li key={c.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{c.correlativo}</span>
                    <StatusBadge tone={toneOf[c.estado]}>{c.estado}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text">{c.cliente} · {c.lineas.length} ítem(s) · {fmtUsd(c.total)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.estado === "Borrador" && (
                      <>
                        <Button variant="secondary" onClick={() => setEstado(c.id, "Aprobada", `${c.correlativo} aprobada. Productos quedan "en proceso" (no descuenta stock).`)}>Aprobar</Button>
                        <Button variant="ghost" onClick={() => setEstado(c.id, "Rechazada", `${c.correlativo} rechazada.`)}>Rechazar</Button>
                      </>
                    )}
                    {c.estado === "Aprobada" && (
                      <Button icon="delivery" onClick={() => setEstado(c.id, "Nota de entrega", `${c.correlativo} → Nota de entrega generada. Stock descontado.`)}>Convertir a nota de entrega</Button>
                    )}
                    {c.estado === "Nota de entrega" && <span className="text-xs text-ok">✓ Stock descontado al emitir la nota de entrega.</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Flujo y reglas en `docs/decisions/inventory-rules.md` (descuento de stock solo en nota de entrega).</p>
    </>
  );
}
