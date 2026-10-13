"use client";

// Cierre de mes (Matrices Administrativas).
//
// Cuando termina un mes que el histórico de Valery todavía no trae, el botón
// abre este formato para llenarlo: ventas, costo de lo vendido y compras en
// dólares sin IVA (y, si se tienen, los bolívares facturados). La utilidad, el
// margen y el ROI se calculan solos. Al lado de cada campo va el mes anterior,
// para comparar mientras se llena. Un mes cargado se puede corregir o borrar.
//
// Lo guarda lib/ux/historico-meses-db.ts; lo cuentan todas las pantallas del
// histórico (lib/ux/historico-meses.ts).

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { HISTORY, type EmpresaHist, getHistory } from "@/lib/ux/history-data";
import { mesesCargadosDe, mesesPorCerrar } from "@/lib/ux/historico-meses";
import { borrarMesCargado, guardarMesCargado } from "@/lib/ux/historico-meses-db";
import { recargarMesesCargados, useMesesCargados } from "@/lib/ux/use-meses-cargados";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";
import { fmtBs, fmtUsd } from "@/lib/ux/format";
import { hoyISO } from "@/lib/ux/rango";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const nombreMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

type Campos = { venta: string; costo: string; compra: string; ventaBs: string; costoBs: string; compraBs: string; nota: string };
const VACIO: Campos = { venta: "", costo: "", compra: "", ventaBs: "", costoBs: "", compraBs: "", nota: "" };
const texto = (n: number) => (n ? fmtMonto(n) : "");

/** El botón de la cabecera: «Cerrar Septiembre 2026» si hay un mes terminado sin datos. */
export function BotonCierreDeMes({ empresa }: { empresa: string }) {
  useMesesCargados();
  const [abierto, setAbierto] = useState(false);
  const id: EmpresaHist = empresa in HISTORY ? (empresa as EmpresaHist) : "sumigases";
  const ultimoValery = HISTORY[id].meta.hasta;
  const cargados = mesesCargadosDe(id).filter((m) => m.ym > ultimoValery);
  const hechos = new Set(cargados.map((m) => m.ym));
  const pendientes = mesesPorCerrar(ultimoValery, hoyISO()).filter((ym) => !hechos.has(ym));
  if (!pendientes.length && !cargados.length) return null;
  return (
    <>
      <Button icon="check" variant={pendientes.length ? "primary" : "secondary"} className="sumi-pulsable" onClick={() => setAbierto(true)}>
        {pendientes.length ? `Cerrar ${nombreMes(pendientes[0])}` : "Cierre de Mes"}
      </Button>
      {abierto && <CierreDeMes empresa={id} inicial={pendientes[0] ?? cargados[cargados.length - 1].ym} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function CierreDeMes({ empresa, inicial, onCerrar }: { empresa: EmpresaHist; inicial: string; onCerrar: () => void }) {
  useMesesCargados();
  const ultimoValery = HISTORY[empresa].meta.hasta;
  const cargados = mesesCargadosDe(empresa).filter((m) => m.ym > ultimoValery);
  // Los que se pueden llenar: los terminados sin Valery, del más viejo al más nuevo.
  const opciones = useMemo(
    () => [...new Set([...mesesPorCerrar(ultimoValery, hoyISO()), ...cargados.map((m) => m.ym)])].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ultimoValery, cargados.length],
  );
  const desde = (ym: string): Campos => {
    const m = cargados.find((x) => x.ym === ym);
    return m ? { venta: texto(m.venta), costo: texto(m.costo), compra: texto(m.compra), ventaBs: texto(m.ventaBs), costoBs: texto(m.costoBs), compraBs: texto(m.compraBs), nota: m.nota ?? "" } : VACIO;
  };
  const [ym, setYm] = useState(inicial);
  const [c, setC] = useState<Campos>(() => desde(inicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [verBs, setVerBs] = useState(() => !!desde(inicial).ventaBs);
  const [borrar, setBorrar] = useState(false);

  const yaCargado = cargados.find((m) => m.ym === ym);
  // El mes anterior (de Valery o cargado), para comparar al llenar.
  const anterior = [...getHistory(empresa).months].reverse().find((m) => m.ym < ym) ?? null;

  const n = (s: string) => (s.trim() ? parseMonto(s) : 0);
  const venta = n(c.venta), costo = n(c.costo), compra = n(c.compra);
  const ventaBs = n(c.ventaBs), costoBs = n(c.costoBs), compraBs = n(c.compraBs);
  const invalido = [venta, costo, compra, ventaBs, costoBs, compraBs].some((x) => x === null || (x ?? 0) < 0);
  const util = (venta ?? 0) - (costo ?? 0);
  const margen = venta ? (util / venta) * 100 : 0;
  const roi = costo ? (util / costo) * 100 : 0;
  const pct = (x: number) => `${x.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;

  const cambiarMes = (nuevo: string) => { setYm(nuevo); setC(desde(nuevo)); setVerBs(!!desde(nuevo).ventaBs); setError(null); setHecho(null); setBorrar(false); };
  const set = (k: keyof Campos) => (v: string) => { setC((x) => ({ ...x, [k]: v })); setHecho(null); };

  async function guardar() {
    setError(null);
    if (invalido) return setError("Revisa los montos: hay uno que no se entiende o es negativo.");
    if (!venta) return setError("Faltan las ventas del mes.");
    if (!costo) return setError("Falta el costo de lo vendido: sin él no hay utilidad ni ROI.");
    setGuardando(true);
    const r = await guardarMesCargado({
      empresa, ym, venta: venta!, costo: costo!, compra: compra ?? 0,
      ventaBs: ventaBs ?? 0, costoBs: costoBs ?? 0, compraBs: compraBs ?? 0, nota: c.nota,
    });
    if (r.ok) await recargarMesesCargados();
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    // Si quedan meses por cerrar, el formato pasa al siguiente.
    const siguiente = mesesPorCerrar(ultimoValery, hoyISO()).find((x) => x > ym && !cargados.some((m) => m.ym === x));
    setHecho(`${nombreMes(ym)} quedó ${yaCargado ? "corregido" : "cerrado"}.${siguiente ? ` Sigue ${nombreMes(siguiente)}.` : ""}`);
    if (siguiente) { setYm(siguiente); setC(VACIO); setVerBs(false); }
  }

  async function quitar() {
    setGuardando(true);
    const r = await borrarMesCargado(empresa, ym);
    if (r.ok) await recargarMesesCargados();
    setGuardando(false);
    setBorrar(false);
    if (!r.ok) return setError(r.error);
    setC(VACIO);
    setHecho(`Se borró ${nombreMes(ym)}: vuelve a quedar por cerrar.`);
  }

  const ref = (v: number | undefined, f = fmtUsd) => (anterior && v !== undefined ? `${nombreMes(anterior.ym)}: ${f(v)}` : "");

  return (
    <Modal titulo="Cierre de Mes" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Mes</span>
            <select className="sumi-campo sumi-campo--auto" value={ym} onChange={(e) => cambiarMes(e.target.value)}>
              {opciones.map((x) => (
                <option key={x} value={x}>{nombreMes(x)}{cargados.some((m) => m.ym === x) ? " · cargado" : " · por cerrar"}</option>
              ))}
            </select>
          </label>
          <p className="pb-2 text-xs text-muted">
            {yaCargado
              ? `Cargado por ${yaCargado.creadoNombre ?? "—"}${yaCargado.actualizadoEn ? ` el ${yaCargado.actualizadoEn.slice(0, 10).split("-").reverse().join("-")}` : ""}. Puedes corregirlo.`
              : `El histórico de Valery llega hasta ${nombreMes(ultimoValery).toLowerCase()}.`}
          </p>
        </div>

        <fieldset className="space-y-1">
          <legend className="mb-2 text-sm font-semibold text-text">En dólares, sin IVA</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <div><CampoMonto etiqueta="Ventas" valor={c.venta} onChange={set("venta")} requerido /><p className="-mt-0.5 text-[11px] text-muted">{ref(anterior?.venta)}</p></div>
            <div><CampoMonto etiqueta="Costo de lo vendido" valor={c.costo} onChange={set("costo")} requerido /><p className="-mt-0.5 text-[11px] text-muted">{ref(anterior?.costo)}</p></div>
            <div><CampoMonto etiqueta="Compras" valor={c.compra} onChange={set("compra")} /><p className="-mt-0.5 text-[11px] text-muted">{ref(anterior?.compra)}</p></div>
          </div>
        </fieldset>

        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm" aria-live="polite">
          <div><dt className="text-[11px] uppercase tracking-wide text-muted">Utilidad</dt><dd className={`font-semibold tabular-nums ${util < 0 ? "text-danger" : "text-text"}`}>{fmtUsd(util)}</dd></div>
          <div><dt className="text-[11px] uppercase tracking-wide text-muted">Margen</dt><dd className="font-semibold tabular-nums text-text">{venta ? pct(margen) : "—"}</dd></div>
          <div><dt className="text-[11px] uppercase tracking-wide text-muted">ROI</dt><dd className="font-semibold tabular-nums text-ok">{costo ? pct(roi) : "—"}</dd></div>
        </dl>

        {verBs ? (
          <fieldset className="space-y-1">
            <legend className="mb-2 text-sm font-semibold text-text">En bolívares facturados <span className="font-normal text-muted">(opcional)</span></legend>
            <div className="grid gap-x-4 sm:grid-cols-3">
              <div><CampoMonto etiqueta="Ventas" moneda="Bs" valor={c.ventaBs} onChange={set("ventaBs")} /><p className="-mt-0.5 text-[11px] text-muted">{ref(anterior?.ventaBs, fmtBs)}</p></div>
              <div><CampoMonto etiqueta="Costo de lo vendido" moneda="Bs" valor={c.costoBs} onChange={set("costoBs")} /><p className="-mt-0.5 text-[11px] text-muted">{ref(anterior?.costoBs, fmtBs)}</p></div>
              <div><CampoMonto etiqueta="Compras" moneda="Bs" valor={c.compraBs} onChange={set("compraBs")} /><p className="-mt-0.5 text-[11px] text-muted">{ref(anterior?.compraBs, fmtBs)}</p></div>
            </div>
          </fieldset>
        ) : (
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setVerBs(true)}>
            + Agregar los bolívares facturados (para ver el histórico en Bs)
          </button>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Nota (opcional)</span>
          <input className="sumi-campo" value={c.nota} onChange={(e) => set("nota")(e.target.value)} placeholder="De dónde salen los números, algo fuera de lo normal…" />
        </label>

        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {hecho && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{hecho}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button icon="check" className="sumi-pulsable" cargando={guardando} textoCargando="Guardando…" onClick={() => void guardar()}>Guardar</Button>
          <Button variant="secondary" className="sumi-pulsable" onClick={onCerrar}>Cerrar</Button>
          {yaCargado && (borrar ? (
            <span className="ml-auto flex items-center gap-2 text-xs text-danger">
              ¿Borrar {nombreMes(ym)}?
              <Button variant="danger" className="sumi-pulsable" disabled={guardando} onClick={() => void quitar()}>Sí, borrar</Button>
              <Button variant="ghost" onClick={() => setBorrar(false)}>No</Button>
            </span>
          ) : (
            <Button variant="ghost" icon="trash" className="ml-auto text-danger" onClick={() => setBorrar(true)}>Borrar mes</Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
