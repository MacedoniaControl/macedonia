"use client";

// Un recuadro de «Por cartera» / «Por clase»: el nombre, su parte del total con
// una barra, la deuda y tres cifras. Tocarlo filtra ese segmento.

import { Cifra } from "@/components/ui/Cifra";

export function TarjetaSegmento({ nombre, sub, total, parte, barras, datos, activa, onClick }: {
  nombre: string;
  sub: string;
  total: string;
  /** Parte del total, en %. */
  parte: number;
  /** Las porciones de la barra (una sola, o varias en el consolidado). */
  barras: { parte: number; color: string }[];
  datos: { label: string; valor: string; peligro?: boolean }[];
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={activa} onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${activa ? "border-brand-strong bg-brand-soft" : "border-border bg-surface-2 hover:border-border-strong"}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">{nombre}</span>
          <span className="block text-[11px] text-muted">{sub}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">{parte.toLocaleString("es-VE")} %</span>
      </span>
      <span className="mt-2 block text-xl font-semibold tabular-nums text-text"><Cifra texto={total} /></span>
      <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
        {barras.map((b, i) => (
          <span key={i} className={`block h-full border-r border-surface last:border-r-0 ${b.color}`} style={{ width: `${Math.min(100, Math.max(0, b.parte))}%` }} />
        ))}
      </span>
      <span className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {datos.map((d) => (
          <span key={d.label}><span className="block text-muted">{d.label}</span><b className={`tabular-nums ${d.peligro ? "text-danger" : "text-text"}`}><Cifra texto={d.valor} /></b></span>
        ))}
      </span>
    </button>
  );
}
