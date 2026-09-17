"use client";

// Selector de período: qué tramo de tiempo y cómo agruparlo.
//
// Uno solo para Dashboard, Reportes, ROI y Matrices. Si cada pantalla arma el
// suyo, dos de ellas terminan mostrando cifras distintas del mismo período y
// nadie sabe cuál creer.
//
// Antes eran once controles del mismo peso en dos filas: cinco atajos, dos
// fechas siempre visibles y tres píldoras de agrupación. Y las dos tandas de
// píldoras se parecian sin decir en que se diferencian -«3 meses» es el
// período, «Meses» es como se agrupa-, asi que se leian como una sola fila
// rota. Ahora el período son píldoras, la agrupación es un desplegable con su
// rótulo, y las fechas solo aparecen cuando se piden.

import { useState } from "react";
import { PRESETS, hoyISO, INICIO_OPERACIONES, type Rango, type Agrupacion } from "@/lib/ux/rango";

const chip =
  "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors";
const activoCls = "border-brand-strong bg-brand-soft text-brand";
const quietoCls = "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text";

const AGRUPACIONES: { id: Agrupacion; label: string }[] = [
  { id: "semana", label: "Semanas" },
  { id: "mes", label: "Meses" },
  { id: "anio", label: "Años" },
];

export function SelectorRango({
  valor,
  onCambio,
  mostrarAgrupacion = true,
  agrupaciones,
}: {
  valor: Rango;
  onCambio: (r: Rango) => void;
  mostrarAgrupacion?: boolean;
  /** Cuáles ofrecer. Por defecto las tres. */
  agrupaciones?: Agrupacion[];
}) {
  // Un atajo está activo si sus fechas coinciden con las actuales. Al tocar una
  // fecha a mano ninguno queda marcado, y eso se muestra como «Personalizado»:
  // antes no se marcaba nada y la barra parecia sin elegir.
  const activo = PRESETS.find((p) => {
    const r = p.rango();
    return r.desde === valor.desde && r.hasta === valor.hasta;
  })?.id;

  // Las fechas se abren solas si el rango no calza con ningún atajo: si alguien
  // vuelve a la pantalla con un rango a mano, tiene que poder verlo.
  const [abierto, setAbierto] = useState(false);
  const personalizado = abierto || !activo;

  const opciones = AGRUPACIONES.filter((a) => !agrupaciones || agrupaciones.includes(a.id));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Periodo. En el telefono se desplaza en lugar de partirse en dos
            filas: una fila que se rompe se lee como dos grupos distintos. */}
        <div className="sumi-tabs -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Período">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setAbierto(false); onCambio({ ...valor, ...p.rango() }); }}
              aria-pressed={activo === p.id && !abierto}
              className={`${chip} ${activo === p.id && !abierto ? activoCls : quietoCls}`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-pressed={personalizado}
            className={`${chip} ${personalizado ? activoCls : quietoCls}`}
          >
            Personalizado
          </button>
        </div>

        {mostrarAgrupacion && opciones.length > 1 && (
          // Desplegable y no píldoras: tres píldoras mas al lado de las del
          // período se confunden con ellas. El rótulo dice que hace, que las
          // píldoras solas no decían.
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
            Agrupar por
            <select
              value={valor.agrupacion}
              onChange={(e) => onCambio({ ...valor, agrupacion: e.target.value as Agrupacion })}
              className="h-11 rounded-xl border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            >
              {opciones.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {personalizado && (
        // Solo cuando se piden. Dos campos de fecha nativos ocupan mucho y casi
        // siempre se usa un atajo: tenerlos siempre delante era pagar espacio
        // por algo que rara vez se toca.
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Desde
            <input
              type="date"
              value={valor.desde}
              min={INICIO_OPERACIONES}
              max={valor.hasta}
              onChange={(e) => onCambio({ ...valor, desde: e.target.value })}
              className="h-11 rounded-xl border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Hasta
            <input
              type="date"
              value={valor.hasta}
              min={valor.desde}
              max={hoyISO()}
              onChange={(e) => onCambio({ ...valor, hasta: e.target.value })}
              className="h-11 rounded-xl border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </label>
        </div>
      )}
    </div>
  );
}
