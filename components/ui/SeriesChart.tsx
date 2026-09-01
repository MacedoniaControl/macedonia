"use client";

// Gráfico de barras agrupadas, en SVG y sin dependencias.
//
// Las barras crecen desde la base al entrar y al cambiar el período, con un
// escalonado leve de izquierda a derecha: eso deja ver QUÉ cambió cuando se
// mueve el rango, en vez de que la imagen salte de un estado a otro.
//
// Se anima `transform: scaleY` y no el alto: el alto recalcula el layout en
// cada cuadro, la transformación la resuelve la GPU.
//
// Con `prefers-reduced-motion` no se anima nada. Un gráfico que se mueve solo
// puede marear a quien tiene sensibilidad vestibular, y el dato es el mismo.

import { useState } from "react";

type Serie = { name: string; color: string; values: number[] };

type SeriesChartProps = {
  labels: string[];
  series: Serie[];
  height?: number;
  /** Cómo escribir los valores en el globo. Por defecto, con separador de miles. */
  formato?: (n: number) => string;
};

const porDefecto = (n: number) => Math.round(n).toLocaleString("es-VE");

export function SeriesChart({ labels, series, height = 240, formato = porDefecto }: SeriesChartProps) {
  const W = 760;
  const H = height;
  const padL = 12, padR = 12, padT = 12, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const base = padT + plotH;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupW = plotW / Math.max(1, labels.length);
  const innerGap = groupW * 0.18;
  const barW = (groupW - innerGap) / Math.max(1, series.length);

  const [encima, setEncima] = useState<number | null>(null);

  // Identifica el conjunto de datos. Al cambiar, las barras se reemplazan y la
  // animación de entrada vuelve a correr.
  const firma = `${labels.length}:${series.map((s) => s.values.join(",")).join("|")}`;


  if (labels.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Sin datos en este período.</p>;
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={`Gráfico comparativo de ${series.map((s) => s.name).join(" y ")}`}
          onMouseLeave={() => setEncima(null)}
        >
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1={padL} x2={W - padR}
              y1={padT + plotH * (1 - t)} y2={padT + plotH * (1 - t)}
              stroke="var(--border)" strokeWidth={1} />
          ))}

          {labels.map((label, i) => {
            const gx = padL + i * groupW + innerGap / 2;
            const activo = encima === null || encima === i;
            return (
              <g key={`${label}-${i}`}>
                {/* Zona sensible de todo el grupo: apuntar a una barra de 8px
                    es imposible; a la columna entera, no. */}
                <rect
                  x={padL + i * groupW} y={padT} width={groupW} height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setEncima(i)}
                />

                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const k = Math.max(0, v) / max;
                  return (
                    <rect
                      // La clave incluye la firma de los datos: al cambiar el
                      // período el elemento se reemplaza y la animación vuelve
                      // a correr, que es lo que deja ver QUÉ cambió.
                      key={`${s.name}-${firma}`}
                      className="sumi-barra"
                      x={gx + si * barW}
                      y={padT}
                      width={barW * 0.84}
                      height={plotH}
                      rx={2}
                      fill={s.color}
                      pointerEvents="none"
                      style={{
                        transform: `scaleY(${k})`,
                        transformOrigin: `0px ${base}px`,
                        animationDelay: `${i * 22 + si * 40}ms`,
                        opacity: activo ? 1 : 0.28,
                        transition: "opacity 160ms ease",
                      }}
                    />
                  );
                })}

                <text
                  x={padL + i * groupW + groupW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill={activo ? "var(--muted)" : "var(--border)"}
                  pointerEvents="none"
                  style={{ transition: "fill 160ms ease" }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Globo con las cifras del grupo. Va en HTML y no en SVG para que el
            texto se lea igual que el resto de la pantalla. */}
        {encima !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((encima + 0.5) / labels.length) * 100}%`,
              transform: `translateX(${encima > labels.length / 2 ? "-100%" : "0"})`,
            }}
          >
            <p className="mb-1 font-medium text-text">{labels[encima]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 whitespace-nowrap text-muted">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                {s.name}
                <span className="ml-auto pl-3 font-medium tabular-nums text-text">
                  {formato(s.values[encima] ?? 0)}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
