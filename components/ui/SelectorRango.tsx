"use client";

// Selector de período: atajos, fechas a mano y agrupación.
//
// Uno solo para Dashboard, Reportes, ROI y Matrices. Si cada pantalla arma el
// suyo, dos de ellas terminan mostrando cifras distintas del mismo período y
// nadie sabe cuál creer.

import { PRESETS, hoyISO, INICIO_OPERACIONES, type Rango, type Agrupacion } from "@/lib/ux/rango";

const chip = "min-h-9 rounded-full border px-3 text-sm font-medium transition";
const fecha =
  "h-9 rounded-xl border border-border-strong bg-surface px-2 text-sm text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

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
  // Un atajo está activo si sus fechas coinciden con las actuales. Así, al
  // tocar una fecha a mano, ningún atajo queda marcado — que es la verdad.
  const activo = PRESETS.find((p) => {
    const r = p.rango();
    return r.desde === valor.desde && r.hasta === valor.hasta;
  })?.id;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onCambio({ ...valor, ...p.rango() })}
            aria-pressed={activo === p.id}
            className={`${chip} ${activo === p.id
              ? "border-brand-strong bg-brand-soft text-brand"
              : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

      <label className="flex items-center gap-1.5 text-xs text-muted">
        Desde
        <input
          type="date"
          value={valor.desde}
          min={INICIO_OPERACIONES}
          max={valor.hasta}
          onChange={(e) => onCambio({ ...valor, desde: e.target.value })}
          className={fecha}
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        Hasta
        <input
          type="date"
          value={valor.hasta}
          min={valor.desde}
          max={hoyISO()}
          onChange={(e) => onCambio({ ...valor, hasta: e.target.value })}
          className={fecha}
        />
      </label>

      {mostrarAgrupacion && (
        <>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <div className="flex gap-1.5" role="group" aria-label="Agrupar por">
            {AGRUPACIONES.filter((a) => !agrupaciones || agrupaciones.includes(a.id)).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onCambio({ ...valor, agrupacion: a.id })}
                aria-pressed={valor.agrupacion === a.id}
                className={`${chip} ${valor.agrupacion === a.id
                  ? "border-brand-strong bg-brand-soft text-brand"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
