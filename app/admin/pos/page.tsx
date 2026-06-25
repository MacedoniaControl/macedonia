"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RATE_BS } from "@/lib/ux/dashboard-data";
import { fmtUsd, fmtBs } from "@/lib/ux/format";

type Prod = { sku: string; nombre: string; cat: string; precio: number; stock: number };
type Item = Prod & { qty: number };

const CATALOGO: Prod[] = [
  { sku: "GAS-0001", nombre: "Oxígeno gaseoso cil 6M³", cat: "Gases", precio: 16.01, stock: 18 },
  { sku: "GAS-0002", nombre: "Nitrógeno gaseoso cil 6M³", cat: "Gases", precio: 38.04, stock: 9 },
  { sku: "GAS-0003", nombre: "Argón cil 6M³", cat: "Gases", precio: 51.65, stock: 12 },
  { sku: "ANT-0001", nombre: "Antorcha TIG 200A flex", cat: "Antorchas", precio: 172.65, stock: 6 },
  { sku: "REG-0001", nombre: "Regulador de argón c/ flujómetro", cat: "Reguladores", precio: 63.87, stock: 7 },
  { sku: "ELE-0001", nombre: "Electrodo 6010 5/32 Linconl", cat: "Electrodos", precio: 6.24, stock: 120 },
  { sku: "ELE-0003", nombre: "Electrodo 7018 5/32 Linconl", cat: "Electrodos", precio: 5.86, stock: 90 },
  { sku: "ELE-0006", nombre: "Electrodo 8018 1/8 Carboweld", cat: "Electrodos", precio: 4.99, stock: 60 },
  { sku: "REP-0001", nombre: "Manguera morocha 1/4 GNC", cat: "Repuestos", precio: 5.78, stock: 80 },
  { sku: "ANT-0004", nombre: "Porta electrodo Lenco 500A", cat: "Antorchas", precio: 21.32, stock: 10 },
];

const CLIENTES = ["Cliente genérico", "Taller Lago C.A.", "Metalúrgica T.", "Tigasco Gas", "Náutica RS"];
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function PosPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [cliente, setCliente] = useState(CLIENTES[0]);
  const [descuento, setDescuento] = useState(0);
  const [ok, setOk] = useState("");
  const [ventas, setVentas] = useState(0);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? CATALOGO.filter((p) => p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)) : CATALOGO;
  }, [q]);

  function add(p: Prod) {
    setOk("");
    setItems((prev) => {
      const ex = prev.find((i) => i.sku === p.sku);
      if (ex) return prev.map((i) => (i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { ...p, qty: 1 }];
    });
  }
  function setQty(sku: string, qty: number) {
    setItems((prev) => prev.flatMap((i) => (i.sku === sku ? (qty <= 0 ? [] : [{ ...i, qty }]) : [i])));
  }

  const subtotal = items.reduce((a, i) => a + i.precio * i.qty, 0);
  const desc = subtotal * (Math.min(50, Math.max(0, descuento)) / 100);
  const base = subtotal - desc;
  const iva = base * 0.16;
  const total = base + iva;

  function registrar() {
    if (items.length === 0) return setOk("ERR:Agrega al menos un producto.");
    setVentas((v) => v + 1);
    setOk(`Venta registrada para ${cliente} · ${fmtUsd(total)} (${fmtBs(total * RATE_BS)}).`);
    setItems([]);
    setDescuento(0);
  }

  return (
    <>
      <PageHeader
        title="POS interno"
        description="Control interno paralelo a Valery: cliente, búsqueda, descuentos, IVA y total. Funcional para demo."
        breadcrumbs={[{ label: "Operación" }, { label: "POS interno" }]}
        actions={<StatusBadge tone="brand">{ventas} venta(s) en sesión</StatusBadge>}
      />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Catálogo" description="Toca un producto para agregarlo al carrito.">
          <label className="relative mb-3 flex items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input className={`${inputClass} pl-9`} placeholder="Buscar por SKU o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="sumi-scroll grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {filtrados.map((p) => (
              <button key={p.sku} onClick={() => add(p)}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-brand/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text">{p.nombre}</span>
                  <span className="font-mono text-[11px] text-muted">{p.sku} · stock {p.stock}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-text">{fmtUsd(p.precio)}</span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Carrito">
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cli">Cliente</label>
            <select id="cli" className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)}>
              {CLIENTES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Carrito vacío. Agrega productos del catálogo.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {items.map((i) => (
                <li key={i.sku} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-text">{i.nombre}</span>
                  <input type="number" min={0} value={i.qty} onChange={(e) => setQty(i.sku, Number(e.target.value))}
                    className="h-8 w-14 rounded-lg border border-border bg-surface-2 px-2 text-center text-text" />
                  <span className="w-16 text-right text-text">{fmtUsd(i.precio * i.qty)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="desc">Descuento (%) · máx 50</label>
            <input id="desc" type="number" min={0} max={50} value={descuento} onChange={(e) => setDescuento(Number(e.target.value))} className={inputClass} />
          </div>

          <dl className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="text-text">{fmtUsd(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Descuento</dt><dd className="text-text">−{fmtUsd(desc)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">IVA 16%</dt><dd className="text-text">{fmtUsd(iva)}</dd></div>
            <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{fmtUsd(total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total Bs</dt><dd className="text-muted">{fmtBs(total * RATE_BS)}</dd></div>
          </dl>

          {ok && (
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${ok.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
              {ok.replace("ERR:", "")}
            </p>
          )}

          <Button icon="check" onClick={registrar} className="mt-3 w-full">Registrar venta</Button>
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side. Tasa {RATE_BS} Bs/USD. Cálculo: subtotal − descuento + IVA 16% (ver `docs/decisions/currency-tax-rate.md`).</p>
    </>
  );
}
