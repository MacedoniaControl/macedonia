// Cierre de mes: los meses del histórico que se cargan a mano (supabase/45).
//
// El histórico de Valery (history-data.ts) llega hasta el último mes con el
// que se corrió el script. Cuando termina un mes, en Matrices Administrativas
// se carga ese mes con un formato (ventas, costo, compras) y desde ese momento
// Dashboard, ROI, Reportes y Matrices lo cuentan igual que a los de Valery.
//
// Reglas:
//   · Lo leído de la BASE de Valery por el Puente (nota «Leído de Valery…»)
//     manda sobre el histórico de los Excel: reemplaza ese mes. Pedido del
//     usuario (24-11-2026): «todos los números desde la base de datos directo».
//     Los Excel tenían huecos (julio de 2026 de Sumigases, sin ventas del 14 al
//     27) que la base no tiene.
//   · Un mes cargado a mano (formato en Matrices) solo entra si no hay otro dato.
//   · Solo se cierran meses terminados.
//
// Lo de aquí es puro (para probarlo) más un almacén muy chico en memoria del
// navegador: getHistory() lo lee y las pantallas se suscriben para redibujar
// cuando llegan o cambian los meses.

import type { CompanyHistory, HistMonth, HistYear } from "./history-data.ts";

export type MesCargado = {
  empresa: string; ym: string;
  venta: number; costo: number; compra: number;
  ventaBs: number; costoBs: number; compraBs: number;
  nota: string | null; creadoNombre: string | null; actualizadoEn: string | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const margen = (util: number, venta: number) => (venta > 0 ? r1((util / venta) * 100) : 0);
const roi = (util: number, costo: number) => (costo > 0 ? r1((util / costo) * 100) : 0);

/** El mes siguiente: «2026-12» → «2027-01». */
export function mesSiguiente(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** El último mes terminado a la fecha `hoy` (aaaa-mm-dd): el 12-10-2026 es septiembre. */
export function ultimoMesCerrado(hoy: string): string {
  const [y, m] = hoy.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Los meses que se pueden cerrar: los terminados después del último de Valery,
 * en orden. `cargados` dice cuáles ya tienen datos (se pueden corregir).
 */
export function mesesPorCerrar(ultimoValery: string, hoy: string): string[] {
  const hasta = ultimoMesCerrado(hoy);
  const salida: string[] = [];
  for (let ym = mesSiguiente(ultimoValery); ym <= hasta; ym = mesSiguiente(ym)) salida.push(ym);
  return salida;
}

/** Lo que escribe el cierre desde el Puente (lib/valery/puente-db.ts) al principio de la nota. */
export const MARCA_VALERY = "Leído de Valery";
/** ¿El mes se leyó de la base de Valery por el Puente (y no se cargó a mano)? */
export const esDeValery = (m: Pick<MesCargado, "nota">) => !!m.nota && m.nota.startsWith(MARCA_VALERY);

/**
 * El histórico con los meses cerrados: lo leído de la base de Valery reemplaza
 * al mes del Excel; lo cargado a mano solo llena los meses que no hay.
 */
export function conMesesCargados(h: CompanyHistory, meses: MesCargado[]): CompanyHistory {
  const deExcel = new Set(h.months.map((m) => m.ym));
  const nuevos = meses.filter((m) => esDeValery(m) || !deExcel.has(m.ym)).sort((a, b) => a.ym.localeCompare(b.ym));
  if (!nuevos.length) return h;

  const extra: HistMonth[] = nuevos.map((m) => ({
    ym: m.ym, venta: m.venta, costo: m.costo, util: m.venta - m.costo, compra: m.compra,
    ventaBs: m.ventaBs, costoBs: m.costoBs, utilBs: m.ventaBs - m.costoBs, compraBs: m.compraBs,
  }));
  const reemplazan = new Set(extra.map((m) => m.ym));
  const quitados = h.months.filter((m) => reemplazan.has(m.ym));
  const months = [...h.months.filter((m) => !reemplazan.has(m.ym)), ...extra].sort((a, b) => a.ym.localeCompare(b.ym));

  const suma = (ms: HistMonth[], k: keyof Omit<HistMonth, "ym">) => ms.reduce((a, m) => a + m[k], 0);
  const anios = new Map<number, HistMonth[]>();
  for (const m of months) { const y = Number(m.ym.slice(0, 4)); anios.set(y, [...(anios.get(y) ?? []), m]); }
  // Los años de Valery se quedan como vienen; solo se rehacen los que tocan meses cargados.
  const tocados = new Set(extra.map((m) => Number(m.ym.slice(0, 4))));
  const years: HistYear[] = [...anios.keys()].sort((a, b) => a - b).map((year) => {
    const previo = h.years.find((x) => x.year === year);
    if (previo && !tocados.has(year)) return previo;
    const ms = anios.get(year)!;
    const venta = suma(ms, "venta"), costo = suma(ms, "costo"), util = suma(ms, "util"), compra = suma(ms, "compra");
    return { year, venta, costo, util, compra, margen: margen(util, venta), roi: roi(util, costo) };
  });

  // Los totales: los del Excel, menos los meses que se reemplazaron, más los nuevos.
  const t = h.totals;
  const mas = (k: keyof Omit<HistMonth, "ym">) => suma(extra, k) - suma(quitados, k);
  const venta = t.venta + mas("venta"), costo = t.costo + mas("costo");
  const util = t.util + mas("util"), compra = t.compra + mas("compra");
  return {
    ...h,
    meta: {
      ...h.meta,
      hasta: months[months.length - 1].ym,
      // Un mes leído de la base ya no tiene el hueco del Excel.
      incompletos: h.meta.incompletos.filter((m) => !reemplazan.has(m.ym)),
      manuales: nuevos.map((m) => ({ ym: m.ym, por: m.creadoNombre ?? "", ...(esDeValery(m) ? { valery: true } : {}) })),
    },
    totals: {
      venta, costo, util, compra, margen: margen(util, venta), roi: roi(util, costo),
      ventaBs: t.ventaBs + mas("ventaBs"), costoBs: t.costoBs + mas("costoBs"),
      utilBs: t.utilBs + mas("utilBs"), compraBs: t.compraBs + mas("compraBs"),
    },
    years,
    months,
  };
}

// ---------------------------------------------------------------- almacén
let meses: MesCargado[] = [];
let version = 0;
const oyentes = new Set<() => void>();

/** Los meses cargados de una empresa (los que el usuario puede ver). */
export const mesesCargadosDe = (empresa: string) => meses.filter((m) => m.empresa === empresa);

export function fijarMesesCargados(todos: MesCargado[]) {
  meses = todos;
  version++;
  oyentes.forEach((f) => f());
}

export function suscribirMesesCargados(f: () => void) {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

export const versionMesesCargados = () => version;
