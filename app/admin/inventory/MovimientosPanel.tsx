"use client";

// Panel "Movimientos de inventario" (dentro del apartado Inventario).
//   INGRESO  → Compras · Ingresos manuales
//   SALIDA   → Ventas  · Salidas manuales
// Ver docs/decisions/inventory-model.md

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScanBar } from "@/components/inventory/ScanBar";
import { ProductSearch } from "@/components/inventory/ProductSearch";
import { escanear, mensajeDeEscaneo, type ProductoEscaneado } from "@/lib/inventory/escanear";
import { registrarMovimiento, listarMovimientos, revertirMovimiento, type MovimientoGuardado, type Direccion } from "@/lib/inventory/movimientos-db";
import { beep } from "@/lib/inventory/scan-feedback";
import { useTableView } from "@/lib/ux/use-table-view";
import { TablePager } from "@/components/ui/TablePager";
import { SortableTh } from "@/components/ui/SortableTh";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA } from "@/lib/ux/catalogos";

const fieldClass = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Date().toISOString().slice(0, 10);

type Filtro = "todos" | "entrada" | "salida";

export function MovimientosPanel({ empresa = "sumigases" }: { empresa?: string }) {
  // Los movimientos vienen de la BASE, no del navegador: el kardex es la fuente
  // de la existencia y tiene que ser el mismo para todos, no uno por máquina.
  const [movs, setMovs] = useState<MovimientoGuardado[]>([]);
  const [ready, setReady] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setReady(false);
    listarMovimientos(empresa)
      .then((m) => { if (vigente) { setMovs(m); setErrorCarga(null); } })
      .catch((e) => { if (vigente) setErrorCarga((e as Error).message); })
      .finally(() => { if (vigente) setReady(true); });
    return () => { vigente = false; };   // al cambiar de empresa, descartar lo viejo
  }, [empresa, recarga]);

  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [alta, setAlta] = useState<Direccion | null>(null);

  // Un fallo de carga NO puede verse como "no hay movimientos": son cosas
  // distintas y confundirlas hace creer que el inventario está vacío.
  const totEntrada = useMemo(() => movs.filter((m) => m.direccion === "entrada").reduce((a, m) => a + m.cantidad, 0), [movs]);
  const totSalida = useMemo(() => movs.filter((m) => m.direccion === "salida").reduce((a, m) => a + m.cantidad, 0), [movs]);
  const visibles = useMemo(() => (filtro === "todos" ? movs : movs.filter((m) => m.direccion === filtro)), [movs, filtro]);

  const acc = useMemo<Record<string, (r: MovimientoGuardado) => string | number>>(
    () => ({
      fecha: (m: MovimientoGuardado) => m.fecha,
      codigo: (m: MovimientoGuardado) => m.codigo,
      nombre: (m: MovimientoGuardado) => m.nombre,
      cantidad: (m: MovimientoGuardado) => (m.direccion === "entrada" ? m.cantidad : -m.cantidad),
      origen: (m: MovimientoGuardado) => m.origen,
    }),
    [],
  );
  const t = useTableView(visibles, acc, 25);

  return (
    <>
      {/* Resumen: las dos ramas del modelo */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={() => setFiltro("entrada")}
          className={`rounded-2xl border p-4 text-left transition ${filtro === "entrada" ? "border-ok bg-ok/5" : "border-border bg-surface hover:bg-surface-2"}`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <span className="text-ok"><Icon name="purchase" size={16} /></span> Ingresos
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ok">
            {ready ? `+${Math.round(totEntrada * 100) / 100}` : <span className="sumi-skeleton block h-7 w-20" />}
          </div>
          <div className="text-xs text-muted">Compras · Ingresos manuales</div>
        </button>

        <button onClick={() => setFiltro("salida")}
          className={`rounded-2xl border p-4 text-left transition ${filtro === "salida" ? "border-danger bg-danger/5" : "border-border bg-surface hover:bg-surface-2"}`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <span className="text-danger"><Icon name="delivery" size={16} /></span> Salidas
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-danger">
            {ready ? `−${Math.round(totSalida * 100) / 100}` : <span className="sumi-skeleton block h-7 w-20" />}
          </div>
          <div className="text-xs text-muted">Ventas · Salidas manuales</div>
        </button>

        <button onClick={() => setFiltro("todos")}
          className={`rounded-2xl border p-4 text-left transition ${filtro === "todos" ? "border-brand bg-brand/5" : "border-border bg-surface hover:bg-surface-2"}`}>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Neto del período</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-text">
            {ready ? Math.round((totEntrada - totSalida) * 100) / 100 : <span className="sumi-skeleton block h-7 w-20" />}
          </div>
          <div className="text-xs text-muted">{movs.length} movimiento(s) · ver todos</div>
        </button>
      </div>

      {/* Alta de movimiento manual */}
      <SectionCard
        title="Registrar movimiento manual"
        action={
          <div className="flex gap-2">
            <Button variant={alta === "entrada" ? "primary" : "secondary"} icon="plus" onClick={() => setAlta(alta === "entrada" ? null : "entrada")}>
              Ingreso
            </Button>
            <Button variant={alta === "salida" ? "primary" : "secondary"} icon="close" onClick={() => setAlta(alta === "salida" ? null : "salida")}>
              Salida
            </Button>
          </div>
        }
      >
        {alta ? (
          <FormMovimiento direccion={alta} empresa={empresa} onDone={() => { setAlta(null); setRecarga((n) => n + 1); }} />
        ) : (
          <p className="text-sm text-muted">
            Elige <strong className="text-text">Ingreso</strong> o <strong className="text-text">Salida</strong> para registrar un movimiento manual.
          </p>
        )}
      </SectionCard>

      <div className="h-4" />

      {/* Libro de movimientos */}
      <SectionCard
        title="Movimientos de inventario"
        description={filtro === "todos" ? "Todos los movimientos." : filtro === "entrada" ? "Solo ingresos." : "Solo salidas."}
        action={
          <select className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
            aria-label="Filtrar movimientos" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="todos">Todos</option>
            <option value="entrada">Ingresos</option>
            <option value="salida">Salidas</option>
          </select>
        }
      >
        {visibles.length === 0 ? (
          <EmptyState title="Sin movimientos" message="Aún no hay movimientos registrados. Los ingresos y salidas aparecerán aquí." />
        ) : (
          <>
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <SortableTh label="Fecha" sortKey="fecha" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Código" sortKey="codigo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Producto" sortKey="nombre" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Cantidad" sortKey="cantidad" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Origen" sortKey="origen" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <th scope="col" className="py-2.5 pr-3 font-medium">Motivo / Documento</th>
                    <th scope="col" className="py-2.5 font-medium">Usuario</th>
                    <th scope="col" className="py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.visible.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-2">
                      <td className="py-2.5 pr-3 text-muted">{m.fecha}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">{m.codigo}</td>
                      <td className="py-2.5 pr-3 text-text">{m.nombre}</td>
                      <td className={`py-2.5 pr-3 text-right font-medium tabular-nums ${m.direccion === "entrada" ? "text-ok" : "text-danger"}`}>
                        {m.direccion === "entrada" ? "+" : "−"}{m.cantidad}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge tone={m.origen === "compra" ? "ok" : m.origen === "venta" ? "info" : "muted"}>
                          {m.origen === "compra" ? "Compra" : m.origen === "venta" ? "Venta" : "Manual"}
                        </StatusBadge>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted">{m.motivo || m.documento || "—"}</td>
                      <td className="py-2.5 text-xs text-muted">{m.usuario}</td>
                      <td className="py-2.5 text-right">
                        {m.origen === "manual" && (
                          <button type="button" aria-label={`Revertir movimiento de ${m.nombre}`} title="Registra un movimiento contrario. No borra el original."
                            onClick={async () => { await revertirMovimiento(m.id, empresa); setRecarga((n) => n + 1); }}
                            className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger">
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePager {...t} etiqueta="movimientos" />
          </>
        )}
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------- alta manual
function FormMovimiento({ direccion, empresa, onDone }: { direccion: Direccion; empresa: string; onDone: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const motivos = direccion === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA;
  const [prod, setProd] = useState<ProductoEscaneado | null>(null);
  const [cantidad, setCantidad] = useState(1);
  // string, no el literal: el valor sale de un <select>, que devuelve string.
  const [motivo, setMotivo] = useState<string>(motivos[0]);
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState("");

  function elegir(p: ProductoEscaneado, origen: string) {
    setProd(p);
    setMsg("");
    setAviso({ ok: true, text: `${p.nombre} seleccionado (${origen})` });
  }
  async function onScan(codigo: string) {
    const r = await escanear(codigo, empresa);
    if (r.estado !== "encontrado") {
      beep(false);
      setAviso(mensajeDeEscaneo(r));
      return;
    }
    beep(true);
    elegir(r.producto, "escáner");
  }

  async function registrar() {
    setMsg("");
    if (!prod) return setMsg("Selecciona un producto (escanéalo o búscalo).");
    if (cantidad <= 0) return setMsg("La cantidad debe ser mayor que cero.");
    if (guardando) return;

    setGuardando(true);
    try {
      // El usuario ya NO se escribe a mano: sale de la sesión del servidor. Antes
      // todo movimiento quedaba firmado como "Greeg V." aunque lo hiciera otro,
      // y eso vuelve inservible el registro de quién movió qué.
      const r = await registrarMovimiento({
        direccion,
        origen: "manual",
        codigo: prod.codigo,
        nombre: prod.nombre,
        cantidad,
        motivo: nota.trim() ? `${motivo} — ${nota.trim()}` : motivo,
      }, empresa);

      if (!r.ok) return setMsg(r.error);
      onDone();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <ScanBar onScan={onScan} hint={`Dispara el lector para elegir el producto del ${direccion === "entrada" ? "ingreso" : "la salida"}.`} />
        <div className="mt-3">
          <label className={lbl}>Buscar en productos y catálogo</label>
          <ProductSearch onPick={(p) => elegir(p, "buscador")} />
        </div>
        {aviso && (
          <p className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
            <Icon name={aviso.ok ? "check" : "alert"} size={14} /> {aviso.text}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className={`rounded-xl border p-3 ${prod ? "border-border bg-surface-2" : "border-dashed border-border"}`}>
          {prod ? (
            <>
              <p className="text-sm font-medium text-text">{prod.nombre}</p>
              {/* La existencia sale del kardex, no del catálogo: mostrarla aquí
                  antes de que haya movimientos daría 0 para todo, y un cero
                  falso confunde más que no mostrar nada. */}
              <p className="font-mono text-xs text-muted">
                {prod.codigo}{prod.unidad ? ` · ${prod.unidad}` : ""}
                {prod.precio > 0 ? ` · $${prod.precio.toFixed(2)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Ningún producto seleccionado todavía.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Cantidad</label>
            <input type="number" min={1} className={fieldClass} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
          </div>
          <div>
            <label className={lbl}>Motivo *</label>
            <select className={fieldClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {motivos.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={lbl}>Detalle (opcional)</label>
          <input className={fieldClass} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. conteo físico del 10/07, cilindro dañado…" />
        </div>

        {msg && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

        <div className="flex gap-2">
          <Button className={direccion === "entrada" ? "bg-ok-strong text-white hover:brightness-90" : "bg-warn-strong text-white hover:brightness-90"}
            icon={direccion === "entrada" ? "plus" : "close"} onClick={registrar} disabled={guardando}>
            Registrar {direccion === "entrada" ? "ingreso" : "salida"}
          </Button>
          <Button variant="secondary" onClick={onDone}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
