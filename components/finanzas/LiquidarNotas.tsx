"use client";

// Liquidar varias notas de un cliente con un solo pago.
//
// Se elige el cliente, se marcan las notas que paga (o todas), se registra el
// pago una vez —fecha, método, referencia, nota y el comprobante— y cada nota
// queda liquidada por su saldo completo. La base lo hace todo junto o nada
// (migración 33) y deja el registro con su número LQ-AAAA-NNNNNN.
//
// Con «Monto del pago» el sistema reparte (migración 41): salda las notas que
// alcanza, de la más vieja a la más nueva, y abona lo que sobra a la de mayor
// saldo, en la misma liquidación. La persona puede cambiar las notas y a cuál
// va el restante.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { liquidarCuentas } from "@/lib/finanzas/liquidaciones-db";
import { clientesConDeuda, pendiente, totalElegido, type CuentaLiquidable } from "@/lib/finanzas/liquidar";
import { evaluarReparto, repartoInicial, type NotaPago } from "@/lib/finanzas/repartir-pago";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto } from "@/lib/ux/monto";
import { fmtUsd } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const METODOS = ["Transferencia", "Pago móvil", "Efectivo", "Zelle", "Punto de venta", "Depósito", "Otro"];

// Las palabras de cada cartera: en por pagar son cuentas de un proveedor.
const PALABRAS = {
  cobrar: { quien: "Cliente", doc: "nota", Doc: "Nota", total: "el total por cobrar" },
  pagar: { quien: "Proveedor", doc: "cuenta", Doc: "Cuenta", total: "el total por pagar" },
} as const;

export function LiquidarNotas({ empresa, cuentas, clienteInicial, idsIniciales, pagoInicial, onHecho, onCerrar, tipo = "cobrar" }: {
  tipo?: "cobrar" | "pagar";
  empresa: string;
  cuentas: CuentaLiquidable[];
  clienteInicial?: string;
  /** Qué notas vienen marcadas (por defecto, todas las del cliente). */
  idsIniciales?: number[];
  /** Lo que ya se escribió del pago (al venir de «Registrar abono»). */
  pagoInicial?: { fecha?: string; metodo?: string; referencia?: string; monto?: number };
  onHecho: (texto: string) => void;
  onCerrar: () => void;
}) {
  const w = PALABRAS[tipo];
  const clientes = clientesConDeuda(cuentas);
  const [cliente, setCliente] = useState(() => clientes.find((g) => g.cliente.toUpperCase() === clienteInicial?.trim().toUpperCase())?.cliente ?? "");
  const grupo = clientes.find((g) => g.cliente === cliente);
  const aPago = (cs: CuentaLiquidable[]): NotaPago[] => cs.map((c) => ({ id: c.id, documento: c.documento, vence: c.vence, pendiente: pendiente(c) }));
  // Un pago que llega con monto (desde «Registrar abono») ya viene repartido.
  const inicial = pagoInicial?.monto ? repartoInicial(aPago(grupo?.cuentas ?? []), pagoInicial.monto, idsIniciales ?? []) : null;
  const [elegidas, setElegidas] = useState<Set<number>>(() => new Set(inicial ? inicial.saldadas :
    (grupo?.cuentas ?? []).filter((c) => !idsIniciales?.length || idsIniciales.includes(c.id)).map((c) => c.id)));
  const [montoPago, setMontoPago] = useState(pagoInicial?.monto ? String(pagoInicial.monto).replace(".", ",") : "");
  const [destino, setDestino] = useState<number | null>(inicial?.destino ?? null);
  const [fecha, setFecha] = useState(pagoInicial?.fecha || hoy());
  const [metodo, setMetodo] = useState(pagoInicial?.metodo?.trim() || "Transferencia");
  const [referencia, setReferencia] = useState(pagoInicial?.referencia ?? "");
  const [nota, setNota] = useState("");
  const [imagen, setImagen] = useState<File | null>(null);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const notas = grupo?.cuentas ?? [];
  const pago = montoPago.trim() ? parseMonto(montoPago) : null;
  const reparto = pago !== null && pago > 0 ? evaluarReparto(aPago(notas), pago, elegidas, destino, fmtUsd) : null;
  const total = reparto ? (reparto.error ? totalElegido(notas, elegidas) : pago!) : totalElegido(notas, elegidas);
  const notaDestino = reparto?.destino != null ? notas.find((c) => c.id === reparto.destino) : undefined;
  function cambiarMonto(t: string) {
    setMontoPago(t); setError(null);
    const n = t.trim() ? parseMonto(t) : null;
    if (n !== null && n > 0) {
      const p = repartoInicial(aPago(notas), n, idsIniciales ?? []);
      setElegidas(new Set(p.saldadas)); setDestino(p.destino);
    }
  }
  const todas = notas.length > 0 && notas.every((c) => elegidas.has(c.id));

  function elegirCliente(c: string) {
    setCliente(c); setError(null); setMontoPago(""); setDestino(null);
    // Al elegir el cliente se marcan todas: lo común es que pague todo lo pendiente.
    setElegidas(new Set(clientes.find((g) => g.cliente === c)?.cuentas.map((x) => x.id) ?? []));
  }
  const alternar = (id: number) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function validar(): string | null {
    if (!grupo) return `Elige el ${w.quien.toLowerCase()}.`;
    if (!elegidas.size) return `Marca al menos una ${w.doc}.`;
    if (!fecha || fecha > hoy()) return "La fecha del pago no puede ser posterior a hoy.";
    if (montoPago.trim() && (pago === null || pago <= 0)) return "No se entiende el monto del pago. Ejemplo: 1.500,50";
    if (reparto?.error) return reparto.error;
    return null;
  }

  async function liquidar() {
    setGuardando(true); setError(null);
    try {
      const restante = reparto && reparto.restante > 0 && reparto.destino !== null ? { cuentaId: reparto.destino, monto: reparto.restante } : null;
      const r = await liquidarCuentas(empresa, [...elegidas], { fecha, metodo, referencia, nota, imagen }, tipo, restante);
      if (!r.ok) return setError(r.error);
      onHecho(`${r.numero}: ${r.cuentas} ${w.doc}(s) de ${cliente} liquidadas por ${fmtUsd(r.total)}`
        + (restante ? ` y ${fmtUsd(restante.monto)} abonados a ${notaDestino?.documento ?? "otra"}.` : "."));
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liquidar.");
    } finally {
      setGuardando(false);
    }
  }

  if (!clientes.length) {
    return <p className="py-6 text-center text-sm text-muted">No hay {w.doc}s pendientes para liquidar.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={lbl}>{w.quien}</span>
        <select className={campo} value={cliente} onChange={(e) => elegirCliente(e.target.value)}>
          <option value="">Elige el {w.quien.toLowerCase()}…</option>
          {clientes.map((g) => <option key={g.cliente} value={g.cliente}>{g.cliente} · {g.cuentas.length} {w.doc}(s) · {fmtUsd(g.total)}</option>)}
        </select>
      </label>

      {grupo && (
        <div className="space-y-2">
          <CampoMonto etiqueta={`Monto del pago (opcional) · se debe ${fmtUsd(grupo.total)}`} valor={montoPago} onChange={cambiarMonto} />
          {reparto && !reparto.error && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-text">
              <p>Se saldan <b>{elegidas.size} {w.doc}(s)</b> por <b className="tabular-nums">{fmtUsd(reparto.suma)}</b>.</p>
              {reparto.restante > 0 && (
                <label className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span>Restante <b className="tabular-nums">{fmtUsd(reparto.restante)}</b> se abona a</span>
                  <select className="sumi-campo sumi-campo--auto py-1 text-xs" value={reparto.destino ?? ""} onChange={(e) => setDestino(Number(e.target.value))}>
                    {reparto.destinos.map((id) => {
                      const c = notas.find((x) => x.id === id)!;
                      return <option key={id} value={id}>{c.documento} · saldo {fmtUsd(pendiente(c))}</option>;
                    })}
                  </select>
                </label>
              )}
              <p className="mt-1.5 text-muted">Después del pago {cliente} queda debiendo <b className="tabular-nums text-text">{fmtUsd(reparto.quedaDebiendo)}</b>.</p>
            </div>
          )}
          {reparto?.error && <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">{reparto.error}</p>}
        </div>
      )}

      {grupo && (
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium text-text">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={todas}
                onChange={() => setElegidas(todas ? new Set() : new Set(notas.map((c) => c.id)))} />
              Todas ({notas.length})
            </label>
            <span className="text-sm text-muted">{elegidas.size} elegida(s) · <b className="text-text">{fmtUsd(total)}</b></span>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {notas.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs text-text">{c.documento}</span>
                    <span className="block text-xs text-muted">emitida {fechaVista(c.emitida)} · vence {fechaVista(c.vence)}</span>
                  </span>
                  {reparto?.destino === c.id && reparto.restante > 0 && (
                    <span className="rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">abono {fmtUsd(reparto.restante)}</span>
                  )}
                  <span className="font-semibold tabular-nums text-text">{fmtUsd(pendiente(c))}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Fecha del pago</span>
          <input type="date" className={campo} value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="block">
          <span className={lbl}>Método</span>
          <select className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Referencia</span>
          <input className={campo} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de operación" />
        </label>
        <label className="block">
          <span className={lbl}>Nota</span>
          <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
        </label>
      </div>

      <label onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); const f = e.dataTransfer.files?.[0]; if (f) setImagen(f); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition
          ${encima ? "border-brand bg-brand-soft" : "border-border-strong bg-surface-2 hover:bg-surface"}`}>
        <span className="text-sm font-medium text-text">{imagen ? imagen.name : "Comprobante de pago (foto o PDF)"}</span>
        <span className="text-xs text-muted">{imagen ? "Toca para cambiarlo" : "Suéltalo aquí o toca para elegirlo · opcional"}</span>
        <input type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Comprobante de pago"
          onChange={(e) => setImagen(e.target.files?.[0] ?? null)} />
      </label>

      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          title={`¿Liquidar las ${w.doc}s?`}
          message={`${elegidas.size} ${w.doc}(s) de ${cliente || "—"} por ${fmtUsd(reparto ? reparto.suma : total)}, pagadas el ${fechaVista(fecha)}. Cada una queda liquidada`
            + (reparto && reparto.restante > 0 && notaDestino ? ` y ${fmtUsd(reparto.restante)} se abonan a ${notaDestino.documento}` : "")
            + `. ${w.total[0].toUpperCase()}${w.total.slice(1)} baja en ${fmtUsd(total)}.`}
          confirmLabel="Sí, liquidar"
          cancelLabel="No"
          onConfirm={liquidar}
          trigger={(abrir) => (
            <Button icon="check" className="flex-1" disabled={guardando}
              onClick={() => { const e = validar(); if (e) return setError(e); setError(null); abrir(); }}>
              {guardando ? "Liquidando…" : reparto && reparto.restante > 0
                ? `Liquidar ${elegidas.size} ${w.doc}(s) + abono · ${fmtUsd(total)}`
                : `Liquidar ${elegidas.size} ${w.doc}(s) · ${fmtUsd(total)}`}
            </Button>
          )}
        />
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}
