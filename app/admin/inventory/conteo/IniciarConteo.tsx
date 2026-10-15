"use client";

// Elegir qué se cuenta, con palabras simples y tres opciones grandes:
//   · Los 75 Más Vendidos;
//   · Lista Personalizada (por departamento: luego cuál, en botones);
//   · Todos los Items.
//
// Pedido del usuario (14-10-2026): la pestaña Conteo muestra el historial, y
// un conteo se empieza con el botón «Iniciar Conteo», que abre una ventana en
// dos pasos: qué se cuenta y quién cuenta (IniciarConteo). La misma elección,
// con un conteo abierto, sale desde «Cambiar qué se cuenta» (CambiarConteo):
// sin nada contado lo cambia sin perder nada; con algo contado solo se puede
// pasar a Todos los Items, que lo conserva.
// Solo puede haber un conteo abierto por empresa.

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { abrirConteo, cambiarAlcance, departamentosDe, type Conteo } from "@/lib/inventory/conteos-db";
import { contadoresDe } from "@/lib/inventory/contadores";

type Tipo = "planilla" | "departamento" | "general";
type Que = { planilla: true } | { general: true } | { departamento: string };

const OPCIONES: { id: Tipo; titulo: string; texto: string; icono: IconName }[] = [
  { id: "planilla", titulo: "Los 75 Más Vendidos", texto: "La lista corta: los 75 artículos que más se venden.", icono: "report" },
  { id: "departamento", titulo: "Lista Personalizada", texto: "Por departamento: eliges cuál quieres contar, por ejemplo Soldadura.", icono: "building" },
  { id: "general", titulo: "Todos los Items", texto: "Todos los artículos de todos los departamentos. Toma más tiempo.", icono: "inventory" },
];

/** Qué se está contando, dicho para una persona. */
export const queCuenta = (c: Conteo) =>
  c.origen === "planilla" ? "Los 75 Más Vendidos" : c.origen === "general" ? "Todos los Items"
    : c.departamento ? `el departamento ${c.departamento} - ${c.departamentoNombre ?? ""}` : "un conteo sin departamento";

/** La ventana «Cambiar qué se cuenta», para un conteo que ya está abierto. */
export function CambiarConteo({ empresa, conteo, onCerrar, onListo }: { empresa: string; conteo: Conteo; onCerrar: () => void; onListo: () => void }) {
  return (
    <Modal titulo="Cambiar Qué Se Cuenta" onCerrar={onCerrar} ancho="max-w-2xl">
      <ElegirConteo empresa={empresa} abierto={conteo} onListo={onListo} onCancelar={onCerrar} />
    </Modal>
  );
}

/** Elegir qué contar. Sin `abierto` empieza un conteo; con él, lo cambia. */
export function ElegirConteo({ empresa, abierto: c, onListo, onCancelar, onSiguiente }: {
  empresa: string; abierto: Conteo | null; onListo: () => void; onCancelar?: () => void;
  /** Al iniciar: en vez de abrir el conteo aquí, pasa al paso «¿Quién va a contar?». */
  onSiguiente?: (que: Que, nombre: string) => void;
}) {
  const deps = useCarga(`dep:${empresa}`, () => departamentosDe(empresa));
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [depto, setDepto] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enVentana = !!onCancelar;
  const conAnotado = !!c && c.renglones > 0;
  const contables = (deps.datos ?? []).filter((d) => d.seCuenta);
  // Con algo ya contado, lo único que se puede es pasar a Todos los Items.
  const permitido = (t: Tipo) => !conAnotado || (t === "general" && c!.origen !== "general");
  const elegido = tipo === "departamento" ? contables.find((d) => d.codigo === depto) ?? null : null;
  const listo = tipo !== null && permitido(tipo) && (tipo !== "departamento" || !!elegido) && !(c && mismoQueAbierto(c, tipo, depto));
  const nombreElegido = tipo === "departamento" ? (elegido ? `${elegido.codigo} · ${capitalizar(elegido.nombre)}` : "") : OPCIONES.find((o) => o.id === tipo)?.titulo ?? "";

  async function empezar() {
    if (!tipo || !listo) return;
    setError(null); setYendo(true);
    try {
      const que: Que = tipo === "planilla" ? { planilla: true } : tipo === "general" ? { general: true } : { departamento: depto! };
      if (onSiguiente && !c) return onSiguiente(que, nombreElegido);
      const r = c ? await cambiarAlcance(c.id, empresa, que) : await abrirConteo(empresa, que);
      if (!r.ok) return setError(r.error);
      onListo();
    } finally { setYendo(false); }
  }

  return (
    <>
      {deps.cargando ? (
        <p className="py-8 text-center text-sm text-muted">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {c && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${conAnotado ? "border-warn/40 bg-warn/10 text-text" : "border-info/30 bg-info/10 text-text"}`}>
              {conAnotado ? (
                <>
                  <p className="font-semibold">Ya contaste {c.renglones} artículo(s) en {queCuenta(c)}.</p>
                  <p className="mt-1 text-muted">
                    Para contar otra cosa, primero cierra este conteo con «Revisar y cerrar».
                    {c.origen !== "general" && " Lo que sí puedes es pasarlo a Todos los Items: lo contado se conserva."}
                  </p>
                </>
              ) : (
                <p>Todavía no has contado nada, así que puedes cambiarlo sin perder nada.</p>
              )}
            </div>
          )}

          {tipo !== "departamento" || !permitido("departamento") ? (
            <>
              <p className={`font-semibold text-text ${enVentana ? "text-base" : "text-lg"}`}>¿Qué Vas a Contar?</p>
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Qué vas a contar">
                {OPCIONES.map((o) => {
                  const ok = permitido(o.id);
                  const activo = tipo === o.id;
                  return (
                    <button key={o.id} type="button" role="radio" aria-checked={activo} disabled={!ok}
                      onClick={() => { setTipo(o.id); setError(null); }}
                      className={`sumi-pulsable flex min-h-36 flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition
                        ${activo ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"}
                        ${ok ? "" : "cursor-not-allowed opacity-45"}`}>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${activo ? "bg-brand text-white" : "bg-surface-2 text-text"}`}>
                        <Icon name={o.icono} size={20} />
                      </span>
                      <span className="text-base font-semibold text-text">{o.titulo}</span>
                      <span className="text-sm leading-snug text-muted">{o.texto}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-text">¿Qué Departamento?</p>
                <Button variant="ghost" onClick={() => { setTipo(null); setDepto(null); }}>← Volver</Button>
              </div>
              <div className="sumi-scroll grid max-h-[38vh] gap-2 overflow-y-auto pr-1 sm:max-h-[50vh] sm:grid-cols-2" role="radiogroup" aria-label="Departamento">
                {contables.map((d) => {
                  const activo = depto === d.codigo;
                  return (
                    <button key={d.codigo} type="button" role="radio" aria-checked={activo} onClick={() => setDepto(d.codigo)}
                      className={`sumi-pulsable flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 text-left transition
                        ${activo ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"}`}>
                      <span className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm font-semibold tabular-nums ${activo ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>{d.codigo}</span>
                      <span className="text-sm font-medium text-text">{capitalizar(d.nombre)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          {/* Siempre a la vista, también en el teléfono con la lista larga. */}
          <div className={`sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface py-3 sm:flex-row sm:items-center sm:justify-end ${enVentana ? "-mx-4 -mb-4 rounded-b-2xl px-4" : "z-10 -mx-5 -mb-5 rounded-b-2xl px-5"}`}>
            {onCancelar && <Button variant="secondary" className="sumi-pulsable min-h-12" onClick={onCancelar}>{conAnotado ? "Seguir contando" : "Cancelar"}</Button>}
            <Button icon="check" className="sumi-pulsable min-h-12 text-base" disabled={!listo} cargando={yendo} textoCargando="Preparando la planilla…" onClick={() => void empezar()}>
              {listo ? (c && conAnotado ? "Pasar a Todos los Items" : c ? `Cambiar a: ${nombreElegido}` : onSiguiente ? "Siguiente: ¿Quién va a contar?" : `Empezar: ${nombreElegido}`)
                : c && tipo && mismoQueAbierto(c, tipo, depto) ? "Eso es lo que ya estás contando"
                : tipo === "departamento" ? "Elige un departamento" : "Elige qué vas a contar"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** ¿Lo elegido es lo mismo que ya está abierto? (no hay nada que cambiar) */
function mismoQueAbierto(c: Conteo, tipo: Tipo, depto: string | null) {
  return (tipo === "planilla" && c.origen === "planilla") || (tipo === "general" && c.origen === "general")
    || (tipo === "departamento" && c.origen === "departamento" && c.departamento === depto);
}

/** «HOGAR Y ACCESORIOS» → «Hogar y Accesorios»: más fácil de leer en botones. */
function capitalizar(s: string) {
  const menores = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "los", "el", "para", "con", "en"]);
  return s.toLowerCase().split(" ").map((p, i) => (i > 0 && menores.has(p) ? p : p.replace(/(^|\/|-)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()))).join(" ");
}

// ---------------------------------------------------------------- iniciar

/**
 * «Iniciar Conteo»: una ventana en dos pasos. Primero qué se cuenta, después
 * quién cuenta (un usuario de la lista, o el nombre escrito). Quién cuenta se
 * guarda con el conteo desde el principio: así lo ve cualquiera que lo siga o
 * lo cierre, en el teléfono o en la computadora.
 */
export function IniciarConteo({ empresa, onCerrar, onIniciado }: { empresa: string; onCerrar: () => void; onIniciado: () => void }) {
  const [que, setQue] = useState<{ que: Que; nombre: string } | null>(null);
  return (
    <Modal titulo={que ? "¿Quién Va a Contar?" : "¿Qué Vas a Contar?"} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="mb-4 flex items-center gap-3" aria-label={`Paso ${que ? 2 : 1} de 2`}>
        <div className="flex flex-1 gap-1.5" aria-hidden>
          <span className="h-1.5 flex-1 rounded-full bg-brand" />
          <span className={`h-1.5 flex-1 rounded-full ${que ? "bg-brand" : "bg-surface-2"}`} />
        </div>
        <span className="text-xs font-medium tabular-nums text-muted">Paso {que ? 2 : 1} de 2</span>
      </div>
      {que
        ? <ElegirQuien empresa={empresa} que={que} onVolver={() => setQue(null)} onIniciado={onIniciado} />
        : <ElegirConteo empresa={empresa} abierto={null} onListo={onIniciado} onCancelar={onCerrar} onSiguiente={(q, nombre) => setQue({ que: q, nombre })} />}
    </Modal>
  );
}

function ElegirQuien({ empresa, que, onVolver, onIniciado }: {
  empresa: string; que: { que: Que; nombre: string }; onVolver: () => void; onIniciado: () => void;
}) {
  const lista = useCarga(`contadores:${empresa}`, () => contadoresDe(empresa));
  const [elegido, setElegido] = useState<string | null>(null);
  const [otra, setOtra] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = (otra ? escrito : elegido ?? "").trim();
  const listo = nombre.length >= 2;

  async function empezar() {
    if (!listo) return;
    setError(null); setYendo(true);
    try {
      const r = await abrirConteo(empresa, que.que, nombre);
      if (!r.ok) return setError(r.error);
      onIniciado();
    } finally { setYendo(false); }
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-text">
        <Icon name="check" size={16} className="text-ok" />
        <span>Vas a contar: <b>{que.nombre}</b></span>
        <button type="button" className="min-h-11 px-1 font-medium text-brand hover:underline" onClick={onVolver}>Cambiar</button>
      </p>

      {lista.cargando ? (
        <p className="py-6 text-center text-sm text-muted">Cargando…</p>
      ) : (
        <div className="sumi-scroll grid max-h-[40vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="radiogroup" aria-label="Quién va a contar">
          {(lista.datos ?? []).map((n) => {
            const activo = !otra && elegido === n;
            return (
              <button key={n} type="button" role="radio" aria-checked={activo} onClick={() => { setElegido(n); setOtra(false); setError(null); }}
                className={`sumi-pulsable flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 text-left transition
                  ${activo ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${activo ? "bg-brand-strong text-white" : "bg-surface-2 text-muted"}`} aria-hidden>
                  {n.trim().charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-text">{n}</span>
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={otra} onClick={() => { setOtra(true); setError(null); }}
            className={`sumi-pulsable flex min-h-14 items-center gap-3 rounded-xl border-2 border-dashed px-3 text-left transition
              ${otra ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${otra ? "bg-brand-strong text-white" : "bg-surface-2 text-muted"}`} aria-hidden>
              <Icon name="plus" size={16} />
            </span>
            <span className="text-sm font-medium text-text">Otra persona: escribir el nombre</span>
          </button>
        </div>
      )}

      {otra && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Nombre y apellido de quien cuenta</span>
          <input className="sumi-campo" value={escrito} onChange={(e) => setEscrito(e.target.value)} autoFocus autoComplete="off"
            placeholder="Por ejemplo: José Rodríguez" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void empezar(); } }} />
        </label>
      )}

      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="secondary" className="sumi-pulsable min-h-12" onClick={onVolver}>← Atrás</Button>
        <Button icon="check" className="sumi-pulsable min-h-12 text-base" disabled={!listo} cargando={yendo} textoCargando="Preparando la planilla…" onClick={() => void empezar()}>
          {listo ? `Empezar conteo · ${nombre}` : "Elige quién va a contar"}
        </Button>
      </div>
    </div>
  );
}
