"use client";

// El historial de una cuenta: que documento es, como va, y con que se abono.
//
// Pedido por Greeg. Antes la lista solo decia cuanto se debe; no habia forma de
// ver si se abono, cuando, con que comprobante, ni de cerrar la cuenta.

import { useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtUsd } from "@/lib/ux/format";
import { parseMonto } from "@/lib/ux/monto";
import { CLASES } from "@/lib/finanzas/retencion";
import {
  detalleCuenta, abonarConComprobante, liquidarCuenta, urlComprobante,
  type CuentaDetalle,
} from "@/lib/finanzas/cuentas-db";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoy = () => new Date().toISOString().slice(0, 10);

export function DetalleCuenta({
  cuentaId, empresa, onCambio, onEditar,
}: {
  cuentaId: number;
  empresa: string;
  onCambio: () => void;
  onEditar: (d: CuentaDetalle) => void;
}) {
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${cuentaId}:${recarga}`, () => detalleCuenta(cuentaId));
  const d = carga.datos ?? null;

  const [abono, setAbono] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [metodo, setMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [imagen, setImagen] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [notaCierre, setNotaCierre] = useState("");

  function refrescar() { setRecarga((n) => n + 1); onCambio(); }

  async function registrar() {
    setMsg(null);
    const n = parseMonto(abono);
    if (n === null) return setMsg("No se entiende ese monto. Ejemplo: 1.500,50");
    if (n <= 0) return setMsg("El abono tiene que ser mayor que cero.");
    setGuardando(true);
    try {
      const r = await abonarConComprobante(cuentaId, empresa, n, { fecha, metodo, referencia, imagen });
      if (!r.ok) return setMsg(r.error ?? "No se pudo registrar.");
      setAbono(""); setMetodo(""); setReferencia(""); setImagen(null);
      refrescar();
    } finally { setGuardando(false); }
  }

  async function verComprobante(ruta: string) {
    const url = await urlComprobante(ruta);
    // Enlace firmado de cinco minutos: el bucket es privado a proposito.
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <EstadoDatos cargando={carga.cargando} error={carga.error} vacio={!d}
      mensajeVacio="No se encontró la cuenta.">
      {d && (
        <div className="grid gap-4">
          {/* ---------- cabecera ---------- */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text">{d.contraparte}</p>
              <p className="font-mono text-xs text-muted">{d.documento}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="muted">
                {CLASES.find((c) => c.id === d.clase)?.label ?? d.clase}
              </StatusBadge>
              <StatusBadge tone={d.estado === "liquidada" ? "ok" : d.saldo <= 0 ? "info" : "warn"}>
                {d.estado === "liquidada" ? "Liquidada" : d.saldo <= 0 ? "Sin saldo" : "Abierta"}
              </StatusBadge>
            </div>
          </div>

          {/* ---------- como va ---------- */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-3 text-center">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Monto</p>
              <p className="text-sm font-semibold tabular-nums text-text">{fmtUsd(d.monto)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Abonado</p>
              <p className="text-sm font-semibold tabular-nums text-ok">{fmtUsd(d.abonado)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Saldo</p>
              <p className={`text-sm font-semibold tabular-nums ${d.saldo > 0 ? "text-text" : "text-ok"}`}>
                {fmtUsd(d.saldo)}
              </p>
            </div>
          </div>

          {/* ---------- desglose fiscal ---------- */}
          <div className="rounded-xl border border-border p-3 text-xs">
            <p className="mb-2 font-medium text-text">Desglose fiscal</p>
            {d.iva === null ? (
              <p className="text-muted">
                Esta cuenta se cargó sin desglose: los archivos de Valery solo traían el
                total. Usá <strong className="text-text">Editar</strong> para cargar la
                base imponible y el IVA, y la retención sale sola.
              </p>
            ) : (
              <dl className="grid gap-1">
                <Fila k="Base imponible" v={fmtUsd(d.baseImponible ?? 0)} />
                <Fila k="IVA" v={fmtUsd(d.iva)} />
                <Fila
                  k={d.aplicaRetencion ? "IVA retenido (75%)" : "IVA retenido"}
                  v={d.aplicaRetencion ? `−${fmtUsd(d.ivaRetenido ?? 0)}` : "no aplica"}
                />
                {/* Greeg pidio ver AMBAS: el total del documento y lo que de
                    verdad se le entrega al proveedor. */}
                <div className="mt-1 border-t border-border pt-1">
                  <Fila k="A pagar al proveedor" v={fmtUsd(d.aPagarProveedor)} fuerte />
                </div>
              </dl>
            )}
          </div>

          {/* ---------- historial ---------- */}
          <div>
            <p className="mb-2 text-sm font-medium text-text">
              Historial {d.abonos.length > 0 && <span className="text-muted">({d.abonos.length})</span>}
            </p>
            {d.abonos.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
                Todavía no se ha abonado nada a esta cuenta.
              </p>
            ) : (
              <ol className="grid gap-2">
                {d.abonos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-3 py-2">
                    <span className="text-xs tabular-nums text-muted">{a.fecha}</span>
                    <span className="text-sm font-semibold tabular-nums text-ok">{fmtUsd(a.monto)}</span>
                    {a.metodo && <span className="text-xs text-muted">{a.metodo}</span>}
                    {a.referencia && <span className="truncate text-xs text-muted">· {a.referencia}</span>}
                    {a.imagenRuta && (
                      <button type="button" onClick={() => verComprobante(a.imagenRuta!)}
                        className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-text hover:border-brand">
                        <Icon name="eye" size={14} /> Comprobante
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {d.estado === "liquidada" ? (
            <div className="rounded-xl border border-ok/30 bg-ok/10 px-3 py-2.5 text-xs text-ok">
              Liquidada el {d.liquidadaEn?.slice(0, 10)} como{" "}
              <strong>{d.liquidadaComo === "total" ? "pago total" : "abono parcial"}</strong>.
              {d.liquidadaNota && <span className="mt-0.5 block text-text">{d.liquidadaNota}</span>}
            </div>
          ) : (
            <>
              {/* ---------- registrar abono ---------- */}
              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-sm font-medium text-text">Registrar abono</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CampoMonto etiqueta="Monto" valor={abono} onChange={setAbono} />
                  <label className="block">
                    <span className={lbl}>Fecha</span>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                  </label>
                  <label className="block">
                    <span className={lbl}>Método</span>
                    <input value={metodo} onChange={(e) => setMetodo(e.target.value)}
                      placeholder="Transferencia, efectivo…" className={campo} />
                  </label>
                  <label className="block">
                    <span className={lbl}>Referencia</span>
                    <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                      placeholder="N° de operación" className={campo} />
                  </label>
                </div>

                <label className="mt-2 block">
                  <span className={lbl}>Comprobante (foto o PDF)</span>
                  <input type="file" accept="image/*,application/pdf"
                    onChange={(e) => setImagen(e.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-muted file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-border file:bg-surface-2 file:px-3 file:text-sm file:text-text" />
                  {imagen && <span className="mt-1 block text-xs text-ok">{imagen.name}</span>}
                </label>

                {msg && (
                  <p role="alert" className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{msg}</p>
                )}
                <Button icon="cash" className="mt-2 w-full" disabled={guardando} onClick={registrar}>
                  {guardando ? "Registrando…" : "Registrar abono"}
                </Button>
              </div>

              {/* ---------- cerrar ---------- */}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon="settings" onClick={() => onEditar(d)}>Editar cuenta</Button>

                {d.saldo <= 0.009 ? (
                  <ConfirmDialog
                    title="¿Liquidar la cuenta?"
                    message={`${d.documento} queda cerrada como pago total. Se puede reabrir después.`}
                    confirmLabel="Sí, liquidar"
                    onConfirm={async () => {
                      const r = await liquidarCuenta(d.id, "total");
                      if (!r.ok) setMsg(r.error ?? null); else refrescar();
                    }}
                    trigger={(abrir) => <Button icon="check" onClick={abrir}>Liquidar (pago total)</Button>}
                  />
                ) : (
                  <ConfirmDialog
                    title="¿Cerrar con saldo pendiente?"
                    message={`Quedan ${fmtUsd(d.saldo)} sin pagar. La cuenta se cierra igual y queda escrito por qué.`}
                    confirmLabel="Sí, cerrar"
                    onConfirm={async () => {
                      const r = await liquidarCuenta(d.id, "abono", notaCierre);
                      if (!r.ok) setMsg(r.error ?? null); else refrescar();
                    }}
                    trigger={(abrir) => (
                      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                        <input value={notaCierre} onChange={(e) => setNotaCierre(e.target.value)}
                          placeholder="Por qué se cierra debiendo" className={`${campo} min-w-0 flex-1`} />
                        <Button variant="secondary" icon="check"
                          onClick={() => {
                            setMsg(null);
                            // Se valida antes de confirmar: enterarse de que
                            // falta el motivo DESPUES de confirmar es peor.
                            if (!notaCierre.trim()) return setMsg("Explicá por qué se cierra con saldo pendiente.");
                            abrir();
                          }}>Cerrar con saldo</Button>
                      </div>
                    )}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </EstadoDatos>
  );
}

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={fuerte ? "font-semibold text-text" : "text-muted"}>{k}</dt>
      <dd className={`tabular-nums ${fuerte ? "font-semibold text-text" : "text-text"}`}>{v}</dd>
    </div>
  );
}
