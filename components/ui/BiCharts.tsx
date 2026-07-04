"use client";

/**
 * Gráficas BI dinámicas (Recharts). M2 del benchmark Fina: aceptan filtros reales —
 * `factor` (empresa: Sumigases 1 / Sudematin 0.35 / Consolidado 1.35), `bs` (moneda Bs)
 * y `count` (rango: últimos N meses). Data real Sumigases 2024.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { months, series, categoriasMasRentables, RATE_BS } from "@/lib/ux/dashboard-data";

export type BiFilter = { factor?: number; bs?: boolean; count?: number };

const axisStyle = { fill: "var(--color-muted)", fontSize: 11 } as const;
const tooltipContentStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-text)",
  fontSize: 12,
} as const;
const tooltipLabelStyle = { color: "var(--color-brand)", fontWeight: 700 } as const;
const legendFormatter = (value: string) => (
  <span style={{ color: "var(--color-muted)", fontSize: 11 }}>{value}</span>
);

function fmt(v: number, bs: boolean) {
  const n = bs ? v * RATE_BS : v;
  const s = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
  return bs ? `${s} Bs` : `$${s}`;
}

function buildData({ factor = 1, count = 12 }: BiFilter) {
  const from = 12 - Math.min(12, Math.max(1, count));
  return months.slice(from).map((mes, i) => ({
    mes,
    ventas: Math.round(series.ventas[from + i] * factor),
    utilidad: Math.round(series.utilidad[from + i] * factor),
    compras: Math.round(series.compras[from + i] * factor),
  }));
}

const DONUT_COLORS = ["var(--color-brand)", "var(--color-navy)", "var(--color-accent)", "var(--color-info)"];

export function BiVentasUtilidad(f: BiFilter) {
  const data = buildData(f);
  const bs = !!f.bs;
  return (
    <ResponsiveContainer height={280} width="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v), bs)} />
        <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(v) => fmt(Number(v), bs)} />
        <Legend formatter={legendFormatter} />
        <Line type="monotone" dataKey="ventas" name="Ventas" stroke="var(--color-brand)" strokeWidth={2.5}
          dot={{ fill: "var(--color-brand)", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="var(--color-accent)" strokeWidth={2.5}
          dot={{ fill: "var(--color-accent)", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BiVentasCompras(f: BiFilter) {
  const data = buildData(f);
  const bs = !!f.bs;
  return (
    <ResponsiveContainer height={260} width="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v), bs)} />
        <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(v) => fmt(Number(v), bs)} />
        <Legend formatter={legendFormatter} />
        <Bar dataKey="ventas" name="Ventas" fill="var(--color-brand)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="compras" name="Compras" fill="var(--color-info)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BiCategoriasDonut() {
  const data = categoriasMasRentables.map((c) => ({ name: c.nombre, value: c.margen }));
  return (
    <ResponsiveContainer height={260} width="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(v, n) => [`${v}%`, n as string]} />
        <Legend formatter={legendFormatter} />
      </PieChart>
    </ResponsiveContainer>
  );
}
