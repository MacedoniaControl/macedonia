"use client";

// «Eliminar» en Cuentas por Cobrar y por Pagar (migración 38).
//
//   · Borra la cuenta, sus abonos y sus fotos: NO queda registro.
//   · Lo usan el Owner y un Administrador mientras el Owner lo tenga
//     habilitado (un interruptor por empresa, solo del Owner).
//   · No se elimina lo que está en una liquidación vigente: primero se anula.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/Switch";
import { guardarConfig } from "@/lib/config/config-db";
import { eliminarCuentas } from "@/lib/finanzas/cuentas-db";
import { fmtUsdCentavos } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

/** Clave de la configuración. Sin valor guardado se toma como habilitado. */
export const CLAVE_ELIMINAR = "eliminar_cuentas";
export const eliminarHabilitado = (config: Record<string, string> | null | undefined) => (config?.[CLAVE_ELIMINAR] ?? "si") !== "no";

/** El interruptor del Owner. */
export function InterruptorEliminar({ empresa, habilitado, onCambio }: { empresa: string; habilitado: boolean; onCambio: (texto: string) => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1 rounded-xl border border-border px-2 text-xs text-muted" title="Solo el Owner lo cambia">
      <Icon name="trash" size={14} />
      Eliminar {habilitado ? "habilitado" : "deshabilitado"}
      <Switch checked={habilitado} disabled={guardando} label="Habilitar el botón Eliminar"
        onChange={async (v) => {
          setGuardando(true); setError(null);
          try {
            const r = await guardarConfig({ [CLAVE_ELIMINAR]: v ? "si" : "no" }, empresa);
            if (!r.ok) setError(r.error ?? "No se pudo cambiar.");
            else onCambio(v ? "«Eliminar» quedó habilitado." : "«Eliminar» quedó deshabilitado.");
          } finally { setGuardando(false); }
        }} />
      {error && <span role="alert" className="text-danger">{error}</span>}
    </span>
  );
}

/** El botón de la fila. */
export function BotonEliminar({ onClick, titulo }: { onClick: (ev: React.MouseEvent) => void; titulo: string }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick}
      className="sumi-pulsable inline-flex items-center gap-1 rounded-full border border-danger/40 px-2.5 py-0.5 text-xs font-medium text-danger hover:bg-danger/10">
      <Icon name="trash" size={13} /> Eliminar
    </button>
  );
}

type CuentaEliminable = { id: number; documento: string; emitida: string; monto: number; saldo: number; estado: string };

/** Elegir qué cuentas de un cliente (o proveedor) se eliminan. */
export function EliminarCuentasDe({ empresa, contraparte, cuentas, onHecho, onCerrar }: {
  empresa: string; contraparte: string; cuentas: CuentaEliminable[];
  onHecho: (texto: string) => void; onCerrar: () => void;
}) {
  const [elegidas, setElegidas] = useState<Set<number>>(() => new Set(cuentas.length === 1 ? [cuentas[0].id] : []));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const alternar = (id: number) => setElegidas((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const lista = cuentas.filter((c) => elegidas.has(c.id));
  const total = lista.reduce((a, c) => a + c.saldo, 0);

  async function eliminar() {
    setGuardando(true); setError(null);
    try {
      const r = await eliminarCuentas(empresa, [...elegidas]);
      if (!r.ok) return setError(r.error);
      onHecho(`${r.cuentas} cuenta(s) de ${contraparte} eliminada(s).`);
      onCerrar();
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Se borran las cuentas que marques, con sus abonos y sus fotos. <b className="text-danger">No queda registro y no se puede deshacer.</b></p>
      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
          <span className="text-muted">{elegidas.size} de {cuentas.length} · saldo <b className="tabular-nums text-text">{fmtUsdCentavos(total)}</b></span>
          <span className="flex gap-2">
            <button type="button" className="text-brand hover:underline" onClick={() => setElegidas(new Set(cuentas.map((c) => c.id)))}>Todas</button>
            <button type="button" className="text-muted hover:underline" onClick={() => setElegidas(new Set())}>Ninguna</button>
          </span>
        </div>
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {cuentas.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs hover:bg-surface-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-danger)]" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-text">{c.documento}</span>
                  <span className="block text-muted">{fechaVista(c.emitida)} · monto {fmtUsdCentavos(c.monto)}{c.estado === "liquidada" ? " · liquidada" : ""}</span>
                </span>
                <span className="tabular-nums text-text">{fmtUsdCentavos(c.saldo)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <ConfirmDialog
          title={`¿Eliminar ${elegidas.size} cuenta(s)?`}
          message={`${lista.slice(0, 6).map((c) => c.documento).join(", ")}${lista.length > 6 ? ` y ${lista.length - 6} más` : ""} de ${contraparte}. Se borran con sus abonos y fotos; no queda registro y no se puede deshacer.`}
          confirmLabel="Sí, eliminar" cancelLabel="No" onConfirm={eliminar}
          trigger={(abrir) => (
            <Button variant="danger" icon="trash" className="flex-1" cargando={guardando} textoCargando="Eliminando…"
              onClick={() => { if (!elegidas.size) return setError("Marca al menos una cuenta."); setError(null); abrir(); }}>
              Eliminar {elegidas.size || ""}
            </Button>
          )}
        />
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}
