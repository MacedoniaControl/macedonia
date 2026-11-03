// Puente Valery: la parte pura (sin base ni red).
//
// El agente del servidor lee una copia de la base de Valery y entrega filas
// crudas (docs/decisions/puente-valery.md). Aquí se convierten en lo mismo que
// sale de leer el Excel de la «Relación de Ventas Diarias (Detallado por
// Renglón)», para que las aplique el MISMO importador con las MISMAS claves.
//
// Diferencias entre la base y el Excel, verificadas con febrero de 2026:
//   · la base guarda el neto de una DEV en positivo; el Excel lo trae negativo;
//   · la tasa del día es la de MONEDA_HISTORIAL vigente a la hora del documento
//     (la calcula el agente); en documentos en dólares, el factor del documento.

import { claveBase, type RenglonVenta, type TipoDoc } from "../inventory/ventas-valery.ts";

export type TipoSolicitud = "ventas" | "cxc" | "cxp" | "existencias" | "estado" | "diagnostico" | "movimientos";
export type EstadoSolicitud = "pendiente" | "en_proceso" | "lista" | "error" | "aplicada" | "cancelada";

export const NOMBRE_SOLICITUD: Record<TipoSolicitud, string> = {
  ventas: "Ventas",
  cxc: "Cuentas por cobrar",
  cxp: "Cuentas por pagar",
  existencias: "Existencias",
  estado: "Probar conexión",
  diagnostico: "Diagnóstico",
  movimientos: "Movimientos de CxC y CxP",
};

/** Lo que entrega el agente por cada renglón de venta (tal cual está en Valery). */
export type FilaVentaPuente = {
  fecha: string;        // aaaa-mm-dd
  hora?: string | null; // hh:mm:ss, desde el agente 1.0.4
  tipo: string;         // FAC | NET | DEV
  documento: string;
  cliente: string;
  codigo: string;
  producto: string;
  cantidad: number;
  neto: number;         // Bs, como lo guarda Valery (la DEV en positivo)
  tasa: number;         // Bs por dólar
};

const TIPOS: readonly TipoDoc[] = ["FAC", "NET", "DEV"];
const esTipo = (t: string): t is TipoDoc => (TIPOS as readonly string[]).includes(t);

/**
 * Las filas del agente → renglones del importador de ventas. Mismo orden que el
 * Excel (documento y número de línea) para que el contador de renglones
 * idénticos dé las mismas claves.
 */
export function renglonesDesdePuente(filas: FilaVentaPuente[]): { renglones: RenglonVenta[]; descartadas: number } {
  const renglones: RenglonVenta[] = [];
  const veces = new Map<string, number>();
  let descartadas = 0;
  filas.forEach((f, i) => {
    const tipo = String(f.tipo ?? "").trim().toUpperCase();
    const cantidad = Number(f.cantidad);
    const codigo = String(f.codigo ?? "").trim();
    const documento = String(f.documento ?? "").trim();
    if (!esTipo(tipo) || !codigo || !documento || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha)) || !Number.isFinite(cantidad) || cantidad <= 0) {
      descartadas++;
      return;
    }
    const netoValery = Number(f.neto) || 0;
    const netoBs = tipo === "DEV" ? -Math.abs(netoValery) : netoValery;
    const tasa = Number(f.tasa) || 0;
    const base = claveBase(f.fecha, tipo, documento, codigo, cantidad, netoBs);
    const n = (veces.get(base) ?? 0) + 1;
    veces.set(base, n);
    renglones.push({
      fila: i + 1, fecha: f.fecha, hora: horaValida(f.hora), tipo, documento, cliente: String(f.cliente ?? "").trim(), codigo,
      producto: String(f.producto ?? "").trim(), cantidad, netoBs, tasa,
      ventaUsd: tasa > 0 ? netoBs / tasa : 0, clave: `V|${base}|${n}`,
    });
  });
  return { renglones, descartadas };
}

/** «17:13:55», «17:13:55.0000» o «9:05» → «17:13:55» / «09:05:00». Otra cosa: null (no se inventa una hora). */
export function horaValida(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v ?? "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** ¿La versión del agente es esta o una más nueva? «1.0.10» es más nueva que «1.0.4». */
export function versionAlMenos(v: string | null | undefined, minima: string): boolean {
  if (!v) return false;
  const a = v.split(".").map(Number), b = minima.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (Number.isNaN(x)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

/**
 * Las filas de una parte, como lista. PowerShell desenrolla los arreglos al
 * asignarlos desde un `if`: una parte sin filas llega como null y una de una
 * sola fila llega como esa fila suelta, no como lista de una. El agente 1.0.1
 * lo hace así y ya está instalado; aquí se acepta. Otra cosa: null (inválido).
 */
export function filasDeParte(datos: unknown): unknown[] | null {
  if (datos === null || datos === undefined) return [];
  if (Array.isArray(datos)) return datos;
  if (typeof datos === "object") return [datos];
  return null;
}

/** Un rango de ventas válido para pedir: fechas reales, en orden y de no más de 400 días. */
export function errorDeRango(desde: string, hasta: string): string | null {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  if (!ok(desde) || !ok(hasta)) return "Elige las dos fechas.";
  if (desde > hasta) return "La fecha «desde» es posterior a «hasta».";
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000;
  if (dias > 400) return "Pide como máximo 400 días de una vez.";
  return null;
}

// ---------------------------------------------------------------- ventas automáticas
/** Cada cuánto se traen las ventas solas, si el Owner no lo cambió. */
export const CADA_MIN_POR_DEFECTO = 60;

const menosDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/**
 * Qué días pedir en una actualización automática: desde dos días antes de
 * lo último que entró bien (un documento cargado tarde en Valery todavía se
 * alcanza) hasta hoy. Nunca antes del corte (lo anterior ya está en la
 * existencia) ni más de 400 días de una vez. Lo que ya entró no se repite:
 * cada renglón tiene su clave.
 */
export function rangoAuto(hoy: string, corte: string, ultimaHasta: string | null): { desde: string; hasta: string } {
  const base = ultimaHasta && ultimaHasta > corte ? ultimaHasta : corte;
  const candidatos = [menosDias(base, 2), corte, menosDias(hoy, 399)];
  let desde = candidatos.reduce((a, b) => (b > a ? b : a));
  if (desde > hoy) desde = hoy;
  return { desde, hasta: hoy };
}

/**
 * ¿Una actualización que volvió sin un solo renglón es sospechosa? En un día
 * o dos sin vender puede pasar; en una semana o más, no: lo probable es que el
 * agente esté leyendo otra base (pasó el 2-nov-2026 con D:\ValerySMB, la vieja).
 * `renglones` null = no se sabe (el resumen no lo trae): no se acusa.
 */
export function vaciaSospechosa(desde: string | null, hasta: string | null, renglones: number | null): boolean {
  if (renglones !== 0 || !desde || !hasta) return false;
  return (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000 >= 6;
}

/** ¿Ya toca otra actualización automática? */
export function tocaActualizar(ultimaPedida: string | null, cadaMin: number, ahora = Date.now()): boolean {
  return !ultimaPedida || ahora - Date.parse(ultimaPedida) >= cadaMin * 60_000;
}

/** Hace cuánto habló el agente, dicho para una persona. */
export function haceCuanto(iso: string | null, ahora = Date.now()): string {
  if (!iso) return "nunca";
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

/** El agente se da por conectado si habló en los últimos 2 minutos (pregunta cada 15 s). */
export const conectado = (iso: string | null, ahora = Date.now()) => !!iso && ahora - Date.parse(iso) < 120_000;
