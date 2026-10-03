"use client";

// El gráfico dinámico (BI) que usan el histórico y Reportes.
//
//   · líneas o barras; cada serie se enciende o apaga tocando su nombre;
//   · al pasar el cursor, tocar o con las flechas del teclado, un globo da los
//     valores del período y su variación contra el anterior (en % para montos,
//     en puntos para porcentajes), más lo que agregue quien lo usa (`pie`);
//   · mide su ancho real: en el teléfono las letras siguen legibles.
// Qué se dibuja lo decide quien lo usa: puntos (períodos) y series.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { marcasEje, variacion } from "@/lib/ux/historico-bi";

export type PuntoGrafico = { clave: string; etiqueta: string; etiquetaLarga: string; incompleto?: boolean };
export type SerieGrafico = { key: string; nombre: string; color: string; valores: number[]; encendida?: boolean };

export const chip = "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors";
const activo = "border-brand-strong bg-brand-soft text-brand";
const quieto = "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text";

/** Una fila de píldoras de las que se elige una. */
export function Grupo<T extends string>({ etiqueta, opciones, valor, onCambio }: {
  etiqueta: string; opciones: { id: T; label: string }[]; valor: T; onCambio: (v: T) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => onCambio(o.id)}
          className={`${chip} ${valor === o.id ? activo : quieto}`}>{o.label}</button>
      ))}
    </div>
  );
}

const padL = 64, padR = 12, padT = 14, padB = 28;

export function GraficoBI({
  puntos, series: todas, formato, abreviar, variacionEn = "pct", pie, alto = 280, descripcion,
}: {
  puntos: PuntoGrafico[];
  series: SerieGrafico[];
  /** El valor completo, para el globo: «$12.345», «43,5 %». */
  formato: (n: number) => string;
  /** El valor corto, para el eje: «$12 mil». */
  abreviar: (n: number) => string;
  /** Cómo se compara con el período anterior: % para montos, puntos para porcentajes. */
  variacionEn?: "pct" | "puntos";
  /** Lo que va al pie del globo del período `i` (margen, ROI…). */
  pie?: (i: number) => ReactNode;
  alto?: number;
  /** Para lectores de pantalla: qué muestra el gráfico. */
  descripcion: string;
}) {
  const [vista, setVista] = useState<"lineas" | "barras">("lineas");
  const [visibles, setVisibles] = useState<Set<string>>(() => new Set(todas.filter((s) => s.encendida !== false).map((s) => s.key)));
  const [focoBruto, setFoco] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = puntos.length;
  const foco = focoBruto !== null && focoBruto < n ? focoBruto : null;
  const series = todas.filter((s) => visibles.has(s.key));
  const H = alto, plotW = W - padL - padR, plotH = H - padT - padB;
  const valores = series.flatMap((s) => s.valores);
  const ticks = marcasEje(Math.max(1, ...valores));
  const tope = ticks[ticks.length - 1] || 1;
  const minimo = Math.min(0, ...valores);
  const y = (v: number) => padT + plotH - ((v - minimo) / (tope - minimo)) * plotH;
  const grupoW = plotW / Math.max(1, n);
  const cx = (i: number) => (vista === "barras" ? padL + grupoW * (i + 0.5) : padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW));
  const paso = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(plotW / 58))));
  const barW = (grupoW * 0.72) / Math.max(1, series.length);

  function indiceDe(clientX: number) {
    const el = svg.current; if (!el || n === 0) return null;
    const b = el.getBoundingClientRect();
    const vx = ((clientX - b.left) / b.width) * W;
    const i = vista === "barras" ? Math.floor((vx - padL) / grupoW) : Math.round(((vx - padL) / plotW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  }
  const alternar = (k: string) => setVisibles((v) => {
    const s = new Set(v); if (s.has(k)) { if (s.size > 1) s.delete(k); } else s.add(k); return s;
  });

  if (n === 0) return <p className="py-10 text-center text-sm text-muted">Sin datos en este período.</p>;
  const p = foco !== null ? puntos[foco] : null;

  return (
    <div className="w-full min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Series del gráfico">
          {todas.map((s) => (
            <button key={s.key} type="button" aria-pressed={visibles.has(s.key)} onClick={() => alternar(s.key)}
              className={`${chip} flex items-center gap-1.5 ${visibles.has(s.key) ? "border-border-strong bg-surface text-text" : "border-border bg-surface text-muted line-through opacity-60"}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.nombre}
            </button>
          ))}
        </div>
        <Grupo etiqueta="Vista" valor={vista} onCambio={(v) => { setVista(v); setFoco(null); }}
          opciones={[{ id: "lineas", label: "Líneas" }, { id: "barras", label: "Barras" }]} />
      </div>

      <div ref={caja} className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} tabIndex={0} role="img"
          aria-label={`${descripcion}: ${n} período(s). Usa las flechas para recorrerlo.`}
          className="touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          onPointerMove={(e) => setFoco(indiceDe(e.clientX))}
          onPointerDown={(e) => setFoco(indiceDe(e.clientX))}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setFoco(null); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); setFoco(Math.min(n - 1, (foco ?? -1) + 1)); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); setFoco(Math.max(0, (foco ?? n) - 1)); }
            else if (e.key === "Escape") setFoco(null);
          }}
          onBlur={() => setFoco(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--color-muted)">{abreviar(t)}</text>
            </g>
          ))}
          {puntos.map((q, i) => (i % paso === 0 || i === n - 1) && (
            // En líneas, la primera y la última se alinean hacia adentro: centradas se cortaban en el borde.
            <text key={q.clave} x={cx(i)} y={H - 8} fontSize={11} fill="var(--color-muted)"
              textAnchor={vista === "lineas" && n > 1 && i === 0 ? "start" : vista === "lineas" && n > 1 && i === n - 1 ? "end" : "middle"}>{q.etiqueta}</text>
          ))}
          {foco !== null && (
            vista === "barras"
              ? <rect x={padL + grupoW * foco} y={padT} width={grupoW} height={plotH} fill="var(--color-surface-2)" />
              : <line x1={cx(foco)} x2={cx(foco)} y1={padT} y2={padT + plotH} stroke="var(--color-border-strong)" strokeDasharray="3 3" />
          )}
          {vista === "barras"
            ? puntos.map((q, i) => series.map((s, j) => {
                const v = s.valores[i] ?? 0, top = y(Math.max(0, v)), base = y(Math.min(0, v));
                return <rect key={`${q.clave}-${s.key}`} x={padL + grupoW * i + grupoW * 0.14 + j * barW} y={top}
                  width={Math.max(1, barW - 1)} height={Math.max(0.5, base - top)} rx={1.5} fill={s.color}
                  opacity={foco === null || foco === i ? 1 : 0.45} />;
              }))
            : series.map((s) => (
                <g key={s.key}>
                  <polyline points={puntos.map((_, i) => `${cx(i)},${y(s.valores[i] ?? 0)}`).join(" ")} fill="none" stroke={s.color}
                    strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {puntos.map((q, i) => (n <= 24 || i === foco) && (
                    <circle key={q.clave} cx={cx(i)} cy={y(s.valores[i] ?? 0)} r={i === foco ? 4.5 : 2.5} fill={s.color}
                      stroke="var(--color-surface)" strokeWidth={i === foco ? 2 : 0} />
                  ))}
                </g>
              ))}
          {minimo < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--color-border-strong)" />}
        </svg>

        {p && foco !== null && (
          <div role="status" aria-live="polite"
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-border bg-surface p-3 text-xs shadow-lg"
            style={{ left: `clamp(0px, calc(${(cx(foco) / W) * 100}% - 7rem), calc(100% - 14rem))` }}>
            <p className="mb-1.5 font-semibold text-text">
              {p.etiquetaLarga}{p.incompleto && <span className="ml-1 font-normal text-warn">· incompleto</span>}
            </p>
            {series.map((s) => {
              const v = s.valores[foco] ?? 0, a = foco > 0 ? s.valores[foco - 1] : undefined;
              const d = variacionEn === "puntos" ? (a === undefined ? null : Math.round((v - a) * 10) / 10) : variacion(v, a);
              return (
                <p key={s.key} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.nombre}</span>
                  <span className="tabular-nums text-text">
                    {formato(v)}
                    {d !== null && <span className={`ml-1 ${d >= 0 ? "text-ok" : "text-danger"}`}>
                      {d >= 0 ? "▲" : "▼"} {Math.abs(d).toLocaleString("es-VE")}{variacionEn === "puntos" ? " pts" : "%"}
                    </span>}
                  </span>
                </p>
              );
            })}
            {pie && <div className="mt-1.5 border-t border-border pt-1.5 text-muted">{pie(foco)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
