"use client";

// Liquidar varias notas de un cliente con un solo pago.
//
// Se elige el cliente, se marcan las notas que paga (o todas), se registra el
// pago una vez —fecha, método, referencia, nota y el comprobante— y cada nota
// queda liquidada por su saldo completo. La base lo hace todo junto o nada
// (migración 33) y deja el registro con su número LQ-AAAA-NNNNNN.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { liquidarCuentas } from "@/lib/finanzas/liquidaciones-db";
import { clientesConDeuda, pendiente, totalElegido, type CuentaLiquidable } from "@/lib/finanzas/liquidar";
import { fmtUsd } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const METODOS = ["Transferencia", "Pago móvil", "Efectivo", "Zelle", "Punto de venta", "Depósito", "Otro"];

export function LiquidarNotas({ empresa, cuentas, clienteInicial, onHecho, onCerrar }: {
  empresa: string;
  cuentas: CuentaLiquidable[];
  clienteInicial?: string;
  onHecho: (texto: string) => void;
  onCerrar: () => void;
}) {
  const clientes = clientesConDeuda(cuentas);
  const [cliente, setCliente] = useState(() => clientes.find((g) => g.cliente.toUpperCase() === clienteInicial?.trim().toUpperCase())?.cliente ?? "");
  const grupo = clientes.find((g) => g.cliente === cliente);
  const [elegidas, setElegidas] = useState<Set<number>>(() => new Set(grupo?.cuentas.map((c) => c.id) ?? []));
  const [fecha, setFecha] = useState(hoy());
  const [metodo, setMetodo] = useState("Transferencia");
  const [referencia, setReferencia] = useState("");
  const [nota, setNota] = useState("");
  const [imagen, setImagen] = useState<File | null>(null);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const notas = grupo?.cuentas ?? [];
  const total = totalElegido(notas, elegidas);
  const todas = notas.length > 0 && notas.every((c) => elegidas.has(c.id));

  function elegirCliente(c: string) {
    setCliente(c); setError(null);
    // Al elegir el cliente se marcan todas: lo común es que pague todo lo pendiente.
    setElegidas(new Set(clientes.find((g) => g.cliente === c)?.cuentas.map((x) => x.id) ?? []));
  }
  const alternar = (id: number) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function validar(): string | null {
    if (!grupo) return "Elige el cliente.";
    if (!elegidas.size) return "Marca al menos una nota.";
    if (!fecha || fecha > hoy()) return "La fecha del pago no puede ser posterior a hoy.";
    return null;
  }

  async function liquidar() {
    setGuardando(true); setError(null);
    try {
      const r = await liquidarCuentas(empresa, [...elegidas], { fecha, metodo, referencia, nota, imagen });
      if (!r.ok) return setError(r.error);
      onHecho(`${r.numero}: ${r.cuentas} nota(s) de ${cliente} liquidadas por ${fmtUsd(r.total)}.`);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liquidar.");
    } finally {
      setGuardando(false);
    }
  }

  if (!clientes.length) {
    return <p className="py-6 text-center text-sm text-muted">No hay notas pendientes para liquidar.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={lbl}>Cliente</span>
        <select className={campo} value={cliente} onChange={(e) => elegirCliente(e.target.value)}>
          <option value="">Elige el cliente…</option>
          {clientes.map((g) => <option key={g.cliente} value={g.cliente}>{g.cliente} · {g.cuentas.length} nota(s) · {fmtUsd(g.total)}</option>)}
        </select>
      </label>

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
          title="¿Liquidar las notas?"
          message={`${elegidas.size} nota(s) de ${cliente || "—"} por ${fmtUsd(total)}, pagadas el ${fechaVista(fecha)}. Cada una queda liquidada y el total por cobrar baja en ${fmtUsd(total)}.`}
          confirmLabel="Sí, liquidar"
          cancelLabel="No"
          onConfirm={liquidar}
          trigger={(abrir) => (
            <Button icon="check" className="flex-1" disabled={guardando}
              onClick={() => { const e = validar(); if (e) return setError(e); setError(null); abrir(); }}>
              {guardando ? "Liquidando…" : `Liquidar ${elegidas.size} nota(s) · ${fmtUsd(total)}`}
            </Button>
          )}
        />
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}
