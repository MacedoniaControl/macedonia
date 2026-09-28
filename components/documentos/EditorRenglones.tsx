"use client";

// Los productos de un documento de venta (cotización, nota de entrega): el
// buscador del catálogo, el escáner, los gases a un toque, los renglones
// editables y el renglón libre para lo que no está en el catálogo.
//
// Lo comparten Cotizaciones y Notas de Entrega para que se usen igual: mismo
// orden, mismos controles, mismas reglas (un producto repetido suma cantidad;
// un precio en cero se marca en rojo).
//
// Los renglones se acomodan según el ancho de la TARJETA, no de la pantalla
// (container queries): angosta, cada renglón es un bloque; ancha, una fila.

import { useState, type Dispatch, type SetStateAction } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { InputMonto } from "@/components/ui/InputMonto";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Icon } from "@/components/ui/Icon";
import { fmtUsd } from "@/lib/ux/format";
import { UNIDADES } from "@/lib/ux/catalogos";
import { ScanBar } from "@/components/inventory/ScanBar";
import { ProductSearch } from "@/components/inventory/ProductSearch";
import { escanear, mensajeDeEscaneo, type ProductoEscaneado } from "@/lib/inventory/escanear";
import { beep } from "@/lib/inventory/scan-feedback";

export type Renglon = { codigo: string; descripcion: string; cantidad: number; precio: number; descuento: number; unidad: string };

export const totalRenglon = (l: Pick<Renglon, "cantidad" | "precio" | "descuento">) => l.cantidad * l.precio * (1 - (l.descuento || 0) / 100);

const campo = "sumi-campo";
const COLUMNAS = "@xl:grid-cols-[minmax(0,1fr)_5.5rem_7rem_4.5rem_6.5rem_2.25rem]";
const vacio = (): Renglon => ({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0, unidad: "UNIDAD" });

export function EditorRenglones({
  empresa, numero, lineas, setLineas, gases = [], className = "", onCambio,
}: {
  empresa: string;
  /** El número previsto del documento, arriba a la derecha. */
  numero: string;
  lineas: Renglon[];
  setLineas: Dispatch<SetStateAction<Renglon[]>>;
  /** Gases para agregar a un toque (Cotizaciones). */
  gases?: string[];
  className?: string;
  /** Cualquier cambio en los renglones (para limpiar avisos de afuera). */
  onCambio?: () => void;
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [libre, setLibre] = useState<Renglon | null>(null);

  function agregar(p: ProductoEscaneado, origen: "escáner" | "buscador" | "gas") {
    onCambio?.();
    // Forma funcional: entre que salió la consulta y volvió, pudo entrar otra
    // lectura. Leer `lineas` de la clausura la perdería en silencio.
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.codigo && l.codigo === p.codigo);
      if (i >= 0) {
        const nueva = prev[i].cantidad + 1;
        setAviso({ ok: true, text: `${p.nombre} · cantidad ${nueva}` });
        return prev.map((l, j) => (j === i ? { ...l, cantidad: nueva } : l));
      }
      setAviso({ ok: true, text: p.precio > 0 ? `${p.nombre} agregado (${origen})` : `${p.nombre} agregado · falta el precio` });
      return [...prev, { codigo: p.codigo, descripcion: p.nombre, cantidad: 1, precio: p.precio, descuento: 0, unidad: p.unidad ?? "UNIDAD" }];
    });
  }
  async function onScan(codigo: string) {
    const r = await escanear(codigo, empresa);
    if (r.estado !== "encontrado") { beep(false); setAviso(mensajeDeEscaneo(r)); return; }
    beep(true);
    agregar(r.producto, "escáner");
  }
  const upd = (i: number, patch: Partial<Renglon>) => {
    onCambio?.();
    // Con el precio ya escrito, el aviso de «falta el precio» sobra.
    if (patch.precio && patch.precio > 0) setAviso((a) => (a?.text.includes("falta el precio") ? null : a));
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const quitar = (i: number) => { onCambio?.(); setLineas((prev) => prev.filter((_, j) => j !== i)); };
  function agregarLibre() {
    if (!libre) return;
    if (!libre.descripcion.trim()) return setAviso({ ok: false, text: "Escribe la descripción del renglón." });
    if (!(libre.precio > 0)) return setAviso({ ok: false, text: "Indica el precio del renglón." });
    onCambio?.();
    setLineas((prev) => [...prev, { ...libre, descripcion: libre.descripcion.trim(), codigo: libre.codigo.trim() }]);
    setAviso({ ok: true, text: `${libre.descripcion.trim()} agregado` });
    setLibre(null);
  }

  return (
    <SectionCard title="Productos" className={className}
      action={<span className="font-mono text-xs text-muted">N° {numero}</span>}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">Buscar en el catálogo</label>
          <ProductSearch onPick={(p) => agregar(p, "buscador")} />
        </div>
        <button type="button" onClick={() => setEscaneando((v) => !v)} aria-pressed={escaneando} aria-label="Escanear código"
          className={`flex h-11 flex-none items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition ${escaneando
            ? "border-brand-strong bg-brand-soft text-brand" : "border-border-strong bg-surface text-text hover:bg-surface-2"}`}>
          <Icon name="scan" size={16} />
          <span className="hidden sm:inline">{escaneando ? "Escaneando…" : "Escanear"}</span>
        </button>
      </div>
      {escaneando && <div className="mt-3"><ScanBar onScan={onScan} hint="Dispara el lector: el producto se agrega solo." /></div>}

      {gases.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted">Gases</span>
          {gases.map((g) => (
            <button key={g} type="button"
              onClick={() => agregar({ codigo: g, nombre: g, precio: 0, unidad: "CILINDRO" } as ProductoEscaneado, "gas")}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-text transition hover:border-brand/40 hover:bg-brand-soft/40">
              <Icon name="plus" size={12} />{g}
            </button>
          ))}
        </div>
      )}

      {aviso && (
        <p role="status" className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
          <Icon name={aviso.ok ? "check" : "alert"} size={14} /> {aviso.text}
        </p>
      )}

      <div className="@container mt-4 border-t border-border">
        {lineas.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-text">Todavía no hay productos</p>
            <p className="mt-1 text-sm text-muted">Busca en el catálogo{gases.length ? ", escanea un código o toca un gas." : " o escanea un código."}</p>
          </div>
        ) : (
          <>
            <div className={`hidden gap-3 border-b border-border py-2 text-[11px] font-medium uppercase tracking-wide text-muted @xl:grid ${COLUMNAS}`}>
              <span>Producto</span><span className="text-right">Cantidad</span><span className="text-right">Precio</span>
              <span className="text-right">Dcto %</span><span className="text-right">Total</span><span />
            </div>
            <ul className="divide-y divide-border">
              {lineas.map((l, i) => (
                <li key={`${l.codigo}-${i}`} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-3 @xl:items-center ${COLUMNAS}`}>
                  <div className="col-start-1 row-start-1 min-w-0 @xl:col-auto @xl:row-auto">
                    <p className="truncate text-sm font-medium text-text">{l.descripcion}</p>
                    <p className="font-mono text-[11px] text-muted">{l.codigo || "renglón libre"} · {l.unidad}</p>
                  </div>
                  <button type="button" aria-label={`Quitar ${l.descripcion}`} onClick={() => quitar(i)}
                    className="col-start-2 row-start-1 flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-muted hover:bg-danger/10 hover:text-danger @xl:order-last @xl:col-auto @xl:row-auto">
                    <Icon name="close" size={16} />
                  </button>
                  <div className="col-span-2 grid grid-cols-3 gap-2 @xl:contents">
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted @xl:sr-only">Cantidad</span>
                      <CampoNumero valor={l.cantidad} onChange={(n) => upd(i, { cantidad: Math.max(n, 0) })}
                        aria-label={`Cantidad de ${l.descripcion}`} className={`${campo} h-10 text-right`} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted @xl:sr-only">Precio</span>
                      <InputMonto valor={l.precio} onChange={(n) => upd(i, { precio: n })} aria-label={`Precio de ${l.descripcion}`}
                        className={`${campo} h-10 text-right ${l.precio <= 0 ? "!border-danger" : ""}`} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted @xl:sr-only">Dcto %</span>
                      <CampoNumero valor={l.descuento} max={100} onChange={(n) => upd(i, { descuento: n })}
                        aria-label={`Descuento de ${l.descripcion}`} className={`${campo} h-10 text-right`} />
                    </label>
                  </div>
                  <p className="col-span-2 text-right text-sm font-semibold tabular-nums text-text @xl:col-span-1">
                    <span className="mr-2 text-xs font-normal text-muted @xl:hidden">Total</span>{fmtUsd(totalRenglon(l))}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Lo que no está en el catálogo: un renglón escrito a mano. */}
      {libre ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-sm font-medium text-text">Renglón libre</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <input className={`${campo} col-span-2 sm:col-span-1`} value={libre.descripcion} placeholder="Descripción *" aria-label="Descripción"
              onChange={(e) => setLibre({ ...libre, descripcion: e.target.value })} />
            <input className={`${campo} col-span-2 sm:col-span-1`} value={libre.codigo} placeholder="Código (opcional)" aria-label="Código"
              onChange={(e) => setLibre({ ...libre, codigo: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <CampoNumero valor={libre.cantidad} onChange={(n) => setLibre({ ...libre, cantidad: n })} aria-label="Cantidad" className={`${campo} text-right`} />
            <select className={campo} value={libre.unidad} aria-label="Unidad" onChange={(e) => setLibre({ ...libre, unidad: e.target.value })}>
              {UNIDADES.map((u) => <option key={u}>{u}</option>)}
            </select>
            <InputMonto valor={libre.precio} onChange={(n) => setLibre({ ...libre, precio: n })} aria-label="Precio" className={`${campo} text-right`} />
          </div>
          <div className="flex gap-2">
            <Button icon="plus" onClick={agregarLibre}>Agregar</Button>
            <Button variant="ghost" onClick={() => setLibre(null)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setLibre(vacio())}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand-soft/40">
          <Icon name="plus" size={14} /> Renglón libre
        </button>
      )}
    </SectionCard>
  );
}
