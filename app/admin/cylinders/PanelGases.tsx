"use client";

// Gases y su depósito en garantía.
//
// El depósito estaba en 0 para los ocho gases, así que la vista de garantías
// devolvía siempre cero sin avisar que el dato faltaba. Un cero que parece una
// respuesta es peor que un vacío que se ve.
//
// Vive en una píldora dentro de Cilindros y no en Configuración: el precio del
// gas lo conoce quien maneja los cilindros, no quien administra el sistema.

import { useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { gases, guardarGas, desactivarGas, type Gas } from "@/lib/cilindros/cilindros-db";

const vacio = { nombre: "", depositoUsd: 0, seRellena: false };

export function PanelGases({ empresa, onCambio }: { empresa: string; onCambio?: () => void }) {
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresa}:${recarga}`, () => gases(empresa));
  const lista: Gas[] = carga.datos ?? [];

  const [edit, setEdit] = useState<typeof vacio | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const sinDeposito = lista.filter((g) => g.depositoUsd === 0).length;

  async function guardar() {
    if (!edit || guardando) return;
    setMsg(null);
    setGuardando(true);
    try {
      const r = await guardarGas(edit, empresa);
      if (!r.ok) return setMsg(r.error ?? "No se pudo guardar.");
      setEdit(null);
      setRecarga((n) => n + 1);
      onCambio?.();
    } finally { setGuardando(false); }
  }

  return (
    <PildoraPanel etiqueta="Gases y depósitos" icono="cylinder" ancho="w-[30rem]">
      {() => (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-text">Gases y depósito en garantía</p>
            <p className="mt-0.5 text-xs text-muted">
              Es lo que se le cobra al cliente por cada cilindro que se lleva.
            </p>
          </div>

          {sinDeposito > 0 && (
            <p className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-xs text-warn">
              {sinDeposito} gas(es) con depósito en cero: sus garantías van a
              calcular cero, aunque el cilindro esté afuera.
            </p>
          )}

          {carga.error && <p className="text-sm text-danger">{carga.error}</p>}

          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {lista.map((g) => (
              <div key={g.nombre} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{g.nombre}</span>
                  <span className="text-xs text-muted">
                    {g.depositoUsd > 0
                      ? `Depósito $${g.depositoUsd.toFixed(2)}`
                      : <span className="text-warn">Sin depósito cargado</span>}
                    {g.seRellena && " · se rellena en planta"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEdit({ nombre: g.nombre, depositoUsd: g.depositoUsd, seRellena: g.seRellena })}
                  className="min-h-11 rounded-lg px-2 text-sm text-muted hover:text-brand"
                >
                  Editar
                </button>
                <button
                  type="button"
                  aria-label={`Dar de baja ${g.nombre}`}
                  onClick={async () => { await desactivarGas(g.nombre, empresa); setRecarga((n) => n + 1); }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-danger"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            {!carga.cargando && lista.length === 0 && (
              <p className="py-4 text-center text-sm text-muted">Todavía no hay gases cargados.</p>
            )}
          </div>

          {edit ? (
            <div className="space-y-2 rounded-xl border border-brand-strong bg-brand-soft/40 p-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Gas *</span>
                <input
                  className="sumi-campo"
                  value={edit.nombre}
                  onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
                  placeholder="OXIGENO, ARGOMIX, CO2…"
                  autoCapitalize="characters"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Depósito en garantía (USD)</span>
                <input
                  type="number" min={0} step="0.01" inputMode="decimal"
                  className="sumi-campo tabular-nums"
                  value={edit.depositoUsd || ""}
                  placeholder="0.00"
                  onChange={(e) => setEdit({ ...edit, depositoUsd: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={edit.seRellena}
                  onChange={(e) => setEdit({ ...edit, seRellena: e.target.checked })}
                  className="h-5 w-5 rounded border-border-strong"
                />
                Se rellena en planta
              </label>

              {msg && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

              <div className="flex gap-2">
                <Button icon="check" className="flex-1" disabled={guardando} onClick={guardar}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
                <Button variant="secondary" onClick={() => { setEdit(null); setMsg(null); }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" icon="plus" className="w-full" onClick={() => setEdit({ ...vacio })}>
              Agregar gas
            </Button>
          )}
        </div>
      )}
    </PildoraPanel>
  );
}
