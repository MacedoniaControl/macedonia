// Histórico filtrado por rango, para Reportes, ROI y Matrices.
//
// Las tres leían `series` de dashboard-data: doce meses de 2024 sin año pegado.
// Con eso no se puede filtrar por fecha —no hay fecha— así que mostraban 2024 y
// solo 2024, dijera lo que dijera el selector.
//
// HISTORY sí trae el mes con su año (2023-04 → 2026-07), que es lo que permite
// que el rango signifique algo.

import { HISTORY, type EmpresaHist, type HistMonth } from "./history-data.ts";
import { claveDe, etiquetaDe, type Rango, type Agrupacion } from "./rango.ts";

/** Los datos del histórico son MENSUALES: agrupar por semana no es posible. */
export const AGRUPACIONES_HISTORICO: Agrupacion[] = ["mes", "anio"];

/** El primer día del mes `ym`, para poder compararlo con el rango. */
const primerDia = (ym: string) => `${ym}-01`;

export type Periodo = {
  clave: string;
  etiqueta: string;
  venta: number;
  costo: number;
  util: number;
  compra: number;
  margen: number;
  roi: number;
};

export function historicoEnRango(empresa: string, r: Rango): Periodo[] {
  const h = HISTORY[empresa as EmpresaHist] ?? HISTORY.sumigases;

  // Con datos mensuales, "semana" se comporta como "mes": es lo más fino que
  // hay. Mostrar semanas repartiendo el mes seria inventar.
  const agr: Agrupacion = r.agrupacion === "semana" ? "mes" : r.agrupacion;

  const cajas = new Map<string, HistMonth[]>();
  for (const m of h.months) {
    const d = primerDia(m.ym);
    // El mes entra si se solapa con el rango, no si empieza adentro: un rango
    // que arranca a mitad de mes igual tiene que mostrar ese mes.
    if (d > r.hasta || `${m.ym}-31` < r.desde) continue;
    const k = claveDe(d, agr);
    const caja = cajas.get(k) ?? [];
    caja.push(m);
    cajas.set(k, caja);
  }

  return [...cajas.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, ms]) => {
      const venta = ms.reduce((a, m) => a + m.venta, 0);
      const costo = ms.reduce((a, m) => a + m.costo, 0);
      const util = ms.reduce((a, m) => a + m.util, 0);
      const compra = ms.reduce((a, m) => a + m.compra, 0);
      return {
        clave,
        etiqueta: etiquetaDe(clave, agr),
        venta, costo, util, compra,
        margen: venta > 0 ? Math.round((util / venta) * 1000) / 10 : 0,
        roi: compra > 0 ? Math.round((util / compra) * 1000) / 10 : 0,
      };
    });
}

export function totalesDe(ps: Periodo[]): Omit<Periodo, "clave" | "etiqueta"> {
  const venta = ps.reduce((a, p) => a + p.venta, 0);
  const costo = ps.reduce((a, p) => a + p.costo, 0);
  const util = ps.reduce((a, p) => a + p.util, 0);
  const compra = ps.reduce((a, p) => a + p.compra, 0);
  return {
    venta, costo, util, compra,
    margen: venta > 0 ? Math.round((util / venta) * 1000) / 10 : 0,
    roi: compra > 0 ? Math.round((util / compra) * 1000) / 10 : 0,
  };
}
