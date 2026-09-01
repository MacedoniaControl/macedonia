"use client";

// Rampa: dónde está cada cilindro y quién tiene los que faltan.
//
// Los números NO se guardan: los calcula la base sumando movimientos. Por eso
// siempre cuadran con su propio historial.

import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { saldos, comodatos, movimientoManual, type SaldoCilindro, type Comodato } from "@/lib/cilindros/cilindros-db";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

const ESTADOS: { id: string; label: string; tone: Tone }[] = [
  { id: "lleno", label: "Llenos", tone: "ok" },
  { id: "vacio", label: "Vacíos", tone: "muted" },
  { id: "en_cliente", label: "En cliente", tone: "info" },
  { id: "en_llenado", label: "En llenado", tone: "warn" },
  { id: "fuera_servicio", label: "Fuera de servicio", tone: "danger" },
];

const campo =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function SaldosCilindros({
  empresa, recarga, onCambio,
}: { empresa: string; recarga: number; onCambio?: () => void }) {
  const [mov, setMov] = useState({ gas: "", cantidad: 1, direccion: "entrada" as "entrada" | "salida", estado: "lleno" as "lleno" | "vacio", nota: "" });
  const [msgMov, setMsgMov] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const carga = useCarga(`${empresa}:${recarga}`, async () => {
    const [sa, co] = await Promise.all([saldos(empresa), comodatos(empresa)]);
    return { sa, co };
  });
  const s: SaldoCilindro[] = carga.datos?.sa ?? [];
  const c: Comodato[] = carga.datos?.co ?? [];
  const error = carga.error;
  const listo = !carga.cargando;

  const gases = [...new Set(s.map((x) => x.gas))].sort();
  const cant = (gas: string, estado: string) =>
    s.find((x) => x.gas === gas && x.estado === estado)?.cantidad ?? 0;

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Rampa"
        description="Calculado de los movimientos, no de un conteo guardado."
        action={
          <PildoraPanel etiqueta="Agregar Movimiento" icono="plus">
            {(cerrar) => (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-text">Movimiento manual</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Gas</span>
                    <select value={mov.gas} onChange={(e) => setMov({ ...mov, gas: e.target.value })} className={campo}>
                      <option value="">Elegí…</option>
                      {gases.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Cantidad</span>
                    <input type="number" min={1} value={mov.cantidad}
                      onChange={(e) => setMov({ ...mov, cantidad: Math.max(1, Number(e.target.value) || 1) })}
                      className={`${campo} tabular-nums`} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Movimiento</span>
                    <select value={mov.direccion} onChange={(e) => setMov({ ...mov, direccion: e.target.value as "entrada" | "salida" })} className={campo}>
                      <option value="entrada">Agregar</option>
                      <option value="salida">Quitar</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Estado</span>
                    <select value={mov.estado} onChange={(e) => setMov({ ...mov, estado: e.target.value as "lleno" | "vacio" })} className={campo}>
                      <option value="lleno">Lleno</option>
                      <option value="vacio">Vacío</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Motivo *</span>
                  <input value={mov.nota} onChange={(e) => setMov({ ...mov, nota: e.target.value })}
                    placeholder="Por qué se ajusta" className={campo} />
                </label>
                {msgMov && (
                  <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msgMov}</p>
                )}
                <div className="flex gap-2">
                  <Button icon="plus" className="flex-1" disabled={guardando}
                    onClick={async () => {
                      setMsgMov(null);
                      if (!mov.gas) return setMsgMov("Elegí el gas.");
                      setGuardando(true);
                      try {
                        const r = await movimientoManual(mov.gas, mov.cantidad, mov.direccion, mov.estado, empresa, mov.nota);
                        if (!r.ok) return setMsgMov(r.error ?? "No se pudo registrar.");
                        setMov({ ...mov, cantidad: 1, nota: "" });
                        onCambio?.();
                        cerrar();
                      } finally { setGuardando(false); }
                    }}>{guardando ? "Registrando…" : "Registrar"}</Button>
                  <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
                </div>
              </div>
            )}
          </PildoraPanel>
        }
      >
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && listo && gases.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Todavía no hay cilindros registrados. Da de alta el parque para empezar.
          </p>
        )}
        {gases.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Gas</th>
                  {ESTADOS.map((e) => (
                    <th key={e.id} className="py-2 pr-3 text-right font-medium">{e.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gases.map((g) => (
                  <tr key={g} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium text-text">{g}</td>
                    {ESTADOS.map((e) => {
                      const n = cant(g, e.id);
                      return (
                        <td key={e.id} className="py-2.5 pr-3 text-right tabular-nums">
                          {n === 0 ? <span className="text-muted">—</span> : n}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cilindros en poder de clientes"
        description="Son de la empresa: hay que recuperarlos."
      >
        {listo && c.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Ningún cliente tiene cilindros pendientes.
          </p>
        )}
        {c.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Gas</th>
                  <th className="py-2 pr-3 text-right font-medium">Tiene</th>
                  <th className="py-2 pr-3 text-right font-medium">Desde hace</th>
                </tr>
              </thead>
              <tbody>
                {c.map((x) => (
                  <tr key={`${x.cliente}-${x.gas}`} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 text-text">{x.cliente}</td>
                    <td className="py-2.5 pr-3 text-muted">{x.gas}</td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-text">
                      {x.enPoder}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {x.dias === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        // Más de 60 días con cilindros ajenos merece una mirada.
                        <StatusBadge tone={x.dias > 60 ? "warn" : "muted"}>
                          {x.dias} día{x.dias === 1 ? "" : "s"}
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
