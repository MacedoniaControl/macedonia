"use client";

// Panel de vendedores externos: los que ofrecen los productos por su cuenta y
// los venden. Vive dentro de Cotizaciones porque es una forma de vender, no un
// departamento aparte.
//
// Por cada vendedor: lo que cotizó, lo que vendió (sus notas de entrega) y su
// comisión sobre lo vendido sin IVA. El porcentaje lo definen el Owner o un
// Administrador: uno general de la empresa y, si hace falta, uno propio por
// vendedor. Las reglas están en lib/documentos/vendedores-externos.ts.
//
// Muestra comisiones: lo ven solo el Owner y el Administrador (la pestaña no
// aparece para el resto).

import { Fragment, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { useCarga } from "@/lib/ux/use-carga";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { RANGO_POR_DEFECTO, type Rango } from "@/lib/ux/rango";
import { documentosExternos } from "@/lib/documentos/documentos-db";
import { guardarConfig, leerConfig } from "@/lib/config/config-db";
import { CLAVE_COMISION_GENERAL, claveComision, comisionesDe, resumenVendedores, type FilaVendedor } from "@/lib/documentos/vendedores-externos";
import { fmtUsd } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

const pctTexto = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`);

export function VentasExternas() {
  const empresa = useEmpresaActiva();
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO);
  const [recarga, setRecarga] = useState(0);
  const docs = useCarga(`externos:${empresa}:${rango.desde}:${rango.hasta}`, () => documentosExternos(empresa, rango.desde, rango.hasta));
  const cfg = useCarga(`cfg:${empresa}:${recarga}`, () => leerConfig(empresa));
  const comisiones = comisionesDe(cfg.datos ?? {});
  const filas = resumenVendedores(docs.datos ?? [], comisiones);
  const [abierto, setAbierto] = useState<string | null>(null);

  const [general, setGeneral] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(cambios: Record<string, string>, que: string) {
    setGuardando(true); setAviso(null);
    try {
      const r = await guardarConfig(cambios, empresa);
      if (!r.ok) return setAviso({ ok: false, t: r.error ?? "No se pudo guardar." });
      setAviso({ ok: true, t: `${que} guardada.` });
      setGeneral(null);
      setRecarga((n) => n + 1);
    } finally {
      setGuardando(false);
    }
  }

  const tot = filas.reduce((a, f) => ({ cotizado: a.cotizado + f.cotizado, vendido: a.vendido + f.vendido, comision: a.comision + (f.comision ?? 0) }), { cotizado: 0, vendido: 0, comision: 0 });
  const sinPct = filas.filter((f) => f.pct === null && f.vendido > 0).length;
  const valorGeneral = general ?? (comisiones.general === null ? "" : String(comisiones.general));

  return (
    <div className="space-y-4">
      <SectionCard
        title="Vendedores Externos"
        description="Lo que cotizó y lo que vendió cada vendedor de afuera del personal, y su comisión sobre lo vendido (notas de entrega, sin IVA)."
      >
        <div className="space-y-4">
          <SelectorRango valor={rango} onCambio={setRango} mostrarAgrupacion={false} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Vendedores" value={String(filas.length)} sub="con movimiento en el período" />
            <StatCard label="Cotizado" value={fmtUsd(tot.cotizado)} sub="presupuestos" />
            <StatCard label="Vendido" value={fmtUsd(tot.vendido)} sub="notas de entrega, sin IVA" />
            <StatCard label="Comisiones" value={fmtUsd(tot.comision)} sub={sinPct ? `${sinPct} sin porcentaje` : "del período"} accent />
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-2 p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Comisión general</span>
              <span className="flex items-center gap-1.5">
                <input className="sumi-campo text-right" style={{ inlineSize: "6rem" }} inputMode="decimal" value={valorGeneral}
                  placeholder="0" aria-label="Comisión general en porcentaje" onChange={(e) => setGeneral(e.target.value)} />
                <span className="text-sm text-muted">%</span>
              </span>
            </label>
            <Button variant="secondary" disabled={guardando || general === null} onClick={() => guardar({ [CLAVE_COMISION_GENERAL]: valorGeneral.trim() }, "Comisión general")}>
              Guardar
            </Button>
            <p className="min-w-0 flex-1 text-xs text-muted">
              Se aplica a todos los vendedores externos de esta empresa, salvo a los que tengan su propio porcentaje (en la tabla).
              {comisiones.general === null && " Mientras no se defina, no se calcula comisión."}
            </p>
          </div>
          {aviso && <p role={aviso.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{aviso.t}</p>}

          {docs.error && <p className="text-sm text-danger">{docs.error}</p>}
          {!docs.cargando && !docs.error && filas.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              No hay ventas de vendedores externos en este período. Aparecen al guardar una cotización o una nota de entrega
              con «Vendedor externo…» en el campo Vendedor.
            </p>
          )}

          {filas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 text-right font-medium">Cotizado</th>
                    <th className="px-3 py-2 text-right font-medium">Vendido</th>
                    <th className="px-3 py-2 text-right font-medium">Conversión</th>
                    <th className="px-3 py-2 text-right font-medium">Comisión %</th>
                    <th className="px-3 py-2 text-right font-medium">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map((f) => (
                    <Fragment key={f.clave}>
                      <tr className="cursor-pointer hover:bg-surface-2" onClick={() => setAbierto(abierto === f.clave ? null : f.clave)}>
                        <td className="px-3 py-2.5 font-medium text-text">{f.nombre}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted">{fmtUsd(f.cotizado)} <span className="text-xs">· {f.cotizaciones}</span></td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-text">{fmtUsd(f.vendido)} <span className="text-xs font-normal text-muted">· {f.notas}</span></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted">{pctTexto(f.conversion)}</td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <PctVendedor fila={f} guardando={guardando} onGuardar={(v) => guardar({ [claveComision(f.nombre)]: v }, `Comisión de ${f.nombre}`)} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ok">{f.comision === null ? "—" : fmtUsd(f.comision)}</td>
                      </tr>
                      {abierto === f.clave && (
                        <tr>
                          <td colSpan={6} className="bg-surface-2 px-3 py-2">
                            <ul className="space-y-0.5 text-xs text-muted">
                              {f.docs.map((d) => (
                                <li key={d.id}>
                                  {fechaVista(d.fecha)} · {d.tipo === "nota_entrega" ? "Nota de entrega" : "Cotización"} {d.correlativo} · {d.cliente} ·{" "}
                                  <b className="text-text">{fmtUsd(d.total)}</b>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-surface-2 text-sm font-semibold">
                  <tr>
                    <td className="px-3 py-2 text-text">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtUsd(tot.cotizado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text">{fmtUsd(tot.vendido)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{pctTexto(tot.cotizado > 0 ? Math.round((tot.vendido / tot.cotizado) * 10000) / 100 : null)}</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums text-ok">{fmtUsd(tot.comision)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">
            Toca un vendedor para ver sus documentos. Las devoluciones no se descuentan de la comisión: si un cliente devuelve, ajústalo a mano.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

/** El porcentaje propio de un vendedor. Vacío = usa el general. */
function PctVendedor({ fila, guardando, onGuardar }: { fila: FilaVendedor; guardando: boolean; onGuardar: (v: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  const valor = v ?? (fila.propio && fila.pct !== null ? String(fila.pct) : "");
  return (
    <span className="inline-flex items-center gap-1">
      <input className="sumi-campo text-right" style={{ inlineSize: "4.5rem" }} inputMode="decimal" value={valor}
        placeholder={fila.propio || fila.pct === null ? "—" : String(fila.pct)} aria-label={`Comisión propia de ${fila.nombre}`}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && v !== null) { onGuardar(v.trim()); setV(null); } }} />
      {v !== null && (
        <Button variant="secondary" disabled={guardando} onClick={() => { onGuardar(v.trim()); setV(null); }}>OK</Button>
      )}
    </span>
  );
}
