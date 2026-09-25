"use client";

// Historial de movimientos de cilindros: solo Owner y Administrador, igual que
// el historial de conteos del inventario (migración 26).
//
// Cada movimiento dice qué fue (alta, entrega, retorno, cambio de estado,
// baja), quién lo registró y quién lo autorizó. Corregir deja escrito qué
// cambió; eliminar deja la línea «Se eliminó …», y el movimiento deja de
// contar en el Parque y la Rampa.

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { useCarga } from "@/lib/ux/use-carga";
import { useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";
import { NOTA_CONTEO_RAMPA } from "@/lib/cilindros/rampa";
import {
  editarMovCilindro, eliminarMovCilindro, historialCilindros, type EstadoCilindro, type MovCilindro,
} from "@/lib/cilindros/cilindros-db";

const ESTADO: Record<EstadoCilindro, string> = {
  lleno: "Lleno", vacio: "Vacío", en_cliente: "En cliente", en_llenado: "En llenado", fuera_servicio: "Fuera de servicio",
};

/** Qué fue el movimiento, en palabras. */
export function tipoDe(m: Pick<MovCilindro, "desde" | "hacia"> & { nota?: string | null }): { t: string; tone: Tone } {
  if (m.nota?.startsWith(NOTA_CONTEO_RAMPA)) return { t: "Conteo de rampa", tone: "warn" };
  if (!m.desde) return { t: "Alta", tone: "ok" };
  if (!m.hacia) return { t: "Baja", tone: "danger" };
  if (m.hacia === "en_cliente") return { t: "Entrega a cliente", tone: "info" };
  if (m.desde === "en_cliente") return { t: "Retorno de cliente", tone: "brand" };
  return { t: "Cambio de estado", tone: "muted" };
}

const tramo = (m: MovCilindro) => `${m.desde ? ESTADO[m.desde] : "—"} → ${m.hacia ? ESTADO[m.hacia] : "—"}`;

export function HistorialCilindros({ empresa, recarga, onCambio }: { empresa: string; recarga: number; onCambio: () => void }) {
  const [propia, setPropia] = useState(0);
  const carga = useCarga(`cilhist:${empresa}:${recarga}:${propia}`, () => historialCilindros(empresa));
  const lista = carga.datos ?? [];
  const [gas, setGas] = useState("");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<MovCilindro | null>(null);
  const gases = [...new Set(lista.map((m) => m.gas))].sort();
  const t = q.trim().toLowerCase();
  const visibles = lista.filter((m) => (!gas || m.gas === gas) &&
    (!t || [m.cliente, m.documento, m.nota, m.registro, m.retiradoPor, tipoDe(m).t].some((x) => x?.toLowerCase().includes(t))));
  const cambio = () => { setPropia((n) => n + 1); onCambio(); };

  useExportable(() => ({
    modulo: "",
    seccion: "Historial de Cilindros",
    titulo: "Historial de Cilindros",
    detalle: [gas ? `Gas: ${gas}` : "Todos los gases", ...(t ? [`Búsqueda: «${q.trim()}»`] : []), "Del más reciente al más antiguo"],
    columnas: [
      { titulo: "Fecha", tipo: "fecha" }, { titulo: "Tipo" }, { titulo: "Gas" }, { titulo: "Cantidad", tipo: "num" },
      { titulo: "Estado" }, { titulo: "Cliente" }, { titulo: "Documento" }, { titulo: "Registró" }, { titulo: "Autorizó" },
      { titulo: "Retiró" }, { titulo: "Nota" },
    ],
    filas: visibles.map((m) => m.eliminado
      ? [fechaVista(m.fecha), "Eliminado", m.gas, m.cantidad, tramo(m), m.cliente, m.documento, m.registro, m.autorizo, m.retiradoPor,
         `Eliminado por ${m.eliminado.por} el ${m.eliminado.en}`]
      : [fechaVista(m.fecha), tipoDe(m).t, m.gas, m.cantidad, tramo(m), m.cliente, m.documento, m.registro, m.autorizo, m.retiradoPor,
         [m.nota, m.edicion ? `Corregido: ${m.edicion}` : null].filter(Boolean).join(" · ") || null]),
    nota: "Los movimientos eliminados no cuentan en el Parque ni en la Rampa.",
  }));

  return (
    <SectionCard title="Historial de Cilindros" description="Cada alta, entrega, retorno y cambio de estado, con quién lo registró.">
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="h-gas">Gas</label>
        <select id="h-gas" className="sumi-campo sumi-campo--auto min-w-[10rem]" value={gas} onChange={(e) => setGas(e.target.value)}>
          <option value="">Todos los gases</option>
          {gases.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input type="search" className="sumi-campo sumi-campo--auto min-w-[12rem] flex-1 sm:max-w-sm" placeholder="Buscar cliente, documento o nota"
          aria-label="Buscar en el historial" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <EstadoDatos cargando={carga.cargando} error={carga.error} vacio={visibles.length === 0}
        tituloVacio={lista.length ? "Nada coincide" : "Todavía no hay movimientos"}
        mensajeVacio={lista.length ? "Cambia el gas o la búsqueda." : "Aparecen aquí apenas se registre una entrega, una salida o un alta."}>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {visibles.map((m) => m.eliminado ? <Eliminado key={m.id} m={m} /> : (
            <li key={m.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-start">
              <span className="text-xs tabular-nums text-muted">{fechaVista(m.fecha)}<span className="block">{m.registradoEn.slice(11)}</span></span>
              <span className="min-w-0 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={tipoDe(m).tone}>{tipoDe(m).t}</StatusBadge>
                  <b className="font-semibold text-text">{m.cantidad.toLocaleString("es-VE")} × {m.gas}</b>
                  <span className="text-xs text-muted">{tramo(m)}</span>
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {[m.cliente && `Cliente: ${m.cliente}`, m.documento && `Doc. ${m.documento}`, m.retiradoPor && `Retiró: ${m.retiradoPor}`,
                    m.autorizo && `Autorizó: ${m.autorizo}`, `Registró: ${m.registro ?? "—"}`].filter(Boolean).join(" · ")}
                </span>
                {m.nota && <span className="mt-0.5 block text-xs text-text">{m.nota}</span>}
                {m.edicion && <span className="mt-0.5 block text-[11px] italic text-muted">Corregido: {m.edicion}</span>}
              </span>
              <span className="flex flex-wrap gap-1 sm:justify-end">
                <Button variant="ghost" onClick={() => setEditando(m)}>Corregir</Button>
                <BotonEliminar m={m} onEliminado={cambio} />
              </span>
            </li>
          ))}
        </ul>
      </EstadoDatos>
      {editando && <Corregir m={editando} onCerrar={() => setEditando(null)} onHecho={() => { setEditando(null); cambio(); }} />}
    </SectionCard>
  );
}

/** La línea de un movimiento eliminado, como un mensaje borrado en WhatsApp. */
function Eliminado({ m }: { m: MovCilindro }) {
  return (
    <li className="flex items-start gap-2.5 px-3 py-3 text-sm text-muted">
      <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
      </svg>
      <span className="min-w-0">
        <span className="block italic">
          Se eliminó {tipoDe(m).t.toLowerCase()}: {m.cantidad.toLocaleString("es-VE")} × {m.gas}{m.cliente ? ` · ${m.cliente}` : ""} · {fechaVista(m.fecha)}
        </span>
        <span className="block text-xs">Por <b className="font-medium text-text">{m.eliminado!.por}</b> · {m.eliminado!.en}</span>
      </span>
    </li>
  );
}

function BotonEliminar({ m, onEliminado }: { m: MovCilindro; onEliminado: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <ConfirmDialog
        title="¿Eliminar el movimiento?"
        message={`Se eliminará ${tipoDe(m).t.toLowerCase()} de ${m.cantidad} × ${m.gas}${m.cliente ? ` (${m.cliente})` : ""} del ${fechaVista(m.fecha)}. Dejará de contar en el Parque y la Rampa, y en el historial quedará una línea con tu nombre y la hora.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="No"
        onConfirm={async () => {
          setError(null);
          const r = await eliminarMovCilindro(m.id);
          if (!r.ok) return setError(r.error ?? "No se pudo eliminar.");
          onEliminado();
        }}
        trigger={(abrir) => <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={abrir}>Eliminar</Button>}
      />
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}

function Corregir({ m, onCerrar, onHecho }: { m: MovCilindro; onCerrar: () => void; onHecho: () => void }) {
  const [f, setF] = useState({ cantidad: String(m.cantidad), cliente: m.cliente ?? "", documento: m.documento ?? "", retirado: m.retiradoPor ?? "", nota: m.nota ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const conCliente = m.desde === "en_cliente" || m.hacia === "en_cliente";
  const campo = (label: string, el: React.ReactNode) => (
    <label className="block"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>{el}</label>
  );

  async function guardar() {
    setError(null);
    const cantidad = Number(f.cantidad.replace(/\./g, "").replace(",", "."));
    setYendo(true);
    try {
      const r = await editarMovCilindro(m.id, {
        cantidad, cliente: f.cliente, documento: f.documento, retirado_por: f.retirado, nota: f.nota,
      });
      if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
      onHecho();
    } finally { setYendo(false); }
  }

  return (
    <Modal titulo="Corregir Movimiento" onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {tipoDe(m).t} · {m.gas} · {tramo(m)} · {fechaVista(m.fecha)}. El gas y los estados no se cambian: si están mal,
          elimina este movimiento y registra el correcto.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("Cantidad", <input className="sumi-campo" inputMode="numeric" value={f.cantidad} onChange={(e) => set({ cantidad: e.target.value })} />)}
          {campo("Documento", <input className="sumi-campo" value={f.documento} placeholder="N° de nota" onChange={(e) => set({ documento: e.target.value })} />)}
          {conCliente && campo("Cliente", <input className="sumi-campo" value={f.cliente} onChange={(e) => set({ cliente: e.target.value })} />)}
          {m.hacia === "en_cliente" && campo("Retiró", <input className="sumi-campo" value={f.retirado} onChange={(e) => set({ retirado: e.target.value })} />)}
        </div>
        {campo("Nota", <input className="sumi-campo" value={f.nota} placeholder="Opcional" onChange={(e) => set({ nota: e.target.value })} />)}
        <p className="text-xs text-muted">La corrección queda escrita en el movimiento, con tu nombre y la hora.</p>
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button icon="check" cargando={yendo} textoCargando="Guardando…" onClick={guardar}>Guardar corrección</Button>
        </div>
      </div>
    </Modal>
  );
}
