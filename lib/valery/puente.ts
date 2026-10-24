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

export type TipoSolicitud = "ventas" | "cxc" | "cxp" | "existencias" | "estado";
export type EstadoSolicitud = "pendiente" | "en_proceso" | "lista" | "error" | "aplicada" | "cancelada";

export const NOMBRE_SOLICITUD: Record<TipoSolicitud, string> = {
  ventas: "Ventas",
  cxc: "Cuentas por cobrar",
  cxp: "Cuentas por pagar",
  existencias: "Existencias",
  estado: "Probar conexión",
};

/** Lo que entrega el agente por cada renglón de venta (tal cual está en Valery). */
export type FilaVentaPuente = {
  fecha: string;        // aaaa-mm-dd
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
      fila: i + 1, fecha: f.fecha, tipo, documento, cliente: String(f.cliente ?? "").trim(), codigo,
      producto: String(f.producto ?? "").trim(), cantidad, netoBs, tasa,
      ventaUsd: tasa > 0 ? netoBs / tasa : 0, clave: `V|${base}|${n}`,
    });
  });
  return { renglones, descartadas };
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
