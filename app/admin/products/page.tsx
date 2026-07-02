"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fmtUsd } from "@/lib/ux/format";

type Prod = { sku: string; nombre: string; cat: string; precio: number; costo: number; nuevo?: boolean };

const CATS: Record<string, string> = {
  "Gases industriales y medicinales": "GAS",
  "Máquinas de soldar y equipos": "MAQ",
  "Electrodos y varillas": "ELE",
  "Portaelectrodos y antorchas": "ANT",
  "Reguladores y válvulas": "REG",
  "Equipo de protección personal": "EPP",
  "Accesorios y repuestos": "REP",
};

const SEED: Prod[] = [
  { sku: "GAS-0001", nombre: "Oxígeno gaseoso cil 6M³", cat: "Gases industriales y medicinales", precio: 16.01, costo: 8.98 },
  { sku: "GAS-0002", nombre: "Nitrógeno gaseoso cil 6M³", cat: "Gases industriales y medicinales", precio: 38.04, costo: 17.52 },
  { sku: "GAS-0003", nombre: "Argón cil 6M³", cat: "Gases industriales y medicinales", precio: 51.65, costo: 35.47 },
  { sku: "ANT-0001", nombre: "Antorcha TIG 200A flex WP26F", cat: "Portaelectrodos y antorchas", precio: 172.65, costo: 122.69 },
  { sku: "REG-0001", nombre: "Regulador de argón c/ flujómetro", cat: "Reguladores y válvulas", precio: 63.87, costo: 25.81 },
  { sku: "ELE-0001", nombre: "Electrodo 6010 5/32 Linconl", cat: "Electrodos y varillas", precio: 6.24, costo: 4.05 },
  { sku: "ELE-0003", nombre: "Electrodo 7018 5/32 Linconl", cat: "Electrodos y varillas", precio: 5.86, costo: 1.47 },
  { sku: "MAQ-0001", nombre: "Cable p/ máquina de soldar", cat: "Máquinas de soldar y equipos", precio: 26.08, costo: 17.32 },
  { sku: "REP-0001", nombre: "Manguera morocha 1/4 GNC", cat: "Accesorios y repuestos", precio: 5.78, costo: 3.3 },
];

const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export default function ProductsPage() {
  const [prods, setProds] = useState<Prod[]>(SEED);
  const [q, setQ] = useState("");
  const [nombre, setNombre] = useState("");
  const [cat, setCat] = useState(Object.keys(CATS)[0]);
  const [precio, setPrecio] = useState(0);
  const [costo, setCosto] = useState(0);
  const [msg, setMsg] = useState("");

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? prods.filter((p) => p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || p.cat.toLowerCase().includes(t)) : prods;
  }, [q, prods]);

  function nextSku(c: string): string {
    const pre = CATS[c];
    const nums = prods.filter((p) => p.sku.startsWith(pre + "-")).map((p) => Number(p.sku.split("-")[1] || 0));
    return `${pre}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0")}`;
  }

  function crear() {
    setMsg("");
    if (!nombre.trim()) return setMsg("ERR:El nombre es obligatorio.");
    if (!precio || precio <= 0) return setMsg("ERR:El precio debe ser mayor a 0.");
    const sku = nextSku(cat);
    setProds((prev) => [{ sku, nombre: nombre.trim(), cat, precio: Number(precio), costo: Number(costo) || 0, nuevo: true }, ...prev]);
    setMsg(`Producto ${sku} creado (SKU autogenerado por categoría, editable antes de importar).`);
    setNombre(""); setPrecio(0); setCosto(0);
  }

  const margen = (p: Prod) => (p.costo > 0 ? Math.round(((p.precio - p.costo) / p.costo) * 100) : null);

  return (
    <>
      <PageHeader
        title="Productos y catálogo"
        description="Maestro de productos con SKU por categoría (§16). Base real del catálogo 2024."
        breadcrumbs={[{ label: "Inventario" }, { label: "Productos y catálogo" }]}
        actions={<StatusBadge tone="brand">{prods.length} producto(s)</StatusBadge>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.7fr]">
        <SectionCard title="Crear producto">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="nom">Nombre</label>
              <input id="nom" className={inputClass} value={nombre} placeholder="Ej: Electrodo 6013 1/8" onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cat">Categoría (define el prefijo SKU)</label>
              <select id="cat" className={inputClass} value={cat} onChange={(e) => setCat(e.target.value)}>
                {Object.keys(CATS).map((c) => <option key={c}>{c}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted">Próximo SKU: <span className="font-mono">{nextSku(cat)}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="pre">Precio (USD)</label>
                <input id="pre" type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="cos">Costo (USD)</label>
                <input id="cos" type="number" min={0} step="0.01" value={costo} onChange={(e) => setCosto(Number(e.target.value))} className={inputClass} />
              </div>
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="plus" onClick={crear} className="w-full">Crear producto</Button>
          </div>
        </SectionCard>

        <SectionCard title="Catálogo" description="Costo/margen visible solo para roles autorizados.">
          <label className="relative mb-3 flex items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input className={`${inputClass} pl-9`} placeholder="Buscar por SKU, nombre o categoría…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">SKU</th>
                  <th className="py-2.5 pr-3 font-medium">Producto</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Precio</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Costo</th>
                  <th className="py-2.5 text-right font-medium">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((p) => (
                  <tr key={p.sku} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">
                      {p.sku}{p.nuevo && <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 text-[10px] text-brand">nuevo</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-text">{p.nombre}</td>
                    <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(p.precio)}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{fmtUsd(p.costo)}</td>
                    <td className="py-2.5 text-right">{margen(p) !== null ? <span className="font-medium text-ok">{margen(p)}%</span> : <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side con precios/costos reales 2024 (`docs/data/catalog-inventory-mock-2024.md`).</p>
    </>
  );
}
