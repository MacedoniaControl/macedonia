"use client";

// El registro de liquidaciones: cada pago que liquidó varias notas, con su
// número, cliente, notas, total, comprobante y quién lo hizo. El Owner o un
// Administrador puede anular una hecha por error (con motivo): sus notas
// vuelven a quedar abiertas y la liquidación queda marcada, no se borra.

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCarga } from "@/lib/ux/use-carga";
import { anularLiquidacion, listarLiquidaciones, type Liquidacion } from "@/lib/finanzas/liquidaciones-db";
import { urlComprobante } from "@/lib/finanzas/cuentas-db";
import { fmtUsd } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

const hora = (iso: string) => new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });

export function Liquidaciones({ empresa, recarga, gerencia, onCambio, tipo = "cobrar" }: {
  empresa: string; recarga: number; gerencia: boolean; onCambio: () => void; tipo?: "cobrar" | "pagar";
}) {
  const carga = useCarga(`liq:${tipo}:${empresa}:${recarga}`, () => listarLiquidaciones(empresa, tipo));
  const lista = carga.datos ?? [];
  const [abierta, setAbierta] = useState<number | null>(null);
  if (!carga.cargando && !carga.error && lista.length === 0) return null;

  return (
    <div className="mt-6">
      <SectionCard title="Liquidaciones" description={tipo === "pagar"
        ? "Pagos que liquidaron varias cuentas de un proveedor. Toca uno para ver sus cuentas y el comprobante."
        : "Pagos que liquidaron varias notas de un cliente. Toca una para ver sus notas y el comprobante."}>
        {carga.error && <p className="text-sm text-danger">{carga.error}</p>}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {lista.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setAbierta(abierta === l.id ? null : l.id)} aria-expanded={abierta === l.id}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
                <span className="font-mono text-xs text-muted">{l.numero}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-text">{l.contraparte}</span>
                <span className="text-xs text-muted">{fechaVista(l.fecha)} · {l.cuentas} nota(s)</span>
                <span className={`font-semibold tabular-nums ${l.anuladaEn ? "text-muted line-through" : "text-text"}`}>{fmtUsd(l.total)}</span>
                {l.anuladaEn ? <StatusBadge tone="danger">Anulada</StatusBadge> : <StatusBadge tone="ok">Liquidada</StatusBadge>}
              </button>
              {abierta === l.id && <Detalle l={l} gerencia={gerencia} onCambio={onCambio} />}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

/**
 * Las liquidaciones de UN cliente, dentro de su cuenta desplegada: es su
 * historial de pagos, no un registro general de la cartera.
 */
export function LiquidacionesDelCliente({ lista, gerencia, onCambio }: { lista: Liquidacion[]; gerencia: boolean; onCambio: () => void }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  if (lista.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Liquidaciones de este cliente ({lista.length})</p>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {lista.map((l) => (
          <li key={l.id}>
            <button type="button" onClick={() => setAbierta(abierta === l.id ? null : l.id)} aria-expanded={abierta === l.id}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-xs hover:bg-surface-2">
              <span className="font-mono text-muted">{l.numero}</span>
              <span className="text-muted">{fechaVista(l.fecha)} · {l.cuentas} nota(s){l.metodo ? ` · ${l.metodo}` : ""}</span>
              <span className={`ml-auto font-semibold tabular-nums ${l.anuladaEn ? "text-muted line-through" : "text-text"}`}>{fmtUsd(l.total)}</span>
              {l.anuladaEn ? <StatusBadge tone="danger">Anulada</StatusBadge> : <StatusBadge tone="ok">Pagada</StatusBadge>}
            </button>
            {abierta === l.id && <Detalle l={l} gerencia={gerencia} onCambio={onCambio} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detalle({ l, gerencia, onCambio }: { l: Liquidacion; gerencia: boolean; onCambio: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ver() {
    if (!l.imagenRuta) return;
    const url = await urlComprobante(l.imagenRuta);
    if (url) window.open(url, "_blank", "noopener"); else setError("No se pudo abrir el comprobante.");
  }
  async function anular() {
    setAnulando(true); setError(null);
    try {
      const r = await anularLiquidacion(l.id, motivo);
      if (!r.ok) return setError(r.error);
      onCambio();
    } finally {
      setAnulando(false);
    }
  }

  return (
    <div className="space-y-2 bg-surface-2 px-3 pb-3 pt-1 text-sm">
      <p className="text-xs text-muted">
        {[l.metodo, l.referencia && `ref. ${l.referencia}`].filter(Boolean).join(" · ") || "Sin método ni referencia"}
        {l.nota ? ` · «${l.nota}»` : ""} · registró {l.creadoNombre} el {hora(l.creadoEn)}
      </p>
      {l.documentos.length > 0 ? (
        <ul className="space-y-0.5 text-xs">
          {l.documentos.map((d) => (
            <li key={d.documento} className="flex justify-between gap-3"><span className="font-mono text-muted">{d.documento}</span><span className="tabular-nums text-text">{fmtUsd(d.monto)}</span></li>
          ))}
        </ul>
      ) : null}
      {l.anuladaEn && (
        <p className="rounded-lg bg-danger/10 px-2 py-1.5 text-xs text-danger">
          Anulada por {l.anuladaNombre} el {hora(l.anuladaEn)}: «{l.anuladaMotivo}». Sus notas volvieron a quedar abiertas.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {l.imagenRuta && <Button variant="secondary" icon="report" onClick={ver}>Ver comprobante</Button>}
        {gerencia && !l.anuladaEn && (
          <>
            <input className="sumi-campo sumi-campo--auto min-w-[12rem] flex-1" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo para anular" aria-label="Motivo para anular la liquidación" />
            <ConfirmDialog
              title={`¿Anular ${l.numero}?`}
              message={`Se borran sus ${l.documentos.length} abono(s) y las cuentas de ${l.contraparte} vuelven a quedar abiertas por ${fmtUsd(l.total)}. La liquidación queda en el registro como anulada.`}
              confirmLabel="Sí, anular" cancelLabel="No" onConfirm={anular}
              trigger={(abrir) => <Button variant="secondary" disabled={anulando || !motivo.trim()} onClick={abrir}>{anulando ? "Anulando…" : "Anular"}</Button>}
            />
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
