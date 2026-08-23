"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarOrdenes, crearOrden, recibir, type Orden as OrdenDb } from "@/lib/compras/compras-db";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";


const PROVEEDORES = ["Linconl Import C.A.", "Gases del Oriente", "Hoffman Supply", "Carboweld Andina"];
const PRODUCTOS = [
  { n: "Electrodo 7018 5/32 Linconl", c: 1.47 },
  { n: "Oxígeno gaseoso cil 6M³", c: 8.98 },
  { n: "Antorcha TIG 200A flex", c: 122.69 },
  { n: "Regulador de argón c/ flujómetro", c: 25.81 },
  { n: "Manguera morocha 1/4 GNC", c: 3.3 },
];
const toneOf: Record<string, Tone> = {
  abierta: "info",
  parcial: "warn",
  recibida: "ok",
};
const etiqueta: Record<string, string> = {
  abierta: "Abierta",
  parcial: "Recibida parcial",
  recibida: "Recibida",
};
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

export default function PurchasesPage() {
  const empresaKey = useEmpresaActiva();
  // Las ordenes viven en la base y el estado se DEDUCE de cuanto llego:
  // nadie tiene que acordarse de marcar "recibida parcial".
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarOrdenes(empresaKey));
  const ordenes: OrdenDb[] = carga.datos ?? [];
  const [prov, setProv] = useState(PROVEEDORES[0]);
  const [prod, setProd] = useState(PRODUCTOS[0].n);
  const [qty, setQty] = useState(10);
  const [msg, setMsg] = useState("");

  async function crear() {
    setMsg("");
    const q = Number(qty);
    if (!q || q < 1) return setMsg("ERR:La cantidad debe ser al menos 1.");
    const p = PRODUCTOS.find((x) => x.n === prod)!;

    const r = await crearOrden(
      { proveedor: prov, codigo: p.n, descripcion: p.n, cantidad: q, costoUsd: p.c },
      empresaKey,
    );
    if (!r.ok) return setMsg(`ERR:${r.error}`);

    setRecarga((n) => n + 1);
    setMsg(`Orden creada por ${fmtUsd(q * p.c)}.`);
  }

  async function recibirOrden(id: number, cant: number) {
    setMsg("");
    // Cada recepción entra al kardex: lo que llega al almacén tiene que
    // aparecer en la existencia, o el inventario queda corto sin explicación.
    const r = await recibir(id, cant, empresaKey);
    if (!r.ok) return setMsg(`ERR:${r.error}`);
    setRecarga((n) => n + 1);
    setMsg("Recepción registrada y sumada al inventario.");
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
                <li key={o.id} className="rounded-xl border border-border-strong bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{o.correlativo}</span>
                    <StatusBadge tone={toneOf[o.estado] ?? "muted"}>{etiqueta[o.estado] ?? o.estado}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text">{o.proveedor} · {o.cantidad} × {o.descripcion}</p>
                  <p className="text-xs text-muted">
                    Recibido {o.recibido}/{o.cantidad} · total {fmtUsd(o.cantidad * o.costoUsd)}
                  </p>
                  {o.estado !== "recibida" && (
                    <div className="mt-2 flex gap-2">
                      <Button variant="secondary" onClick={() => recibirOrden(o.id, Math.ceil(o.cantidad / 2))}>Recepción parcial</Button>
                      <Button variant="ghost" onClick={() => recibirOrden(o.id, o.cantidad)}>Recibir todo</Button>
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
