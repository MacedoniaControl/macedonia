"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarOrdenes, crearOrden, recibir, type Orden as OrdenDb } from "@/lib/compras/compras-db";
import { listarProveedores, type Proveedor } from "@/lib/directorio/directorio-db";
import { inventarioDe, type ItemInventario } from "@/lib/inventory/inventario-db";
import { crearProducto } from "@/lib/inventory/productos-db";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { PanelProveedores } from "./PanelProveedores";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { InputMonto } from "@/components/ui/InputMonto";
import { fmtUsd } from "@/lib/ux/format";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";


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
const inputClass = "sumi-campo";

// «Descargar» baja la pestaña abierta: las órdenes o los proveedores.
export default function PurchasesPage() {
  return <ProveedorExportar><Compras /></ProveedorExportar>;
}

function Compras() {
  const empresaKey = useEmpresaActiva();
  // Las ordenes viven en la base y el estado se DEDUCE de cuanto llego:
  // nadie tiene que acordarse de marcar "recibida parcial".
  const [recarga, setRecarga] = useState(0);
  const [tab, setTab] = useState<"ordenes" | "proveedores">("ordenes");
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarOrdenes(empresaKey));
  const ordenes: OrdenDb[] = carga.datos ?? [];
  // Proveedores y productos salen de la BASE. Antes eran dos listas escritas a
  // mano en este archivo: se podia armar una orden a un proveedor inexistente.
  const cargaProv = useCarga(`prov:${empresaKey}:${recarga}`, () => listarProveedores());
  const proveedores: Proveedor[] = cargaProv.datos ?? [];
  const cargaInv = useCarga(`inv:${empresaKey}:${recarga}`, () => inventarioDe(empresaKey));
  const productos: ItemInventario[] = cargaInv.datos ?? [];

  const [o, setO] = useState({
    proveedor: "", codigo: "", cantidad: 1, costo: 0,
    fecha: new Date().toISOString().slice(0, 10), nota: "",
  });
  const [msg, setMsg] = useState("");
  const [nuevoProd, setNuevoProd] = useState<{ codigo: string; nombre: string; unidad: string; costo: number } | null>(null);
  const [creando, setCreando] = useState(false);

  async function crear() {
    setMsg("");
    if (!o.proveedor) return setMsg("ERR:Elige el proveedor.");
    if (!o.codigo.trim()) return setMsg("ERR:Elige o escribe el código del producto.");
    if (!(o.cantidad > 0)) return setMsg("ERR:La cantidad debe ser al menos 1.");

    // Si el producto no está en el inventario, no se puede comprar contra la
    // nada: se ofrece crearlo aquí mismo en vez de mandar a otra pantalla y
    // hacer que la orden se cargue dos veces.
    const existe = productos.find((x) => x.codigo === o.codigo.trim());
    if (!existe) {
      setNuevoProd({ codigo: o.codigo.trim(), nombre: "", unidad: "UNIDAD", costo: o.costo });
      return;
    }

    const r = await crearOrden(
      { proveedor: o.proveedor, codigo: existe.codigo, descripcion: existe.nombre, cantidad: o.cantidad, costoUsd: o.costo },
      empresaKey,
    );
    if (!r.ok) return setMsg(`ERR:${r.error}`);

    setRecarga((n) => n + 1);
    setO({ ...o, codigo: "", cantidad: 1, costo: 0, nota: "" });
    setMsg("Orden creada.");
  }

  // Crea el producto y sigue con la orden, sin perder lo que ya se habia
  // escrito. Volver a empezar es la forma mas rapida de que nadie la cargue.
  async function crearYSeguir() {
    if (!nuevoProd || creando) return;
    setCreando(true);
    try {
      const r = await crearProducto(
        { codigo: nuevoProd.codigo, nombre: nuevoProd.nombre, unidad: nuevoProd.unidad, costoUsd: nuevoProd.costo },
        empresaKey,
      );
      if (!r.ok) return setMsg(`ERR:${r.error}`);

      const ro = await crearOrden(
        { proveedor: o.proveedor, codigo: nuevoProd.codigo, descripcion: nuevoProd.nombre, cantidad: o.cantidad, costoUsd: nuevoProd.costo },
        empresaKey,
      );
      if (!ro.ok) return setMsg(`ERR:${ro.error}`);

      setNuevoProd(null);
      setRecarga((n) => n + 1);
      setO({ ...o, codigo: "", cantidad: 1, costo: 0, nota: "" });
      setMsg("Producto creado y orden registrada.");
    } finally {
      setCreando(false);
    }
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
        breadcrumbs={[{ label: "Finanzas" }, { label: "Compras" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="brand">{ordenes.length} orden(es)</StatusBadge>
            <BotonDescargar empresa={empresaKey} />
          </div>
        }
      />
      <div className="sumi-tabs mb-4 flex gap-1 overflow-x-auto">
        {([["ordenes", "Órdenes de Compra"], ["proveedores", "Proveedores"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`min-h-11 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition ${
              tab === id ? "bg-brand-strong text-white" : "border border-border text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "proveedores" && <PanelProveedores todos={proveedores} />}
      {tab === "ordenes" && <ExportaOrdenes ordenes={ordenes} />}

      {tab === "ordenes" && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
        <SectionCard title="Nueva Orden de Compra" description="Los productos salen del inventario de la empresa.">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prov">Proveedor *</label>
              <select id="prov" className={inputClass} value={o.proveedor} onChange={(e) => setO({ ...o, proveedor: e.target.value })}>
                <option value="">Elige…</option>
                {proveedores.map((p) => <option key={p.rif} value={p.nombre}>{p.nombre} · {p.rif}</option>)}
              </select>
              {cargaProv.error && <span className="mt-1 block text-xs text-danger">{cargaProv.error}</span>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="prod">Producto *</label>
              <input
                id="prod"
                list="lista-productos"
                className={inputClass}
                placeholder="Código del producto"
                value={o.codigo}
                // El costo NO se autocompleta: el inventario expone el precio de
                // venta, no el de compra, y el costo real lo trae la factura del
                // proveedor. Ponerle el precio seria adivinar.
                onChange={(e) => setO({ ...o, codigo: e.target.value })}
              />
              <datalist id="lista-productos">
                {productos.slice(0, 800).map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
              </datalist>
              <span className="mt-1 block text-xs text-muted">
                {productos.length.toLocaleString("es-VE")} productos en inventario
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="qty">Cantidad *</label>
                <input id="qty" type="number" min={1} value={o.cantidad}
                  onChange={(e) => setO({ ...o, cantidad: Math.max(1, Number(e.target.value) || 1) })}
                  className={`${inputClass} tabular-nums`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="costo">Costo unitario USD</label>
                <InputMonto id="costo" valor={o.costo}
                  onChange={(n) => setO({ ...o, costo: Math.max(0, n) })}
                  className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fecha">Fecha</label>
                <input id="fecha" type="date" value={o.fecha}
                  onChange={(e) => setO({ ...o, fecha: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Total</label>
                <p className="flex h-10 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold tabular-nums text-text">
                  {fmtUsd(o.cantidad * o.costo)}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="nota">Nota</label>
              <input id="nota" className={inputClass} value={o.nota}
                onChange={(e) => setO({ ...o, nota: e.target.value })} />
            </div>

            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="purchase" onClick={crear} className="w-full">Crear orden de compra</Button>
          </div>
        </SectionCard>

        <SectionCard title="Órdenes" description="Registra recepciones totales o parciales.">
          <EstadoDatos
            cargando={carga.cargando}
            error={carga.error}
            vacio={ordenes.length === 0}
            tituloVacio="Sin Órdenes de Compra"
            mensajeVacio="Crea una con el formulario de al lado."
          >
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
          </EstadoDatos>
        </SectionCard>
      </div>
      )}

      {/* El producto no existe todavia. En vez de mandar a Inventario y hacer
          que la orden se cargue dos veces, se crea aquí y la compra sigue. */}
      {nuevoProd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          role="dialog" aria-modal="true" aria-label="Producto nuevo">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="font-display text-lg font-semibold text-text">Ese producto no está en el inventario</h2>
            <p className="mt-1 text-sm text-muted">
              El código <span className="font-mono text-text">{nuevoProd.codigo}</span> no existe en esta empresa.
              Créalo aquí y la orden se registra enseguida.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Código</span>
                <input className={`${inputClass} font-mono`} value={nuevoProd.codigo}
                  onChange={(e) => setNuevoProd({ ...nuevoProd, codigo: e.target.value })} />
                <span className="mt-1 block text-[11px] text-muted">
                  Distingue mayúsculas: 6x8AT y 6X8AT son productos distintos.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Nombre *</span>
                <input className={inputClass} value={nuevoProd.nombre} autoFocus
                  onChange={(e) => setNuevoProd({ ...nuevoProd, nombre: e.target.value })} />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Unidad</span>
                  <input className={inputClass} value={nuevoProd.unidad}
                    onChange={(e) => setNuevoProd({ ...nuevoProd, unidad: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Costo USD</span>
                  <InputMonto className={inputClass} valor={nuevoProd.costo}
                    onChange={(n) => setNuevoProd({ ...nuevoProd, costo: Math.max(0, n) })} />
                </label>
              </div>
            </div>

            {msg.startsWith("ERR:") && (
              <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {msg.replace("ERR:", "")}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button icon="plus" className="flex-1" disabled={creando || !nuevoProd.nombre.trim()}
                onClick={crearYSeguir}>
                {creando ? "Creando…" : "Crear producto y registrar orden"}
              </Button>
              <Button variant="secondary" onClick={() => { setNuevoProd(null); setMsg(""); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Las órdenes como se listan: todas, de la más reciente a la más antigua. */
function ExportaOrdenes({ ordenes }: { ordenes: OrdenDb[] }) {
  useExportable(() => ({
    modulo: "",
    seccion: "Órdenes de Compra",
    titulo: "Órdenes de Compra",
    detalle: [`${ordenes.filter((o) => o.estado !== "recibida").length} orden(es) con mercancía por recibir`],
    columnas: [
      { titulo: "N°", tipo: "codigo" }, { titulo: "Fecha", tipo: "fecha" }, { titulo: "Proveedor" }, { titulo: "Código", tipo: "codigo" },
      { titulo: "Producto" }, { titulo: "Cantidad", tipo: "num" }, { titulo: "Recibido", tipo: "num" }, { titulo: "Pendiente", tipo: "num" },
      { titulo: "Costo (USD)", tipo: "usd" }, { titulo: "Total (USD)", tipo: "usd" }, { titulo: "Estado" },
    ],
    filas: ordenes.map((o) => [
      o.correlativo, fechaVista(o.fecha), o.proveedor, o.codigo, o.descripcion, o.cantidad, o.recibido, o.pendiente,
      o.costoUsd, o.cantidad * o.costoUsd, etiqueta[o.estado] ?? o.estado,
    ]),
    totales: ["", "", `Total · ${ordenes.length} orden(es)`, "", "", null, null, null, null, ordenes.reduce((a, o) => a + o.cantidad * o.costoUsd, 0), ""],
  }));
  return null;
}
