"use client";

// El histórico de ventas, compras y utilidad como gráfico dinámico (BI).
//
// Antes era una imagen fija de 40 meses: no se podía ver un número, ni acotar
// el período, ni comparar trimestres. Ahora:
//   · ventana (12 o 24 meses, un año o todo), agrupación (mes, trimestre, año),
//     moneda (dólares o los bolívares FACTURADOS) y vista (líneas o barras);
//   · cada serie se enciende o apaga tocando su nombre;
//   · al pasar el dedo o el cursor (o con las flechas del teclado) un globo da
//     los montos del período, su variación contra el anterior, margen y ROI;
//   · arriba, el resumen de lo que se está viendo; abajo, la tabla.
// Las cuentas están en lib/ux/historico-bi.ts. Cada empresa ve sus números.

import { useEffect, useMemo, useRef, useState } from "react";
import { getHistory } from "@/lib/ux/history-data";
import {
  abreviar, agrupar, aniosDe, marcasEje, mesesEnVentana, resumir, variacion,
  type AgrupacionBI, type MonedaBI, type PeriodoBI, type SerieBI, type VentanaBI,
} from "@/lib/ux/historico-bi";

const SERIES: { key: SerieBI; nombre: string; color: string }[] = [
  { key: "venta", nombre: "Ventas", color: "var(--color-brand)" },
  { key: "compra", nombre: "Compras", color: "var(--color-warn)" },
  { key: "util", nombre: "Utilidad", color: "var(--color-ok)" },
  { key: "costo", nombre: "Costo", color: "var(--color-info)" },
];

const chip = "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors";
const activo = "border-brand-strong bg-brand-soft text-brand";
const quieto = "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text";

function Grupo<T extends string>({ etiqueta, opciones, valor, onCambio }: {
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

export function HistoriaBI({ empresa = "sumigases", height = 280 }: { empresa?: string; height?: number }) {
  const h = getHistory(empresa);
  const [ventana, setVentana] = useState<VentanaBI>("todo");
  const [agr, setAgr] = useState<AgrupacionBI>("mes");
  const [moneda, setMoneda] = useState<MonedaBI>("usd");
  const [vista, setVista] = useState<"lineas" | "barras">("lineas");
  const [visibles, setVisibles] = useState<Set<SerieBI>>(new Set(["venta", "compra", "util"]));
  const [foco, setFoco] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // El ancho real de la caja: con un ancho fijo, en el teléfono el gráfico se
  // achicaba entero y las letras no se leían.
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const anios = aniosDe(h.months);
  const incompletos = h.meta.incompletos.map((m) => m.ym);
  const ps: PeriodoBI[] = useMemo(
    () => agrupar(mesesEnVentana(h.months, ventana), agr, moneda, incompletos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empresa, ventana, agr, moneda],
  );
  const r = resumir(ps);
  const series = SERIES.filter((s) => visibles.has(s.key));
  const fmt = (n: number) => (moneda === "bs"
    ? `${Math.round(n).toLocaleString("es-VE")} Bs`
    : `$${Math.round(n).toLocaleString("es-VE")}`);

  if (h.months.length === 0) return <p className="text-sm text-muted">Sin datos para esta empresa.</p>;

  const H = height, plotW = W - padL - padR, plotH = H - padT - padB;
  const n = ps.length;
  const max = Math.max(1, ...ps.flatMap((p) => series.map((s) => p[s.key])));
  const ticks = marcasEje(max);
  const tope = ticks[ticks.length - 1] || 1;
  const minimo = Math.min(0, ...ps.flatMap((p) => series.map((s) => p[s.key])));
  const y = (v: number) => padT + plotH - ((v - minimo) / (tope - minimo)) * plotH;
  const grupoW = plotW / Math.max(1, n);
  const cx = (i: number) => (vista === "barras" ? padL + grupoW * (i + 0.5) : padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW));
  const paso = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(plotW / 58))));

  function indiceDe(clientX: number) {
    const el = svg.current; if (!el || n === 0) return null;
    const b = el.getBoundingClientRect();
    const vx = ((clientX - b.left) / b.width) * W;
    const i = vista === "barras" ? Math.floor((vx - padL) / grupoW) : Math.round(((vx - padL) / plotW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  }
  const alternar = (k: SerieBI) => setVisibles((v) => {
    const s = new Set(v); if (s.has(k)) { if (s.size > 1) s.delete(k); } else s.add(k); return s;
  });

  const p = foco !== null ? ps[foco] : null;
  const ant = foco !== null && foco > 0 ? ps[foco - 1] : undefined;
  const barW = (grupoW * 0.72) / Math.max(1, series.length);

  return (
    <div className="w-full min-w-0">
      {/* ---------------- Filtros */}
      <div className="mb-3 flex flex-col gap-2">
        <Grupo etiqueta="Período" valor={ventana} onCambio={(v) => { setVentana(v); setFoco(null); }}
          opciones={[{ id: "12m", label: "12 meses" }, { id: "24m", label: "24 meses" }, ...anios.map((a) => ({ id: a, label: a })), { id: "todo", label: "Todo" }]} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Grupo etiqueta="Agrupar por" valor={agr} onCambio={(v) => { setAgr(v); setFoco(null); }}
            opciones={[{ id: "mes", label: "Mes" }, { id: "trimestre", label: "Trimestre" }, { id: "anio", label: "Año" }]} />
          <Grupo etiqueta="Moneda" valor={moneda} onCambio={setMoneda}
            opciones={[{ id: "usd", label: "Dólares" }, { id: "bs", label: "Bolívares facturados" }]} />
          <Grupo etiqueta="Vista" valor={vista} onCambio={(v) => { setVista(v); setFoco(null); }}
            opciones={[{ id: "lineas", label: "Líneas" }, { id: "barras", label: "Barras" }]} />
        </div>
      </div>

      {/* ---------------- Resumen de lo que se ve */}
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
        {[
          ["Ventas", fmt(r.venta)], ["Compras", fmt(r.compra)], ["Utilidad", fmt(r.util)],
          ["Margen", `${r.margen.toLocaleString("es-VE")}%`], ["ROI", `${r.roi.toLocaleString("es-VE")}%`],
          ["Mejor período", r.mejor ? `${r.mejor.etiquetaLarga}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{k}</dt>
            <dd className="text-sm font-semibold tabular-nums text-text [overflow-wrap:break-word]">{v}</dd>
          </div>
        ))}
      </dl>

      {/* ---------------- Series: tocar para encender o apagar */}
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Series del gráfico">
        {SERIES.map((s) => (
          <button key={s.key} type="button" aria-pressed={visibles.has(s.key)} onClick={() => alternar(s.key)}
            className={`${chip} flex items-center gap-1.5 ${visibles.has(s.key) ? "border-border-strong bg-surface text-text" : "border-border bg-surface text-muted line-through opacity-60"}`}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.nombre}
          </button>
        ))}
      </div>

      {/* ---------------- Gráfico */}
      <div ref={caja} className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} tabIndex={0} role="img"
          aria-label={`Histórico de ${series.map((s) => s.nombre.toLowerCase()).join(", ")}: ${n} período(s). Usa las flechas para recorrerlo.`}
          className="touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg"
          onPointerMove={(e) => setFoco(indiceDe(e.clientX))}
          onPointerDown={(e) => setFoco(indiceDe(e.clientX))}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setFoco(null); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); setFoco((f) => Math.min(n - 1, (f ?? -1) + 1)); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); setFoco((f) => Math.max(0, (f ?? n) - 1)); }
            else if (e.key === "Escape") setFoco(null);
          }}
          onBlur={() => setFoco(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--color-muted)">{abreviar(t, moneda)}</text>
            </g>
          ))}
          {ps.map((q, i) => (i % paso === 0 || i === n - 1) && (
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
            ? ps.map((q, i) => series.map((s, j) => {
                const v = q[s.key], top = y(Math.max(0, v)), base = y(Math.min(0, v));
                return <rect key={`${q.clave}-${s.key}`} x={padL + grupoW * i + grupoW * 0.14 + j * barW} y={top}
                  width={Math.max(1, barW - 1)} height={Math.max(0.5, base - top)} rx={1.5} fill={s.color}
                  opacity={foco === null || foco === i ? 1 : 0.45} />;
              }))
            : series.map((s) => (
                <g key={s.key}>
                  <polyline points={ps.map((q, i) => `${cx(i)},${y(q[s.key])}`).join(" ")} fill="none" stroke={s.color}
                    strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {(n <= 24 || foco !== null) && ps.map((q, i) => (n <= 24 || i === foco) && (
                    <circle key={q.clave} cx={cx(i)} cy={y(q[s.key])} r={i === foco ? 4.5 : 2.5} fill={s.color}
                      stroke="var(--color-surface)" strokeWidth={i === foco ? 2 : 0} />
                  ))}
                </g>
              ))}
          {minimo < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--color-border-strong)" />}
        </svg>

        {/* Globo del período señalado */}
        {p && (
          <div role="status" aria-live="polite"
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-border bg-surface p-3 text-xs shadow-lg"
            style={{ left: `clamp(0px, calc(${(cx(foco!) / W) * 100}% - 7rem), calc(100% - 14rem))` }}>
            <p className="mb-1.5 font-semibold text-text">
              {p.etiquetaLarga}{p.incompleto && <span className="ml-1 font-normal text-warn">· incompleto</span>}
            </p>
            {series.map((s) => {
              const d = variacion(p[s.key], ant?.[s.key]);
              return (
                <p key={s.key} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.nombre}</span>
                  <span className="tabular-nums text-text">
                    {fmt(p[s.key])}
                    {d !== null && <span className={`ml-1 ${d >= 0 ? "text-ok" : "text-danger"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toLocaleString("es-VE")}%</span>}
                  </span>
                </p>
              );
            })}
            <p className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-muted">
              <span>Margen {p.margen.toLocaleString("es-VE")}%</span><span>ROI {p.roi.toLocaleString("es-VE")}%</span>
            </p>
          </div>
        )}
      </div>

      {/* ---------------- La tabla, para leer o copiar los números */}
      <details className="mt-3 rounded-xl border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-text">Ver tabla ({n} período{n === 1 ? "" : "s"})</summary>
        <div className="sumi-scroll max-h-80 overflow-auto border-t border-border">
          <table className="w-full min-w-[560px] text-right text-xs tabular-nums">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Período</th>
                <th className="px-3 py-2 font-medium">Ventas</th><th className="px-3 py-2 font-medium">Compras</th>
                <th className="px-3 py-2 font-medium">Costo</th><th className="px-3 py-2 font-medium">Utilidad</th>
                <th className="px-3 py-2 font-medium">Margen</th><th className="px-3 py-2 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ps.map((q) => (
                <tr key={q.clave}>
                  <td className="px-3 py-1.5 text-left text-text">{q.etiquetaLarga}{q.incompleto && <span className="text-warn"> *</span>}</td>
                  <td className="px-3 py-1.5 text-text">{fmt(q.venta)}</td><td className="px-3 py-1.5 text-muted">{fmt(q.compra)}</td>
                  <td className="px-3 py-1.5 text-muted">{fmt(q.costo)}</td><td className="px-3 py-1.5 text-text">{fmt(q.util)}</td>
                  <td className="px-3 py-1.5 text-muted">{q.margen.toLocaleString("es-VE")}%</td><td className="px-3 py-1.5 text-muted">{q.roi.toLocaleString("es-VE")}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong font-semibold text-text">
              <tr>
                <td className="px-3 py-2 text-left">Total</td><td className="px-3 py-2">{fmt(r.venta)}</td><td className="px-3 py-2">{fmt(r.compra)}</td>
                <td className="px-3 py-2">{fmt(r.costo)}</td><td className="px-3 py-2">{fmt(r.util)}</td>
                <td className="px-3 py-2">{r.margen.toLocaleString("es-VE")}%</td><td className="px-3 py-2">{r.roi.toLocaleString("es-VE")}%</td>
              </tr>
            </tfoot>
          </table>
          {ps.some((q) => q.incompleto) && <p className="px-3 py-2 text-left text-[11px] text-muted">* Mes con días sin ventas registradas.</p>}
        </div>
      </details>
    </div>
  );
}
