"use client";

// Parque: cuántos cilindros son, dónde está cada uno (la Rampa: gas por
// estado) y quién tiene los que faltan. Antes Parque y Rampa eran dos
// pestañas con los mismos números; «Parque por Gas» era la columna Total de
// la Rampa y «Ubicación del Parque», su fila de totales.
//
// Los números NO se guardan: los calcula la base sumando movimientos. Por eso
// siempre cuadran con su propio historial. Para corregirlos se CUENTA: se
// escribe lo que hay en el galpón y la Rampa queda así al guardar. El conteo
// queda por verificar: el Owner o un Administrador lo verifica o lo rechaza
// (rechazar lo deshace) en el Historial.

import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { saldos, comodatos, contarRampa, conteosRampa, gases as gasesActivos, type SaldoCilindro, type Comodato } from "@/lib/cilindros/cilindros-db";
import { conSigno, diferencias, ESTADOS_RAMPA, ETIQUETA_RAMPA, renglonesDe, type EstadoRampa } from "@/lib/cilindros/rampa";
import { useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { resumirParque } from "@/lib/cilindros/parque";
import { AccionesParque } from "./AccionesParque";

// «color» pinta el punto de la columna y su tramo en la barra de cada gas.
const ESTADOS: { id: string; label: string; tone: Tone; color: string; siempre?: boolean }[] = [
  { id: "lleno", label: "Llenos", tone: "ok", color: "bg-ok", siempre: true },
  { id: "vacio", label: "Vacíos", tone: "muted", color: "bg-muted", siempre: true },
  { id: "en_cliente", label: "En Cliente", tone: "info", color: "bg-info" },
  { id: "en_llenado", label: "En Llenado", tone: "warn", color: "bg-warn" },
  { id: "fuera_servicio", label: "Fuera de Servicio", tone: "danger", color: "bg-danger" },
];

const campo = "sumi-campo";

export function SaldosCilindros({
  empresa, puedeContar, gerencia, recarga, onCambio, onIrAHistorial,
}: { empresa: string; puedeContar: boolean; gerencia: boolean; recarga: number; onCambio?: () => void; onIrAHistorial: () => void }) {
  const carga = useCarga(`${empresa}:${recarga}:${puedeContar}`, async () => {
    const [sa, co, ga, cr] = await Promise.all([saldos(empresa), comodatos(empresa), gasesActivos(empresa), puedeContar ? conteosRampa(empresa, 1) : []]);
    // Hay uno solo pendiente a la vez (cil_conteo_un_pendiente): es el más reciente.
    return { sa, co, ga, pendiente: cr[0]?.estado === "pendiente" ? cr[0] : null };
  });
  const s: SaldoCilindro[] = carga.datos?.sa ?? [];
  const c: Comodato[] = carga.datos?.co ?? [];
  const error = carga.error;
  const listo = !carga.cargando;

  const gases = [...new Set(s.map((x) => x.gas))].sort();
  const cant = (gas: string, estado: string) =>
    s.find((x) => x.gas === gas && x.estado === estado)?.cantidad ?? 0;
  const totalGas = (gas: string) => ESTADOS.reduce((a, e) => a + cant(gas, e.id), 0);
  const totalEstado = (estado: string) => gases.reduce((a, g) => a + cant(g, estado), 0);
  const totalParque = gases.reduce((a, g) => a + totalGas(g), 0);
  // Llenos y vacíos siempre; los demás estados solo cuando tienen cilindros.
  const visibles = ESTADOS.filter((e) => e.siempre || totalEstado(e.id) > 0);
  const mayor = Math.max(1, ...gases.map(totalGas));
  const p = resumirParque(s);
  const n = (v: number) => v.toLocaleString("es-VE");

  // ---- Conteo: lo que se ve en el galpón, por gas.
  const [contando, setContando] = useState(false);
  const [contado, setContado] = useState<Record<string, Record<EstadoRampa, number>>>({});
  const [visto, setVisto] = useState<Record<string, Record<EstadoRampa, number>>>({});
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // Todos los gases activos: uno nuevo, sin movimientos, también se cuenta.
  const aContar = [...new Set([...(carga.datos?.ga ?? []).map((g) => g.nombre)])].sort();

  function empezar() {
    // Se arranca con lo registrado: el técnico solo cambia lo que no cuadra.
    const base = Object.fromEntries(aContar.map((g) => [g, { lleno: cant(g, "lleno"), vacio: cant(g, "vacio") }]));
    setVisto(base); setContado(structuredClone(base)); setMotivo(""); setMsg(null); setContando(true);
  }
  const lineas = aContar.filter((g) => visto[g]).map((g) => ({ gas: g, contado: contado[g], visto: visto[g] }));
  const dif = diferencias(renglonesDe(lineas));
  const pendiente = carga.datos?.pendiente ?? null;

  async function guardar() {
    setMsg(null);
    if (dif.length === 0) { setContando(false); return setMsg({ ok: true, texto: "El conteo coincide con la Rampa: no hay nada que ajustar." }); }
    if (!motivo.trim()) return setMsg({ ok: false, texto: "Explica por qué no cuadra: queda en el historial." });
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await contarRampa(empresa, lineas, motivo);
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      setContando(false);
      setMsg({ ok: true, texto: `Conteo ${r.numero} guardado: la Rampa ya quedó como la contaste (${r.diferencias} diferencia(s)). Queda por verificar por el Owner o un Administrador.` });
      onCambio?.();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar el conteo." });
    } finally { setGuardando(false); }
  }

  // La Rampa por gas y estado, y abajo los cilindros en poder de cada cliente.
  useExportable(() => ({
    modulo: "",
    seccion: "Parque de Cilindros",
    titulo: "Parque de Cilindros",
    detalle: [`${n(p.total)} cilindro(s) · ${n(p.enPlanta)} en planta · ${n(p.afuera)} prestados · ${gases.length} gas(es) · ${c.length} cliente(s) con cilindros`],
    columnas: [
      { titulo: "Gas / Cliente" }, ...ESTADOS.map((e) => ({ titulo: e.label, tipo: "num" as const })),
      { titulo: "Total", tipo: "num" }, { titulo: "Desde", tipo: "fecha" },
    ],
    filas: [
      ...gases.map((g) => [g, ...ESTADOS.map((e) => cant(g, e.id)), totalGas(g), null]),
      ...c.map((x) => [`${x.cliente} · ${x.gas}`, ...ESTADOS.map((e) => (e.id === "en_cliente" ? x.enPoder : null)), x.enPoder, fechaVista(x.desde)]),
    ],
    totales: ["Total del parque", ...ESTADOS.map((e) => totalEstado(e.id)), totalParque, null],
    nota: "Primero los gases con sus cantidades por estado; después cada cliente con los cilindros que tiene y desde cuándo.",
  }));

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Parque Total" value={listo ? n(p.total) : "…"} sub="cilindros de la empresa" accent />
        <StatCard label="En Planta" value={listo ? n(p.enPlanta) : "…"} sub="llenos + vacíos" />
        <StatCard label="Prestados" value={listo ? n(p.afuera) : "…"} sub="hay que recuperarlos" />
        <StatCard label="Gases" value={listo ? n(p.porGas.length) : "…"} sub="con parque" />
      </div>

      {/* Los tres movimientos que se hacen aquí: entran cilindros, se dañan o
          se reparan, y se cuenta lo que hay en el galpón. */}
      <AccionesParque empresa={empresa} gerencia={gerencia} operador={puedeContar} recarga={recarga} onRegistrada={() => onCambio?.()}
        extra={puedeContar && !contando && !pendiente && listo && !error && (
          <Button icon="inventory" variant="secondary" onClick={empezar}>Contar rampa</Button>
        )} />

      <SectionCard title="Rampa">
        {pendiente && !contando && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm">
            <p className="text-text">
              <b>Conteo {pendiente.numero}</b> de {pendiente.creadoNombre} por verificar: {diferencias(pendiente.renglones).map((d) => `${d.gas} ${ETIQUETA_RAMPA[d.estado].toLowerCase()} ${conSigno(d.diferencia)}`).join(" · ")}.
              {pendiente.movimientos === null
                ? " Todavía no entró a la Rampa: entra cuando se verifique."
                : " Ya está en los números de abajo."}
              {!gerencia && " Hasta que el Owner o un Administrador lo verifique no se puede contar de nuevo."}
            </p>
            {gerencia && <Button variant="secondary" onClick={onIrAHistorial}>Revisar y verificar</Button>}
          </div>
        )}
        {msg && !contando && (
          <p role={msg.ok ? "status" : "alert"}
            className={`mb-3 rounded-xl px-3 py-2.5 text-sm ${msg.ok ? "border border-ok/30 bg-ok/10 text-ok" : "border border-danger/30 bg-danger/10 text-danger"}`}>
            {msg.texto}
          </p>
        )}
        {contando && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Escribe cuántos hay <b className="text-text">en el galpón</b> de cada gas. Arranca con lo registrado: cambia solo lo que no cuadre.
              Los que están en clientes o en llenado no se cuentan aquí. Al guardar, la Rampa queda como la contaste; después el Owner o un Administrador lo verifica.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {aContar.map((g) => (
                <div key={g} className="rounded-2xl border border-border bg-surface-2 p-3">
                  <p className="mb-2 text-sm font-semibold text-text">{g}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ESTADOS_RAMPA.map((e) => {
                      const antes = visto[g]?.[e] ?? 0;
                      const ahora = contado[g]?.[e] ?? 0;
                      return (
                        <label key={e} className="block">
                          <span className="mb-1 block text-xs font-medium text-muted">{ETIQUETA_RAMPA[e]}</span>
                          <CampoNumero valor={ahora} aria-label={`${ETIQUETA_RAMPA[e]} de ${g} en el galpón`}
                            onChange={(n) => setContado((p) => ({ ...p, [g]: { ...p[g], [e]: n } }))}
                            className={`${campo} text-center ${ahora !== antes ? "border-warn" : ""}`} />
                          <span className={`mt-1 block text-xs ${ahora !== antes ? "font-medium text-warn" : "text-muted"}`}>
                            {ahora !== antes ? `Registrado ${antes} · ${conSigno(ahora - antes)}` : `Registrado ${antes}`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {dif.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text">Motivo *</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: conteo semanal, había 2 vacíos sin registrar" className={campo} />
              </label>
            )}
            {msg && (
              <p role={msg.ok ? "status" : "alert"}
                className={`rounded-xl px-3 py-2.5 text-sm ${msg.ok ? "border border-ok/30 bg-ok/10 text-ok" : "border border-danger/30 bg-danger/10 text-danger"}`}>
                {msg.texto}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button icon="check" className="flex-1" disabled={guardando} onClick={guardar}>
                {guardando ? "Guardando…" : dif.length ? `Guardar conteo · ${dif.length} diferencia(s)` : "Guardar conteo"}
              </Button>
              <Button variant="secondary" disabled={guardando} onClick={() => { setContando(false); setMsg(null); }}>Cancelar</Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!contando && !error && listo && gases.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Todavía no hay cilindros registrados. Da de alta el parque para empezar.
          </p>
        )}
        {!contando && gases.length > 0 && (
          <div className="-mx-1 overflow-x-auto px-1">
            {/* Con solo llenos y vacíos entra en el teléfono sin deslizar; con más
                estados, la tabla se desliza y el gas queda fijo a la izquierda. */}
            <table className={`w-full text-sm ${visibles.length > 2 ? "min-w-[32rem]" : ""}`}>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="sticky left-0 bg-surface pb-2.5 pr-3 text-left font-medium">Gas</th>
                  {visibles.map((e) => (
                    <th key={e.id} scope="col" className="whitespace-nowrap pb-2.5 pl-2 text-right font-medium sm:pl-3">
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${e.color}`} aria-hidden />{e.label}
                    </th>
                  ))}
                  <th scope="col" className="rounded-t-lg bg-surface-2 px-3 pb-2.5 pt-2 text-right font-semibold text-text">Total</th>
                </tr>
              </thead>
              <tbody>
                {gases.map((g) => {
                  const t = totalGas(g);
                  return (
                    <tr key={g} className="group border-t border-border/60">
                      <td className="sticky left-0 bg-surface py-2.5 pr-3 group-hover:bg-surface-2/60">
                        <span className="block font-medium text-text">{g}</span>
                        {/* Cuántos son y cómo se reparten, de un vistazo. */}
                        <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2" style={{ width: `${Math.max(8, (t / mayor) * 100)}%` }} aria-hidden>
                          {ESTADOS.map((e) => {
                            const v = cant(g, e.id);
                            return v > 0 ? <span key={e.id} className={e.color} style={{ width: `${(v / t) * 100}%` }} /> : null;
                          })}
                        </span>
                      </td>
                      {visibles.map((e) => {
                        const v = cant(g, e.id);
                        return (
                          <td key={e.id} className="py-2.5 pl-2 text-right tabular-nums group-hover:bg-surface-2/60 sm:pl-3">
                            {v === 0 ? <span className="text-muted/50">0</span> : <span className="text-text">{v}</span>}
                          </td>
                        );
                      })}
                      <td className="bg-surface-2 px-3 py-2.5 text-right text-base font-semibold tabular-nums text-text">{t}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-strong font-semibold text-text">
                  <td className="sticky left-0 bg-surface pt-3 pr-3">Total</td>
                  {visibles.map((e) => (
                    <td key={e.id} className="pt-3 pl-3 text-right tabular-nums">{totalEstado(e.id)}</td>
                  ))}
                  <td className="rounded-b-lg bg-brand-soft px-3 pb-2.5 pt-3 text-right text-base tabular-nums text-brand-strong">{totalParque}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cilindros en Poder de Clientes"
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
                  <th className="py-2 pr-3 text-right font-medium">Desde Hace</th>
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
