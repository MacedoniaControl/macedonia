type Serie = { name: string; color: string; values: number[] };

type SeriesChartProps = {
  labels: string[];
  series: Serie[];
  height?: number;
};

/** Gráfico de barras agrupadas en SVG responsive (sin dependencias). */
export function SeriesChart({ labels, series, height = 240 }: SeriesChartProps) {
  const W = 760;
  const H = height;
  const padL = 12;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupW = plotW / labels.length;
  const innerGap = groupW * 0.18;
  const barW = (groupW - innerGap) / series.length;

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
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Gráfico comparativo">
        {/* líneas guía */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * (1 - t)}
            y2={padT + plotH * (1 - t)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {labels.map((label, i) => {
          const gx = padL + i * groupW + innerGap / 2;
          return (
            <g key={label}>
              {series.map((s, si) => {
                const h = (s.values[i] / max) * plotH;
                return (
                  <rect
                    key={s.name}
                    x={gx + si * barW}
                    y={padT + plotH - h}
                    width={barW * 0.84}
                    height={Math.max(0, h)}
                    rx={2}
                    fill={s.color}
                  />
                );
              })}
              <text
                x={padL + i * groupW + groupW / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted)"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
