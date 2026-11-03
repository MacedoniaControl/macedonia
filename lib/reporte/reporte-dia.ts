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
  /** El total en dólares que guarda Valery (V3CXC_ME / V3CXP_ME). Null: no lo trae. */
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
    const me = f.total_me === null || f.total_me === undefined ? null : numero(f.total_me);
    out.push({
      cartera, tipo: texto(f.tipo).toUpperCase(), documento: texto(f.documento), contraparte: texto(f.contraparte),
      fecha, hora: horaValida(f.hora),
      // Valery guarda el concepto con «&amp;» en vez de «&».
      concepto: texto(f.concepto).replace(/&amp;/g, "&"),
      moneda: texto(f.moneda) === "02" ? "USD" : "Bs", totalBs: numero(f.total), totalUsd: me !== null && me > 0 ? me : null,
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
