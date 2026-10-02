// El gráfico dinámico del histórico (BI): qué meses se ven, cómo se agrupan,
// en qué moneda y qué resume la selección.
//
// Puro, para que el gráfico, su tabla y su resumen salgan de las mismas cuentas
// (historico-bi.test.ts). Los bolívares son lo facturado (cada venta a la tasa
// de su día), nunca dólares por la tasa de hoy.

import type { HistMonth } from "./history-data.ts";

export type AgrupacionBI = "mes" | "trimestre" | "anio";
export type MonedaBI = "usd" | "bs";
/** «12m», «24m», «todo» o un año («2025»). */
export type VentanaBI = string;
export type SerieBI = "venta" | "compra" | "util" | "costo";

export type PeriodoBI = {
  clave: string;
  /** Corta, para el eje: «ene 25», «T1 25», «2025». */
  etiqueta: string;
  /** Larga, para el globo y la tabla: «enero 2025», «1.er trimestre 2025». */
  etiquetaLarga: string;
  meses: string[];
  venta: number;
  compra: number;
  util: number;
  costo: number;
  /** Utilidad sobre ventas, en %. */
  margen: number;
  /** Utilidad sobre costo, en %. */
  roi: number;
  /** Algún mes del período tiene un hueco sin ventas. */
  incompleto: boolean;
};

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ORDINAL = ["1.er", "2.º", "3.er", "4.º"];

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Los años que tiene el histórico, para ofrecerlos como ventana. */
export const aniosDe = (months: HistMonth[]) => [...new Set(months.map((m) => m.ym.slice(0, 4)))].sort();

/** Los meses que caen en la ventana: los últimos 12 o 24, todos, o los de un año. */
export function mesesEnVentana(months: HistMonth[], ventana: VentanaBI): HistMonth[] {
  const orden = [...months].sort((a, b) => a.ym.localeCompare(b.ym));
  if (ventana === "todo") return orden;
  const n = ventana.match(/^(\d+)m$/)?.[1];
  if (n) return orden.slice(-Number(n));
  return orden.filter((m) => m.ym.startsWith(`${ventana}-`));
}

function claveDe(ym: string, agr: AgrupacionBI): string {
  const [y, m] = ym.split("-");
  if (agr === "anio") return y;
  if (agr === "trimestre") return `${y}-T${Math.floor((Number(m) - 1) / 3) + 1}`;
  return ym;
}

function etiquetas(clave: string, agr: AgrupacionBI): [string, string] {
  const y = clave.slice(0, 4);
  if (agr === "anio") return [y, y];
  if (agr === "trimestre") {
    const t = Number(clave.slice(-1));
    return [`T${t} ${y.slice(2)}`, `${ORDINAL[t - 1]} trimestre ${y}`];
  }
  const m = Number(clave.slice(5, 7)) - 1;
  return [`${MES[m]} ${y.slice(2)}`, `${MES_LARGO[m]} ${y}`];
}

/** Los meses agrupados en períodos, en la moneda elegida. */
export function agrupar(months: HistMonth[], agr: AgrupacionBI, moneda: MonedaBI, incompletos: string[] = []): PeriodoBI[] {
  const v = (m: HistMonth, k: SerieBI) =>
    moneda === "bs" ? Number(m[`${k}Bs` as "ventaBs"] ?? 0) : Number(m[k] ?? 0);
  const cajas = new Map<string, HistMonth[]>();
  for (const m of [...months].sort((a, b) => a.ym.localeCompare(b.ym))) {
    const k = claveDe(m.ym, agr);
    cajas.set(k, [...(cajas.get(k) ?? []), m]);
  }
  return [...cajas.entries()].map(([clave, ms]) => {
    const suma = (k: SerieBI) => ms.reduce((a, m) => a + v(m, k), 0);
    const venta = suma("venta"), compra = suma("compra"), util = suma("util"), costo = suma("costo");
    const [etiqueta, etiquetaLarga] = etiquetas(clave, agr);
    return {
      clave, etiqueta, etiquetaLarga, meses: ms.map((m) => m.ym),
      venta, compra, util, costo, margen: pct(util, venta), roi: pct(util, costo),
      incompleto: ms.some((m) => incompletos.includes(m.ym)),
    };
  });
}

/** Lo que resume la selección: totales, margen y ROI de los totales, promedio y mejor período. */
export function resumir(ps: PeriodoBI[]) {
  const suma = (k: SerieBI) => ps.reduce((a, p) => a + p[k], 0);
  const venta = suma("venta"), compra = suma("compra"), util = suma("util"), costo = suma("costo");
  const mejor = ps.reduce<PeriodoBI | null>((m, p) => (!m || p.venta > m.venta ? p : m), null);
  return { venta, compra, util, costo, margen: pct(util, venta), roi: pct(util, costo), promedio: ps.length ? venta / ps.length : 0, mejor };
}

/** Cuánto cambió respecto del período anterior, en %. Sin anterior (o en cero), null. */
export function variacion(actual: number, anterior: number | undefined): number | null {
  if (anterior === undefined || anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

/** Marcas «redondas» para el eje vertical, de 0 al máximo (4 o 5 tramos). */
export function marcasEje(max: number, tramos = 4): number[] {
  if (!(max > 0)) return [0];
  const bruto = max / tramos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) ?? 10 * mag;
  const n = Math.ceil(max / paso);
  return Array.from({ length: n + 1 }, (_, i) => i * paso);
}

/** Un monto que cabe en el eje: «$85 mil», «$1,2 M», «950 mil Bs», «69,7 M Bs». */
export function abreviar(n: number, moneda: MonedaBI): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  const fmt = (x: number) => x.toLocaleString("es-VE", { maximumFractionDigits: x < 10 ? 1 : 0 });
  const cuerpo = a >= 1e9 ? `${fmt(a / 1e9)} mil M` : a >= 1e6 ? `${fmt(a / 1e6)} M` : a >= 1e3 ? `${fmt(a / 1e3)} mil` : fmt(a);
  return moneda === "bs" ? `${s}${cuerpo} Bs` : `${s}$${cuerpo}`;
}
