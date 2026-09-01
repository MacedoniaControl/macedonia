"use client";

import { useMemo, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarProductos, type ProductoLista } from "@/lib/inventory/productos-db";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fmtUsd } from "@/lib/ux/format";

type Prod = { codigo: string; nombre: string; cat: string; precio: number; costo: number; nuevo?: boolean };

const CATS: Record<string, string> = {
  "Gases industriales y medicinales": "GAS",
  "Máquinas de soldar y equipos": "MAQ",
  "Electrodos y varillas": "ELE",
  "Portaelectrodos y antorchas": "ANT",
  "Reguladores y válvulas": "REG",
  "Equipo de protección personal": "EPP",
  "Accesorios y repuestos": "REP",
};


const inputClass = "sumi-campo";

export default function ProductsPage() {
  const empresaKey = useEmpresaActiva();
  // El catálogo real vive en la base: 1.704 productos de Sumigases y 2.599 de
  // Sudematin, no los 5 de ejemplo que había aquí escritos.
  const carga = useCarga(empresaKey, () => listarProductos(empresaKey));
  const prods: ProductoLista[] = carga.datos ?? [];
  const [q, setQ] = useState("");
  const [nombre, setNombre] = useState("");
  const [cat, setCat] = useState(Object.keys(CATS)[0]);
  const [precio, setPrecio] = useState(0);
  const [costo, setCosto] = useState(0);
  const [msg, setMsg] = useState("");

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? prods.filter((p) => p.nombre.toLowerCase().includes(t) || p.codigo.toLowerCase().includes(t) || (p.unidad ?? "—").toLowerCase().includes(t)) : prods;
  }, [q, prods]);

  function nextSku(c: string): string {
    const pre = CATS[c];
    const nums = prods.filter((p) => p.codigo.startsWith(pre + "-")).map((p) => Number(p.codigo.split("-")[1] || 0));
    return `${pre}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0")}`;
  }

  // Crear productos a mano queda para más adelante: el catálogo real viene del
  // export de Valery, y un producto inventado aquí no existiría en Valery ni
  // tendría costo. Se deja la pantalla como consulta hasta definir ese flujo.
  function crear() {
    setMsg("ERR:Los productos vienen del catálogo de Valery. Crear uno a mano todavía no está disponible.");
  }

  // Sin costo no hay margen que calcular — ni para quien no puede verlo, ni
  // para un producto que nunca se compró.
  const margen = (p: ProductoLista) =>
    p.costo !== null && p.costo > 0 ? Math.round(((p.precio - p.costo) / p.costo) * 100) : null;

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
                  <tr key={p.codigo} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">
                      {p.codigo}
                    </td>
                    <td className="py-2.5 pr-3 text-text">{p.nombre}</td>
                    <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(p.precio)}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {/* null = esta persona no puede ver costos. Mostrar $0
                          seria mentir; el guion dice "no te toca verlo". */}
                      {p.costo === null ? "—" : fmtUsd(p.costo)}
                    </td>
                    <td className="py-2.5 text-right">{margen(p) !== null ? <span className="font-medium text-ok">{margen(p)}%</span> : <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
