// El reporte del día del Dashboard: la parte pura (sin base ni red).
//
// Junta lo que pasó en un día: las ventas de Valery, lo que se movió en sus
// cuentas por cobrar y por pagar (agente 1.0.4, pedido «movimientos») y lo
// que se hizo en Macedonia. Cada parte sale de su propia fuente y solo para
// quien puede ver esa sección (lib/reporte/reporte-dia-db.ts).

import { horaValida } from "../valery/puente.ts";

export type Cartera = "cxc" | "cxp";
export type ClaseMov = "documento" | "pago" | "nota_credito" | "retencion" | "anticipo" | "otro";

/** Un documento de CxC o CxP de Valery hecho ese día. */
export type MovValery = {
  cartera: Cartera;
  tipo: string;
  documento: string;
  contraparte: string;
  fecha: string;
  hora: string | null;
  concepto: string;
  moneda: "Bs" | "USD";
  totalBs: number;
  /**
   * El total en dólares que guarda Valery (V3CXC_ME / V3CXP_ME), solo si el
   * documento es en dólares. En los de bolívares ese campo repite el monto en
   * bolívares (comprobado en el respaldo y en SERVIDORSUD, 3-nov-2026): null.
   */
  totalUsd: number | null;
};

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Las filas del pedido «movimientos» → movimientos. Sin cartera, tipo, documento o fecha no entran. */
export function movsDesdeAgente(crudas: unknown[]): MovValery[] {
  const out: MovValery[] = [];
  for (const c of crudas) {
    const f = (c ?? {}) as Record<string, unknown>;
    const cartera = texto(f.cartera).toLowerCase();
    const fecha = texto(f.fecha).slice(0, 10);
    if ((cartera !== "cxc" && cartera !== "cxp") || !texto(f.tipo) || !texto(f.documento) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const moneda = texto(f.moneda) === "02" ? "USD" : "Bs";
    const me = moneda !== "USD" || f.total_me === null || f.total_me === undefined ? null : numero(f.total_me);
    out.push({
      cartera, tipo: texto(f.tipo).toUpperCase(), documento: texto(f.documento), contraparte: texto(f.contraparte),
      fecha, hora: horaValida(f.hora),
      // Valery guarda el concepto con «&amp;» en vez de «&».
      concepto: texto(f.concepto).replace(/&amp;/g, "&"),
      moneda, totalBs: numero(f.total), totalUsd: me !== null && me > 0 ? me : null,
    });
  }
  return out;
}

/** Qué es cada tipo de documento de CxC/CxP de Valery (TIPOS_DOCUMENTOS). */
export function claseMov(tipo: string): ClaseMov {
  const t = tipo.toUpperCase();
  if (["FAC", "FCM", "NDB", "ND"].includes(t)) return "documento";
  if (t === "PAG") return "pago";
  if (t === "NCR" || t === "NC") return "nota_credito";
  if (t === "ANT") return "anticipo";
  if (/^R(TP|IR|TA|MU|IV|CR|IC|FU|TV|DD)$/.test(t)) return "retencion";
  return "otro";
}

const ETIQUETA: Record<Cartera, Record<ClaseMov, string>> = {
  cxc: { documento: "Facturado a crédito", pago: "Cobrado", nota_credito: "Notas de crédito", retencion: "Retenciones", anticipo: "Anticipos", otro: "Otros" },
  cxp: { documento: "Comprado a crédito", pago: "Pagado", nota_credito: "Notas de crédito", retencion: "Retenciones", anticipo: "Anticipos", otro: "Otros" },
};
const ORDEN: ClaseMov[] = ["documento", "pago", "nota_credito", "anticipo", "retencion", "otro"];

export type GrupoMov = {
  clase: ClaseMov;
  etiqueta: string;
  documentos: number;
  totalBs: number;
  /** Suma de los totales en dólares de Valery; null si alguno no lo trae (no se completa a ojo). */
  totalUsd: number | null;
};

/** Por cartera y clase, en un orden fijo; solo las clases que tuvieron movimiento. */
export function resumirMovs(movs: MovValery[]): Record<Cartera, GrupoMov[]> {
  const res: Record<Cartera, GrupoMov[]> = { cxc: [], cxp: [] };
  for (const cartera of ["cxc", "cxp"] as const) {
    for (const clase of ORDEN) {
      const de = movs.filter((m) => m.cartera === cartera && claseMov(m.tipo) === clase);
      if (!de.length) continue;
      res[cartera].push({
        clase, etiqueta: ETIQUETA[cartera][clase], documentos: de.length,
        totalBs: de.reduce((a, m) => a + m.totalBs, 0),
        totalUsd: de.every((m) => m.totalUsd !== null) ? de.reduce((a, m) => a + (m.totalUsd ?? 0), 0) : null,
      });
    }
  }
  return res;
}

/** Inicio y fin de un día de Caracas (UTC-4, sin horario de verano), para filtrar por `created_at`. */
export function limitesDelDia(dia: string): { desde: string; hasta: string } {
  const desde = new Date(`${dia}T00:00:00-04:00`);
  const hasta = new Date(desde.getTime() + 86400000);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export type Conteo = { n: number; usd: number };
export const contar = (filas: { usd: number }[]): Conteo => ({ n: filas.length, usd: filas.reduce((a, f) => a + f.usd, 0) });

// ---------------------------------------------------------------- períodos
// El reporte se pide por día, semana (lunes a domingo), mes o año. Un período
// que llega a hoy se corta en hoy: no se pide nada del futuro.

export type Periodo = "dia" | "semana" | "mes" | "anio";

const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const sumarDias = (iso: string, n: number) => aFecha(ms(iso) + n * 86400000);
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const dmy = (iso: string) => iso.split("-").reverse().join("-");

/** El período que contiene `ref`, cortado en `hoy`. */
export function rangoDe(periodo: Periodo, ref: string, hoy: string): { desde: string; hasta: string } {
  let desde = ref, hasta = ref;
  if (periodo === "semana") {
    const dow = (new Date(ms(ref)).getUTCDay() + 6) % 7;   // lunes = 0
    desde = sumarDias(ref, -dow); hasta = sumarDias(desde, 6);
  } else if (periodo === "mes") {
    desde = `${ref.slice(0, 7)}-01`;
    const [y, m] = ref.split("-").map(Number);
    hasta = aFecha(Date.UTC(y, m, 0));
  } else if (periodo === "anio") {
    desde = `${ref.slice(0, 4)}-01-01`; hasta = `${ref.slice(0, 4)}-12-31`;
  }
  return { desde, hasta: hasta > hoy ? hoy : hasta };
}

/** La fecha de referencia del período anterior (n = -1) o siguiente (n = 1). */
export function moverPeriodo(periodo: Periodo, ref: string, n: number): string {
  if (periodo === "dia") return sumarDias(ref, n);
  if (periodo === "semana") return sumarDias(ref, 7 * n);
  const [y, m] = ref.split("-").map(Number);
  if (periodo === "mes") return aFecha(Date.UTC(y, m - 1 + n, 1));
  return `${y + n}-01-01`;
}

export function etiquetaPeriodo(periodo: Periodo, desde: string, hasta: string): string {
  if (periodo === "dia") return dmy(desde);
  if (periodo === "mes") return `${MESES[Number(desde.slice(5, 7)) - 1]} ${desde.slice(0, 4)}`;
  if (periodo === "anio") return desde.slice(0, 4);
  return `semana del ${dmy(desde)} al ${dmy(hasta)}`;
}

/** En qué fila del desglose cae una fecha: el mes en un año, el día en lo demás. */
export const cubeta = (periodo: Periodo, fecha: string) => (periodo === "anio" ? fecha.slice(0, 7) : fecha);

/** Las filas del desglose, en orden. Un día no tiene desglose. */
export function cubetas(periodo: Periodo, desde: string, hasta: string): string[] {
  if (periodo === "dia") return [];
  const out: string[] = [];
  if (periodo === "anio") {
    for (let m = Number(desde.slice(5, 7)); m <= Number(hasta.slice(5, 7)); m++) out.push(`${desde.slice(0, 4)}-${String(m).padStart(2, "0")}`);
    return out;
  }
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}

export function etiquetaCubeta(periodo: Periodo, clave: string): string {
  if (periodo === "anio") return MESES[Number(clave.slice(5, 7)) - 1];
  return `${DIAS[new Date(ms(clave)).getUTCDay()]} ${dmy(clave).slice(0, 5)}`;
}

/** Inicio del primer día y fin del último, en Caracas, para filtrar por `created_at`. */
export function limitesDelRango(desde: string, hasta: string): { desde: string; hasta: string } {
  return { desde: limitesDelDia(desde).desde, hasta: limitesDelDia(hasta).hasta };
}

// ---------------------------------------------------------------- desglose
export type Punto = { fecha: string; valor: number };
export type FilaSerie = { clave: string; etiqueta: string; valores: Record<string, number> };

/**
 * El desglose por día o por mes. `columnas` con null = quien mira no ve esa
 * sección: la columna no existe (no se pone en cero). Una fila sin nada es 0.
 */
export function armarSerie(periodo: Periodo, desde: string, hasta: string, columnas: Record<string, Punto[] | null>): FilaSerie[] {
  const visibles = Object.entries(columnas).filter((e): e is [string, Punto[]] => e[1] !== null);
  return cubetas(periodo, desde, hasta).map((clave) => {
    const valores: Record<string, number> = {};
    for (const [col, puntos] of visibles) {
      valores[col] = puntos.filter((p) => cubeta(periodo, p.fecha) === clave).reduce((a, p) => a + p.valor, 0);
    }
    return { clave, etiqueta: etiquetaCubeta(periodo, clave), valores };
  });
}

/** Los movimientos de Valery como puntos de una columna del desglose. */
export const puntosMovs = (movs: MovValery[], cartera: Cartera, clase: ClaseMov): Punto[] =>
  movs.filter((m) => m.cartera === cartera && claseMov(m.tipo) === clase).map((m) => ({ fecha: m.fecha, valor: m.totalBs }));
