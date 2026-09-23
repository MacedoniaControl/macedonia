"use client";

// Agregar al conteo algo que no esta en la planilla.
//
// Todo articulo entra identificado: con su codigo de Valery, o con un SKU que
// asigna la base (MC-000001). No hay campo para escribir un codigo a mano.
// Antes de crear un SKU se muestran los productos con nombre parecido: crear
// uno para algo que ya esta en Valery deja el mismo articulo con dos codigos.

import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProductSearch, type ProductoCatalogo } from "@/components/inventory/ProductSearch";
import { useCarga } from "@/lib/ux/use-carga";
import { leerCantidad, vaEntera, fmtCantidad } from "@/lib/inventory/cantidad";
import { crearArticulo, departamentosDe } from "@/lib/inventory/conteos-db";
import type { Fila } from "./Contar";

// Las unidades como las nombra Valery.
const UNIDADES = ["UND", "PAR", "CAJA", "KG", "LBS", "METROS", "MT2", "LITROS", "GALON", "ROLLO", "BLISTER", "SACO", "BOLSA"];

export function AgregarArticulo({ empresa, conteoId, departamento, enPlanilla, onCerrar, onValery, onNuevo }: {
  empresa: string; conteoId: number; departamento: string | null;
  enPlanilla: (codigo: string) => boolean;
  onCerrar: () => void;
  onValery: (p: { codigo: string; nombre: string; unidad: string | null }) => void;
  onNuevo: (f: Fila) => void;
}) {
  const [pestana, setPestana] = useState<"valery" | "nuevo">("valery");
  return (
    <Modal titulo="Agregar artículo" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-muted">Todo artículo del conteo lleva una identificación: la de Valery o un SKU de Macedonia.</p>
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {([["valery", "Está en Valery", "Se identifica con su código"], ["nuevo", "Artículo nuevo", "No está en Valery · recibe SKU"]] as const).map(([id, t, s]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)}
            className={`min-h-12 rounded-lg px-2 py-1.5 text-center ${pestana === id ? "bg-surface shadow-sm" : ""}`}>
            <b className={`block text-sm ${pestana === id ? "text-brand" : "text-text"}`}>{t}</b>
            <span className="block text-[11px] text-muted">{s}</span>
          </button>
        ))}
      </div>
      {pestana === "valery" ? (
        <div className="space-y-3">
          <ProductSearch placeholder="Código de Valery o nombre" onPick={(p: ProductoCatalogo) => onValery(p)} />
          <p className="text-xs text-muted">
            Si ya está en la planilla, te lleva a su renglón. ¿No aparece?{" "}
            <button type="button" className="font-medium text-brand" onClick={() => setPestana("nuevo")}>Cargalo como artículo nuevo →</button>
          </p>
        </div>
      ) : (
        <FormNuevo empresa={empresa} conteoId={conteoId} departamento={departamento} enPlanilla={enPlanilla} onValery={onValery} onNuevo={onNuevo} onCancelar={onCerrar} />
      )}
    </Modal>
  );
}

function FormNuevo({ empresa, conteoId, departamento, enPlanilla, onValery, onNuevo, onCancelar }: {
  empresa: string; conteoId: number; departamento: string | null; enPlanilla: (c: string) => boolean;
  onValery: (p: { codigo: string; nombre: string; unidad: string | null }) => void; onNuevo: (f: Fila) => void; onCancelar: () => void;
}) {
  const deps = useCarga(`dep:${empresa}`, () => departamentosDe(empresa));
  const [f, setF] = useState({ nombre: "", corto: "", cortoTocado: false, depto: departamento ?? "", marca: "", modelo: "", referencia: "", unidad: "", cantidad: "", obs: "" });
  const [parecidos, setParecidos] = useState<ProductoCatalogo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  // "¿Es alguno de estos?": lo que ya existe con nombre parecido.
  const palabras = f.nombre.trim().split(/\s+/).filter((w) => w.length >= 3);
  const busqueda = palabras.slice(0, 3).join(" ");
  useEffect(() => {
    if (!busqueda) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/inventory/search?q=${encodeURIComponent(busqueda)}&empresa=${empresa}`);
        const j = await r.json();
        setParecidos((j.results ?? []).slice(0, 4));
      } catch { setParecidos([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, empresa]);
  // Sin palabras para buscar no se muestra nada, aunque quede la lista anterior.
  const mostrar = busqueda ? parecidos : [];

  const l = leerCantidad(f.cantidad);
  const eco = l.estado === "error" ? l.msg : l.estado === "vacio" ? "" : l.estado === "cero" ? "Cero: no hay ninguno"
    : vaEntera(f.unidad) && !Number.isInteger(l.valor) ? `¿${fmtCantidad(l.valor)}? ${f.unidad} no lleva decimales.` : `Son ${fmtCantidad(l.valor)} ${f.unidad}`;

  async function guardar() {
    setError(null);
    const faltan = [!f.nombre.trim() && "el nombre", !f.depto && "el departamento", !f.unidad && "la unidad",
      l.estado === "vacio" && "la cantidad contada (si no hay ninguno, poné 0)"].filter(Boolean);
    if (faltan.length) return setError(`Falta ${faltan.join(", ")}.`);
    if (l.estado === "error") return setError(l.msg);
    setYendo(true);
    try {
      const cantidad = l.estado === "vacio" ? 0 : l.valor;
      const r = await crearArticulo(conteoId, empresa, {
        nombre: f.nombre, unidad: f.unidad, departamento: f.depto, nombreCorto: f.corto, marca: f.marca,
        modelo: f.modelo, referencia: f.referencia, cantidad, observacion: f.obs,
      });
      if (!r.ok) return setError(r.error);
      onNuevo({ renglon: null, codigo: r.codigo, nombre: f.nombre.trim().toUpperCase(), unidad: f.unidad, sistema: 0, departamento: f.depto, extra: true,
        texto: fmtCantidad(cantidad), obs: f.obs, guardado: { cantidad, obs: f.obs.trim() }, estado: "" });
    } finally { setYendo(false); }
  }

  const campo = (label: string, el: ReactNode, req = false, ayuda?: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}{req && <span className="text-danger"> *</span>}</span>
      {el}
      {ayuda && <span className="mt-1 block text-[11px] text-muted">{ayuda}</span>}
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-brand/50 bg-brand/5 px-3 py-2.5">
        <span className="text-xs text-muted">Código que recibe</span>
        <span className="font-mono text-sm font-semibold text-brand">MC-…… lo asigna el sistema al guardar</span>
      </div>
      {campo("Nombre", <input className="sumi-campo" value={f.nombre} placeholder="Ej: DADO HEXAGONAL 1/2x13MM TOTAL"
        onChange={(e) => set({ nombre: e.target.value, ...(f.cortoTocado ? {} : { corto: e.target.value.toUpperCase() }) })} />, true)}
      {mostrar.length > 0 && (
        <div className="space-y-2 rounded-xl bg-warn/10 p-3">
          <p className="text-sm font-medium text-warn">¿Es alguno de estos? Si está en Valery, usá ese código en vez de crear uno nuevo.</p>
          {mostrar.map((p) => (
            <button key={p.codigo} type="button" onClick={() => onValery(p)}
              className="grid w-full grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-brand">
              <span className="font-mono text-xs text-muted">{p.codigo}</span><span className="truncate">{p.nombre}</span>
              <span className="text-xs font-semibold text-brand">{enPlanilla(p.codigo) ? "Ya está · ir" : "Usar este"}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("Nombre corto", <input className="sumi-campo" value={f.corto} onChange={(e) => set({ corto: e.target.value, cortoTocado: true })} />, false, "Se copia del nombre; cambialo si hace falta.")}
        {campo("Departamento", (
          <select className="sumi-campo" value={f.depto} onChange={(e) => set({ depto: e.target.value })}>
            <option value="">Elegí uno…</option>
            {(deps.datos ?? []).filter((d) => d.seCuenta).map((d) => <option key={d.codigo} value={d.codigo}>{d.codigo} - {d.nombre}</option>)}
          </select>
        ), true)}
        {campo("Marca", <input className="sumi-campo" value={f.marca} placeholder="Ej: TOTAL" onChange={(e) => set({ marca: e.target.value })} />)}
        {campo("Modelo", <input className="sumi-campo" value={f.modelo} onChange={(e) => set({ modelo: e.target.value })} />)}
        {campo("Referencia", <input className="sumi-campo" value={f.referencia} placeholder="Ej: DADO" onChange={(e) => set({ referencia: e.target.value })} />)}
        {campo("Unidad", (
          <select className="sumi-campo" value={f.unidad} onChange={(e) => set({ unidad: e.target.value })}>
            <option value="">Elegí una…</option>
            {UNIDADES.map((u) => <option key={u}>{u}</option>)}
          </select>
        ), true)}
        {campo("Cantidad contada", <input className="sumi-campo" inputMode="decimal" value={f.cantidad} placeholder="0" onChange={(e) => set({ cantidad: e.target.value })} />, true, eco || undefined)}
        {campo("Observación", <input className="sumi-campo" value={f.obs} placeholder="Opcional" onChange={(e) => set({ obs: e.target.value })} />)}
      </div>
      <p className="rounded-xl bg-info/10 px-3 py-2 text-xs text-info">
        <b>Costos, precios e IVA no se piden acá.</b> Quien cuenta no siempre puede ver costos. El artículo queda con la ficha incompleta y se termina en Productos.
      </p>
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button icon="plus" cargando={yendo} textoCargando="Creando…" onClick={guardar}>Agregar al conteo</Button>
      </div>
    </div>
  );
}
