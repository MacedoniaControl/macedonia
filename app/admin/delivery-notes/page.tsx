"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";

type Nota = { id: number; correlativo: string; cliente: string; producto: string; qty: number; total: number; anulada: boolean };

const CLIENTES = ["Taller Lago C.A.", "Metalúrgica T.", "Tigasco Gas", "Náutica RS"];
const PRODUCTOS = [
  { n: "Oxígeno gaseoso cil 6M³", p: 16.01, sku: "GAS-0001" },
  { n: "Argón cil 6M³", p: 51.65, sku: "GAS-0003" },
  { n: "Electrodo 7018 5/32 Linconl", p: 5.86, sku: "ELE-0003" },
  { n: "Regulador de argón c/ flujómetro", p: 63.87, sku: "REG-0001" },
];
const STOCK_INICIAL: Record<string, number> = { "GAS-0001": 18, "GAS-0003": 12, "ELE-0003": 90, "REG-0001": 7 };
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function DeliveryNotesPage() {
  const [notas, setNotas] = usePersistedState<Nota[]>("ne:lista", []);
  const [stock, setStock] = usePersistedState<Record<string, number>>("ne:stock", STOCK_INICIAL);
  const [seq, setSeq] = usePersistedState("ne:seq", 111);
  const [cliente, setCliente] = useState(CLIENTES[0]);
  const [prodSku, setProdSku] = useState(PRODUCTOS[0].sku);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");

  const prod = PRODUCTOS.find((p) => p.sku === prodSku)!;

  function crear() {
    setMsg("");
    const q = Number(qty);
    if (!q || q < 1) return setMsg("ERR:La cantidad debe ser al menos 1.");
    if (stock[prodSku] < q) return setMsg(`ERR:Stock insuficiente de ${prod.n} (disponible: ${stock[prodSku]}). Venta sin stock requiere aprobación OWNER/ADMIN.`);
    const correlativo = `NE-2026-${String(seq).padStart(6, "0")}`;
    setStock((s) => ({ ...s, [prodSku]: s[prodSku] - q }));
    setNotas((prev) => [{ id: Date.now(), correlativo, cliente, producto: prod.n, qty: q, total: q * prod.p, anulada: false }, ...prev]);
    setSeq((s) => s + 1);
    setMsg(`${correlativo} emitida. Stock de ${prod.sku} descontado (−${q}).`);
    setQty(1);
  }

  function anular(n: Nota) {
    const skuDe = PRODUCTOS.find((p) => p.n === n.producto)?.sku;
    if (skuDe) setStock((s) => ({ ...s, [skuDe]: s[skuDe] + n.qty }));
    setNotas((prev) => prev.map((x) => (x.id === n.id ? { ...x, anulada: true } : x)));
    setMsg(`${n.correlativo} anulada (conserva su número). Stock repuesto (+${n.qty}).`);
  }

  return (
    <>
      <PageHeader
        title="Notas de entrega"
        description="Punto único de descuento de stock. Correlativo al emitir; anular conserva el número (documents-correlativos.md)."
        breadcrumbs={[{ label: "Operación" }, { label: "Notas de entrega" }]}
        actions={<StatusBadge tone="brand">{notas.filter((n) => !n.anulada).length} activa(s)</StatusBadge>}
      />

      <SectionCard title="Stock disponible" description="Se descuenta al emitir la nota; se repone al anular.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRODUCTOS.map((p) => (
            <div key={p.sku} className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="truncate text-xs text-muted">{p.n}</p>
              <p className="text-xl font-semibold text-text">{stock[p.sku]}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <SectionCard title="Nueva nota de entrega">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cli">Cliente (obligatorio)</label>
              <select id="cli" className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)}>
                {CLIENTES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prod">Producto</label>
              <select id="prod" className={inputClass} value={prodSku} onChange={(e) => setProdSku(e.target.value)}>
                {PRODUCTOS.map((p) => <option key={p.sku} value={p.sku}>{p.n} · {fmtUsd(p.p)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="qty">Cantidad</label>
              <input id="qty" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className={inputClass} />
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="delivery" onClick={crear} className="w-full">Emitir nota de entrega</Button>
          </div>
        </SectionCard>

        <SectionCard title="Notas emitidas" description="Solo OWNER/ADMIN anulan una nota (con confirmación).">
          {notas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Sin notas. Emite una a la izquierda y observa el stock.</p>
          ) : (
            <ul className="space-y-2">
              {notas.map((n) => (
                <li key={n.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{n.correlativo}</span>
                    <StatusBadge tone={n.anulada ? "danger" : "ok"}>{n.anulada ? "Anulada" : "Emitida"}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text">{n.cliente} · {n.qty} × {n.producto} · {fmtUsd(n.total)}</p>
                  {!n.anulada && (
                    <ConfirmDialog
                      title="Anular nota de entrega"
                      message={`${n.correlativo} se anulará conservando su número y el stock será repuesto. Acción auditada (OWNER/ADMIN).`}
                      confirmLabel="Anular"
                      onConfirm={() => anular(n)}
                      trigger={(open) => (
                        <button type="button" onClick={open} className="mt-2 text-sm font-medium text-danger hover:underline">Anular nota</button>
                      )}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Reglas en `inventory-rules.md` y `documents-correlativos.md`.</p>
    </>
  );
}
