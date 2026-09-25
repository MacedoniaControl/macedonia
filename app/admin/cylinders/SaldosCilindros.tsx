"use client";

// Rampa: dónde está cada cilindro y quién tiene los que faltan.
//
// Los números NO se guardan: los calcula la base sumando movimientos. Por eso
// siempre cuadran con su propio historial. Para corregirlos se CUENTA: se
// escribe lo que hay en el galpón y el conteo queda pendiente hasta que el
// Owner o un Administrador lo aprueba en el Historial.

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

const ESTADOS: { id: string; label: string; tone: Tone }[] = [
  { id: "lleno", label: "Llenos", tone: "ok" },
  { id: "vacio", label: "Vacíos", tone: "muted" },
  { id: "en_cliente", label: "En Cliente", tone: "info" },
  { id: "en_llenado", label: "En Llenado", tone: "warn" },
  { id: "fuera_servicio", label: "Fuera de Servicio", tone: "danger" },
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
      setMsg({ ok: true, texto: `Conteo ${r.numero} enviado con ${r.diferencias} diferencia(s). La Rampa cambia cuando el Owner o un Administrador lo apruebe.` });
      onCambio?.();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar el conteo." });
    } finally { setGuardando(false); }
  }

  // La Rampa por gas y estado, y abajo los cilindros en poder de cada cliente.
  useExportable(() => ({
    modulo: "",
    seccion: "Rampa de Cilindros",
    titulo: "Rampa de Cilindros",
    detalle: [`${gases.length} gas(es) · ${totalParque} cilindro(s) · ${c.length} cliente(s) con cilindros`],
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
      <SectionCard
        title="Rampa"
        description="Calculado de los movimientos. Si no cuadra con el galpón, cuéntala: el cambio se aplica cuando se aprueba."
        action={puedeContar && !contando && !pendiente && listo && !error && (
          <Button icon="inventory" variant="secondary" onClick={empezar}>Contar rampa</Button>
        )}
      >
        {pendiente && !contando && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm">
            <p className="text-text">
              <b>Conteo {pendiente.numero}</b> de {pendiente.creadoNombre} espera aprobación: {diferencias(pendiente.renglones).map((d) => `${d.gas} ${ETIQUETA_RAMPA[d.estado].toLowerCase()} ${conSigno(d.diferencia)}`).join(" · ")}.
              {!gerencia && " Los números de abajo cambian cuando el Owner o un Administrador lo apruebe."}
            </p>
            {gerencia && <Button variant="secondary" onClick={onIrAHistorial}>Revisar y aprobar</Button>}
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
              Los que están en clientes o en llenado no se cuentan aquí. El conteo va a aprobación del Owner o un Administrador.
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
                {guardando ? "Enviando…" : dif.length ? `Enviar a aprobación · ${dif.length} diferencia(s)` : "Enviar conteo"}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Gas</th>
                  {ESTADOS.map((e) => (
                    <th key={e.id} className="py-2 pr-3 text-right font-medium">{e.label}</th>
                  ))}
                  <th className="py-2 pr-3 text-right font-semibold text-text">Total</th>
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
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-text">{totalGas(g)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-text">
                  <td className="py-2.5 pr-3">Total</td>
                  {ESTADOS.map((e) => (
                    <td key={e.id} className="py-2.5 pr-3 text-right tabular-nums">{totalEstado(e.id)}</td>
                  ))}
                  <td className="py-2.5 pr-3 text-right tabular-nums">{totalParque}</td>
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
