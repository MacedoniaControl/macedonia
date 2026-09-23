"use client";

// Historial de conteos.
//
// Cada conteo cerrado queda con su numero, lo que se conto contra lo que decia
// el sistema, quien lo hizo, sus actas en Excel y PDF, y su linea de tiempo.
// Las actas no se modifican: si algo salio mal, se hace un conteo nuevo.
//
// Aprobar o rechazar el ajuste solo lo ven owner y admin, y la base lo vuelve
// a comprobar: esconder el boton es comodidad, no seguridad.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { useCarga } from "@/lib/ux/use-carga";
import { fmtDif, fmtNum, fmtUsdSigno } from "@/lib/inventory/acta";
import {
  aprobarAjuste, detalleConteo, generarActas, historial, puedeAprobar, rechazarAjuste, type ResumenConteo,
} from "@/lib/inventory/conteos-db";
import { Descarga } from "./RevisarCierre";

const ESTADO: Record<string, { t: string; tone: "info" | "warn" | "ok" | "danger" | "muted" }> = {
  abierto: { t: "En curso", tone: "info" },
  pendiente: { t: "Ajuste pendiente", tone: "warn" },
  aprobado: { t: "Ajustado", tone: "ok" },
  rechazado: { t: "Ajuste rechazado", tone: "danger" },
  sin_diferencias: { t: "Sin diferencias", tone: "ok" },
};

export function Historial({ empresa, abrirId, recarga, onIrAContar }: {
  empresa: string; abrirId: number | null; recarga: number; onIrAContar: () => void;
}) {
  const [propia, setPropia] = useState(0);
  const carga = useCarga(`hist:${empresa}:${recarga}:${propia}`, async () => {
    const [lista, aprueba] = await Promise.all([historial(empresa), puedeAprobar()]);
    return { lista, aprueba };
  });
  const [abierta, setAbierta] = useState<number | null>(abrirId);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="space-y-1 p-4">
        <h2 className="text-base font-semibold text-text">Historial de conteos</h2>
        <p className="max-w-[70ch] text-sm text-muted">
          Cada conteo cerrado queda con su número, lo que se contó contra lo que decía el sistema, quién lo hizo, y su acta en Excel y PDF.
          Las actas no se modifican: si algo salió mal, se hace un conteo nuevo.
        </p>
      </div>
      <EstadoDatos cargando={carga.cargando} error={carga.error} vacio={(carga.datos?.lista.length ?? 0) === 0}
        tituloVacio="Todavía no hay conteos" mensajeVacio="El primero aparece acá apenas se abra.">
        <ul className="divide-y divide-border border-t border-border">
          {(carga.datos?.lista ?? []).map((c) => (
            <Fila key={c.id} c={c} abierta={abierta === c.id} aprueba={!!carga.datos?.aprueba}
              onToggle={() => setAbierta(abierta === c.id ? null : c.id)}
              onCambio={() => setPropia((n) => n + 1)} onIrAContar={onIrAContar} />
          ))}
        </ul>
      </EstadoDatos>
    </section>
  );
}

function Fila({ c, abierta, aprueba, onToggle, onCambio, onIrAContar }: {
  c: ResumenConteo; abierta: boolean; aprueba: boolean; onToggle: () => void; onCambio: () => void; onIrAContar: () => void;
}) {
  const est = ESTADO[c.cerrado ? c.ajuste ?? "pendiente" : "abierto"];
  const titulo = c.departamento ? `${c.departamento} - ${c.departamentoNombre}` : c.zona ?? "Sin departamento";
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={abierta}
        className="grid w-full grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-surface-2 md:grid-cols-[10rem_minmax(0,1fr)_9rem_10rem_1.5rem]">
        <span className={`font-mono text-sm font-bold ${c.numero ? "text-brand" : "font-medium text-muted"}`}>{c.numero ?? "Sin número"}</span>
        <span className="col-start-1 min-w-0 md:col-start-auto">
          <b className="block truncate text-sm font-semibold text-text">{titulo}</b>
          <span className="text-xs text-muted">{c.fecha.split("-").reverse().join("-")}{c.conto ? ` · contó ${c.conto}` : ""}</span>
        </span>
        <span className="col-start-1 text-xs tabular-nums text-muted md:col-start-auto"><b className="text-text">{c.renglones}</b> contados · <b className="text-text">{c.diferencias}</b> dif.</span>
        <span className="col-start-1 md:col-start-auto"><StatusBadge tone={est.tone}>{est.t}</StatusBadge></span>
        <span className={`col-start-2 row-start-1 text-muted transition md:col-start-auto md:row-start-auto ${abierta ? "rotate-90" : ""}`} aria-hidden><Icon name="chevronRight" size={16} /></span>
      </button>
      {abierta && (c.cerrado
        ? <Detalle c={c} aprueba={aprueba} onCambio={onCambio} />
        : <p className="px-4 pb-4 text-sm text-muted">Todavía no tiene acta: se genera cuando se cierre. <button type="button" className="font-medium text-brand" onClick={onIrAContar}>Seguir contando →</button></p>)}
    </li>
  );
}

function Detalle({ c, aprueba, onCambio }: { c: ResumenConteo; aprueba: boolean; onCambio: () => void }) {
  const [vez, setVez] = useState(0);
  const d = useCarga(`det:${c.id}:${vez}`, () => detalleConteo(c.id));
  const [nota, setNota] = useState("");
  const [yendo, setYendo] = useState<"" | "aprobar" | "rechazar" | "actas">("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  if (d.cargando) return <div className="px-4 pb-4"><EstadoDatos cargando vacio={false}>{null}</EstadoDatos></div>;
  if (d.error || !d.datos) return <div className="px-4 pb-4"><AlertCard tone="danger" titulo="No se pudo abrir" mensaje={d.error ?? ""} /></div>;
  const { acta, valor } = d.datos;
  const conDif = acta.lineas.filter((l) => l.esNuevo || (l.diferencia !== null && l.diferencia !== 0));

  const accion = async (que: "aprobar" | "rechazar" | "actas") => {
    setMsg(null); setYendo(que);
    try {
      const r = que === "aprobar" ? await aprobarAjuste(c.id, nota) : que === "rechazar" ? await rechazarAjuste(c.id, nota) : await generarActas(c.id);
      if (!r.ok) return setMsg({ ok: false, t: r.error ?? "No se pudo." });
      setMsg({ ok: true, t: que === "aprobar" ? `Ajuste aprobado: ${"movimientos" in r ? r.movimientos : ""} movimiento(s) de inventario.` : que === "rechazar" ? "Ajuste rechazado. Queda en el historial con el motivo." : "Actas generadas y archivadas." });
      setNota(""); setVez((n) => n + 1); onCambio();
    } finally { setYendo(""); }
  };

  return (
    <div className="space-y-4 px-4 pb-5">
      {c.tieneActas ? (
        <div className="flex flex-wrap gap-2">
          <Descarga id={c.id} tipo="acta_pdf" label="Acta en PDF" />
          <Descarga id={c.id} tipo="acta_xlsx" label="Acta en Excel" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
          <span>Este conteo se cerró pero sus actas no se archivaron.</span>
          <Button variant="secondary" cargando={yendo === "actas"} textoCargando="Generando…" onClick={() => accion("actas")}>Generar actas</Button>
        </div>
      )}

      {valor && (
        <div className="space-y-2 rounded-xl border border-dashed border-danger/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-danger">Solo owner y admin</p>
          <p className="text-sm text-muted">
            Acta valorizada: faltantes <b className="text-danger">{fmtUsdSigno(valor.faltantes)}</b> · sobrantes <b className="text-info">{fmtUsdSigno(valor.sobrantes)}</b> · neto <b className="text-text">{fmtUsdSigno(valor.neto)}</b>
            {valor.sinCosto ? ` · ${valor.sinCosto} sin costo` : ""}. Lleva el costo de cada diferencia al momento del cierre.
          </p>
          {c.tieneValorizada && (
            <div className="flex flex-wrap gap-2">
              <Descarga id={c.id} tipo="valorizada_pdf" label="Valorizada en PDF" />
              <Descarga id={c.id} tipo="valorizada_xlsx" label="Valorizada en Excel" />
            </div>
          )}
        </div>
      )}

      {conDif.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2">N°</th><th className="px-3 py-2">Identificación</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Diferencia</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conDif.map((l) => (
                <tr key={l.codigo}>
                  <td className="px-3 py-1.5 text-muted">{l.renglon ?? "+"}</td>
                  <td className="px-3 py-1.5 font-mono">{l.codigo}</td>
                  <td className="px-3 py-1.5">{l.nombre}{l.observacion && <span className="block text-muted">{l.observacion}</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">{l.esNuevo ? "nuevo" : fmtNum(l.sistema)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtNum(l.contado)} {l.unidad}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${l.diferencia === null ? "text-brand" : l.diferencia < 0 ? "text-danger" : "text-info"}`}>{fmtDif(l.diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aprueba && c.ajuste === "pendiente" && (
        <div className="space-y-2 rounded-xl bg-warn/10 p-3">
          <p className="text-sm text-text">
            <b>{c.diferencias} diferencia(s) para ajustar.</b> Al aprobar, cada una pasa a ser un movimiento de inventario con motivo «Conteo {c.numero}», y la aprobación queda en el historial.
          </p>
          <input className="sumi-campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (obligatoria para rechazar)" />
          <div className="flex flex-wrap gap-2">
            <Button icon="check" cargando={yendo === "aprobar"} textoCargando="Aprobando…" disabled={!!yendo} onClick={() => accion("aprobar")}>Aprobar ajuste</Button>
            <Button variant="secondary" cargando={yendo === "rechazar"} textoCargando="Rechazando…" disabled={!!yendo || !nota.trim()} onClick={() => accion("rechazar")}>Rechazar</Button>
          </div>
        </div>
      )}
      {c.ajusteNota && c.ajuste !== "pendiente" && <p className="text-sm text-muted">Nota del ajuste: {c.ajusteNota}</p>}
      {msg && <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{msg.t}</p>}

      <ol className="space-y-0">
        {acta.eventos.map((e, i) => (
          <li key={i} className="grid grid-cols-[8.5rem_0.75rem_minmax(0,1fr)] gap-3 pb-3 text-sm max-sm:grid-cols-[0.75rem_minmax(0,1fr)]">
            <span className="text-xs tabular-nums text-muted max-sm:col-start-2">{e.en}</span>
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full max-sm:col-start-1 max-sm:row-start-1 ${/aprobado|generada/i.test(e.tipo) ? "bg-ok" : /rechazado/i.test(e.tipo) ? "bg-danger" : "bg-border-strong"}`} />
            <span className="max-sm:col-start-2"><b className="block font-semibold text-text">{e.tipo}</b><span className="text-muted">{e.detalle}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
