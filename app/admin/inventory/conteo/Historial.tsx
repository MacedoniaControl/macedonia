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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { leerCantidad, fmtCantidad } from "@/lib/inventory/cantidad";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { useCarga } from "@/lib/ux/use-carga";
import { fmtDif, fmtNum, fmtUsdSigno } from "@/lib/inventory/acta";
import {
  aprobarAjuste, detalleConteo, editarConteo, eliminarConteo, generarActas, historial, puedeAprobar, rechazarAjuste, type ResumenConteo,
} from "@/lib/inventory/conteos-db";
import { Descarga } from "./RevisarCierre";
import { useExportable } from "@/lib/ux/exportar";

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
  const pendientes = (carga.datos?.lista ?? []).filter((c) => !c.eliminado && c.cerrado && c.ajuste === "pendiente");

  // La lista de conteos. Cada acta se baja aparte, desde su conteo.
  useExportable(() => {
    const lista = carga.datos?.lista;
    if (!lista) return null;
    return {
      seccion: "Historial de conteos",
      titulo: "Historial de Conteos",
      detalle: ["Todos los conteos, del más reciente al más antiguo"],
      columnas: [
        { titulo: "Número" }, { titulo: "Fecha", tipo: "fecha" }, { titulo: "Departamento" }, { titulo: "Contó" },
        { titulo: "Contados", tipo: "num" }, { titulo: "Diferencias", tipo: "num" }, { titulo: "Nuevos", tipo: "num" },
        { titulo: "Estado" }, { titulo: "Cerrado el" },
      ],
      filas: lista.filter((c) => !c.eliminado).map((c) => [
        c.numero ?? "Sin número", c.fecha, c.departamento ? `${c.departamento} - ${c.departamentoNombre ?? ""}` : c.zona ?? "Sin departamento",
        c.conto, c.renglones, c.diferencias, c.articulosNuevos, ESTADO[c.cerrado ? c.ajuste ?? "pendiente" : "abierto"].t, c.cerradoEn,
      ]),
      nota: "Las actas de cada conteo (Excel y PDF, con su número) se descargan desde el conteo, en el historial.",
    };
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="space-y-1 p-4">
        <h2 className="text-base font-semibold text-text">Historial de Conteos</h2>
        <p className="max-w-[70ch] text-sm text-muted">
          Cada conteo cerrado queda con su número y su acta en Excel y PDF. Las diferencias entran a la existencia cuando el Owner o un Administrador aprueban el ajuste.
        </p>
      </div>
      {/* Lo que espera una decisión va arriba: contar no ajusta, aprobar sí. */}
      {carga.datos?.aprueba && pendientes.length > 0 && (
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm">
          <p className="text-text">
            <b>{pendientes.length === 1 ? "1 conteo espera" : `${pendientes.length} conteos esperan`} tu aprobación</b> ({pendientes.map((c) => c.numero).join(", ")}).
            La existencia cambia cuando lo apruebas.
          </p>
          <Button variant="secondary" onClick={() => setAbierta(pendientes[0].id)}>Revisar</Button>
        </div>
      )}
      <EstadoDatos cargando={carga.cargando} error={carga.error} vacio={(carga.datos?.lista.length ?? 0) === 0}
        tituloVacio="Todavía no hay conteos" mensajeVacio="El primero aparece aquí apenas se abra.">
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
  if (c.eliminado) return <Eliminado e={c.eliminado} />;
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
        : (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
            <p className="text-sm text-muted">Todavía no tiene acta: se genera cuando se cierre. <button type="button" className="font-medium text-brand" onClick={onIrAContar}>Seguir contando →</button></p>
            {aprueba && <BotonEliminar c={c} onEliminado={onCambio} />}
          </div>
        ))}
    </li>
  );
}

function Detalle({ c, aprueba, onCambio }: { c: ResumenConteo; aprueba: boolean; onCambio: () => void }) {
  const [vez, setVez] = useState(0);
  const d = useCarga(`det:${c.id}:${vez}`, () => detalleConteo(c.id));
  const [nota, setNota] = useState("");
  const [yendo, setYendo] = useState<"" | "aprobar" | "rechazar" | "actas">("");
  const [corrigiendo, setCorrigiendo] = useState(false);
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-danger">Solo Owner y Administrador</p>
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

      {corrigiendo && (
        <Corregir c={c} lineas={acta.lineas} onCancelar={() => setCorrigiendo(false)}
          onHecho={(t) => { setCorrigiendo(false); setMsg({ ok: true, t }); setVez((n) => n + 1); onCambio(); }} />
      )}

      {!corrigiendo && conDif.length > 0 && (
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

      {aprueba && !corrigiendo && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="settings" onClick={() => setCorrigiendo(true)}>Corregir conteo</Button>
          <BotonEliminar c={c} onEliminado={onCambio} />
        </div>
      )}

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

// ---------------------------------------------------------------- eliminar

/** La línea que queda de un conteo eliminado, como un mensaje borrado en WhatsApp. */
function Eliminado({ e }: { e: NonNullable<ResumenConteo["eliminado"]> }) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-3 text-sm text-muted">
      <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
      </svg>
      <span className="min-w-0">
        <span className="block italic">Se eliminó el conteo {e.resumen}</span>
        <span className="block text-xs">Por <b className="font-medium text-text">{e.por}</b> · {e.en}</span>
      </span>
    </li>
  );
}

function BotonEliminar({ c, onEliminado }: { c: ResumenConteo; onEliminado: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const nombre = c.numero ?? "el conteo sin número";
  const donde = c.departamento ? `${c.departamento} - ${c.departamentoNombre}` : c.zona ?? "sin departamento";
  const aviso = c.ajuste === "aprobado"
    ? " Su ajuste ya se aplicó al inventario: las existencias no cambian al eliminarlo."
    : "";
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <ConfirmDialog
        title="¿Eliminar el conteo?"
        message={`Se eliminará ${nombre} (${donde}, ${c.fecha.split("-").reverse().join("-")}) con sus renglones y sus actas. En el historial quedará una línea con tu nombre y la hora.${aviso}`}
        confirmLabel="Sí, eliminar"
        cancelLabel="No"
        onConfirm={async () => {
          setError(null); setYendo(true);
          const r = await eliminarConteo(c.id);
          setYendo(false);
          if (!r.ok) return setError(r.error ?? "No se pudo eliminar.");
          onEliminado();
        }}
        trigger={(abrir) => (
          <Button variant="ghost" icon="close" cargando={yendo} textoCargando="Eliminando…" onClick={abrir}
            className="text-danger hover:bg-danger/10">
            Eliminar conteo
          </Button>
        )}
      />
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- corregir

type LineaActa = Awaited<ReturnType<typeof detalleConteo>>["acta"]["lineas"][number];

/**
 * Corregir lo contado cuando alguien se equivocó. Cada cambio queda en el
 * historial del conteo; si el ajuste ya se aprobó, la diferencia entra al
 * inventario. Las actas se vuelven a generar.
 */
function Corregir({ c, lineas, onCancelar, onHecho }: {
  c: ResumenConteo; lineas: LineaActa[]; onCancelar: () => void; onHecho: (texto: string) => void;
}) {
  const [valores, setValores] = useState(() => new Map(lineas.map((l) => [l.codigo, { texto: fmtCantidad(l.contado), obs: l.observacion ?? "" }])));
  const [q, setQ] = useState("");
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = q.trim().toLowerCase();
  const visibles = lineas.filter((l) => !t || l.codigo.toLowerCase().includes(t) || l.nombre.toLowerCase().includes(t));
  const poner = (codigo: string, p: Partial<{ texto: string; obs: string }>) =>
    setValores((m) => new Map(m).set(codigo, { ...m.get(codigo)!, ...p }));

  const cambios = lineas.flatMap((l) => {
    const v = valores.get(l.codigo)!;
    const lc = leerCantidad(v.texto);
    const cantidad = lc.estado === "ok" || lc.estado === "cero" ? lc.valor : NaN;
    const obs = v.obs.trim() || null;
    return cantidad !== l.contado || obs !== (l.observacion ?? null) ? [{ codigo: l.codigo, cantidad, observacion: obs }] : [];
  });
  const malos = cambios.filter((x) => Number.isNaN(x.cantidad));

  async function guardar() {
    setError(null);
    if (malos.length) return setError(`Revisa la cantidad de ${malos.map((m) => m.codigo).join(", ")}.`);
    setYendo(true);
    try {
      const r = await editarConteo(c.id, cambios);
      if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
      onHecho(`${r.cambiados} renglón(es) corregido(s).` +
        (c.ajuste === "aprobado" ? " La diferencia de cada corrección entró al inventario." : " El ajuste queda para revisar con los números nuevos.") +
        (r.errorActas ? ` Las actas no se pudieron rehacer: ${r.errorActas}` : " Las actas se generaron de nuevo."));
    } finally { setYendo(false); }
  }

  return (
    <div className="space-y-3 rounded-xl border border-brand/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text">Corregir Conteo</p>
        <input type="search" className="sumi-campo sumi-campo--auto min-w-[12rem] flex-1 sm:max-w-xs" placeholder="Buscar por código o nombre"
          aria-label="Buscar renglón" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-xs text-muted">
        {c.ajuste === "aprobado"
          ? "El ajuste ya se aprobó: la diferencia de cada corrección entra al inventario como movimiento."
          : "Cada cambio queda en el historial del conteo, con tu nombre."}
      </p>
      <div className="max-h-[28rem] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2">Observación</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.map((l) => {
              const v = valores.get(l.codigo)!;
              const cambiado = cambios.some((x) => x.codigo === l.codigo);
              return (
                <tr key={l.codigo} className={cambiado ? "bg-brand/5" : ""}>
                  <td className="px-3 py-1.5"><span className="font-mono text-muted">{l.codigo}</span><span className="block">{l.nombre}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">{l.esNuevo ? "nuevo" : fmtNum(l.sistema)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input className="sumi-campo sumi-campo--auto w-24 text-right tabular-nums" inputMode="decimal" value={v.texto}
                      aria-label={`Contado de ${l.nombre}`} onChange={(e) => poner(l.codigo, { texto: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <input className="sumi-campo" value={v.obs} placeholder="Opcional" aria-label={`Observación de ${l.nombre}`}
                      onChange={(e) => poner(l.codigo, { obs: e.target.value })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button icon="check" cargando={yendo} textoCargando="Guardando…" disabled={!cambios.length || yendo} onClick={guardar}>
          {cambios.length ? `Guardar ${cambios.length} cambio(s)` : "Sin cambios"}
        </Button>
      </div>
    </div>
  );
}
