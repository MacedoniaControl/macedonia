"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { downloadCsv } from "@/lib/ux/export-csv";

const products = [
  { sku: "GAS-0001", nombre: "Oxígeno gaseoso cil 6M³", cat: "Gases", alm: "Lechería", precio: 16.01, costo: 8.98, stock: 18, min: 10, roi: 78 },
  { sku: "GAS-0002", nombre: "Nitrógeno gaseoso cil 6M³", cat: "Gases", alm: "Lechería", precio: 38.04, costo: 17.52, stock: 9, min: 8, roi: 316 },
  { sku: "ANT-0001", nombre: "Antorcha TIG 200A flex", cat: "Antorchas", alm: "Lechería", precio: 172.65, costo: 122.69, stock: 6, min: 3, roi: 41 },
  { sku: "REG-0001", nombre: "Regulador de argón c/ flujómetro", cat: "Reguladores", alm: "Cumaná", precio: 63.87, costo: 25.81, stock: 7, min: 5, roi: 147 },
  { sku: "ELE-0001", nombre: "Electrodo 6010 5/32 Linconl", cat: "Electrodos", alm: "Lechería", precio: 6.24, costo: 4.05, stock: 120, min: 50, roi: 54 },
  { sku: "ELE-0003", nombre: "Electrodo 7018 5/32 Linconl", cat: "Electrodos", alm: "Cumaná", precio: 5.86, costo: 1.47, stock: 90, min: 50, roi: 298 },
  { sku: "ANT-0002", nombre: 'Soplete 36" Victor Weldtech', cat: "Antorchas", alm: "Lechería", precio: 311.38, costo: 105.0, stock: 2, min: 2, roi: 197 },
  { sku: "REP-0001", nombre: "Manguera morocha 1/4 GNC", cat: "Repuestos", alm: "Cumaná", precio: 5.78, costo: 3.3, stock: 80, min: 40, roi: 75 },
];

const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text";
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm text-text";

export default function InventoryPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [alm, setAlm] = useState("all");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (cat === "all" || p.cat === cat) &&
        (alm === "all" || p.alm === alm) &&
        (!t || p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)),
    );
  }, [q, cat, alm]);

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Stock por empresa y almacén, con costo, margen y ROI por producto."
        breadcrumbs={[{ label: "Inventario" }, { label: "Inventario" }]}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Importar inventario"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setMsg(`Archivo "${f.name}" recibido. Continúa el mapeo en Importaciones.`); }} />
            <Button variant="secondary" icon="import" onClick={() => fileRef.current?.click()}>Importar</Button>
            <Button variant="secondary" icon="report" onClick={() => downloadCsv("inventario", [["SKU", "Producto", "Categoría", "Almacén", "Precio", "Costo", "Stock", "Mínimo", "ROI %"], ...filtrados.map((p) => [p.sku, p.nombre, p.cat, p.alm, p.precio, p.costo, p.stock, p.min, p.roi])])}>Exportar CSV</Button>
            <Link href="/admin/products"><Button icon="plus">Nuevo producto</Button></Link>
          </>
        }
      />

      {msg && (
        <p className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
          {msg} <Link href="/admin/imports" className="font-medium underline">Ir a Importaciones</Link>
        </p>
      )}

      <SectionCard
        title="Productos en stock"
        description={`${filtrados.length} de ${products.length} productos (data real 2024).`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input type="search" placeholder="Buscar por SKU o nombre…" aria-label="Buscar" className={inputClass}
              value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className={selectClass} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
            <option value="all">Todas las categorías</option>
            {["Gases", "Electrodos", "Antorchas", "Reguladores", "Repuestos"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={selectClass} value={alm} onChange={(e) => setAlm(e.target.value)} aria-label="Almacén">
            <option value="all">Todos los almacenes</option>
            {["Lechería", "Cumaná"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>

        <div className="sumi-scroll max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="py-2.5 pr-3 font-medium">SKU</th>
                <th className="py-2.5 pr-3 font-medium">Producto</th>
                <th className="py-2.5 pr-3 font-medium">Almacén</th>
                <th className="py-2.5 pr-3 text-right font-medium">Precio</th>
                <th className="py-2.5 pr-3 text-right font-medium">Stock</th>
                <th className="py-2.5 pr-3 text-right font-medium">ROI</th>
                <th className="py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted">Sin resultados para la búsqueda/filtros.</td></tr>
              )}
              {filtrados.map((p) => (
                <tr key={p.sku} className="hover:bg-surface-2">
                  <td className="py-2.5 pr-3 font-mono text-xs text-muted">{p.sku}</td>
                  <td className="py-2.5 pr-3 text-text">{p.nombre}</td>
                  <td className="py-2.5 pr-3 text-muted">{p.alm}</td>
                  <td className="py-2.5 pr-3 text-right text-text">${p.precio.toFixed(2)}</td>
                  <td className="py-2.5 pr-3 text-right text-text">{p.stock}</td>
                  <td className="py-2.5 pr-3 text-right"><span className="font-medium text-ok">{p.roi}%</span></td>
                  <td className="py-2.5">
                    {p.stock <= p.min ? <StatusBadge tone="danger">Stock crítico</StatusBadge> : <StatusBadge tone="ok">Disponible</StatusBadge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
