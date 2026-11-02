// La cartera tal como está en Valery, leída por el Puente (docs/decisions/puente-valery.md).
//
// Se MUESTRA al lado de la de Macedonia, no se mezcla con ella: Valery solo
// lleva en cuentas por cobrar las facturas (las notas de entrega a crédito se
// llevan en Macedonia) y en cuentas por pagar arrastra facturas viejas que
// nunca se cerraron allá. Verificado el 2-nov-2026 con el agente 1.0.3.
//
// Valery guarda los saldos en bolívares. El equivalente en dólares sale:
//   · documento en dólares (moneda 02): el saldo entre la tasa del documento;
//   · documento en bolívares: el saldo entre la tasa BCV de hoy, y se dice.

export type TipoCartera = "cxc" | "cxp";

/** Un documento con saldo en Valery. */
export type DocValery = {
  clave: string;
  tipo: string;            // FAC, FCM, NDB…
  documento: string;
  contraparte: string;     // cliente o proveedor
  rif: string;
  emision: string;         // aaaa-mm-dd
  vencimiento: string | null;
  moneda: "Bs" | "USD";
  factor: number;          // la tasa del documento (1 si es en bolívares)
  totalBs: number;
  saldoBs: number;
  numeroControl: string;   // solo por pagar
};

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const fecha = (v: unknown) => { const s = texto(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Las filas del agente (cxc o cxp) → documentos. Una fila sin documento, fecha o saldo se descarta y se cuenta. */
export function docsDesdeAgente(tipo: TipoCartera, crudas: unknown[]): { docs: DocValery[]; descartadas: number } {
  const docs: DocValery[] = [];
  let descartadas = 0;
  const vistas = new Map<string, number>();
  for (const c of crudas) {
    const f = (c ?? {}) as Record<string, unknown>;
    const documento = texto(f.documento);
    const emision = fecha(f.emision);
    const saldoBs = numero(f.saldo);
    if (!documento || !emision || !(saldoBs > 0)) { descartadas++; continue; }
    const tipoDoc = texto(f.tipo).toUpperCase();
    const contraparte = texto(tipo === "cxc" ? f.cliente : f.proveedor);
    const base = `${tipoDoc}|${documento}|${contraparte}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    docs.push({
      clave: n > 1 ? `${base}|${n}` : base,
      tipo: tipoDoc, documento, contraparte, rif: texto(f.rif), emision, vencimiento: fecha(f.vencimiento),
      moneda: texto(f.moneda) === "02" ? "USD" : "Bs", factor: numero(f.factor) || 1,
      totalBs: numero(f.total), saldoBs, numeroControl: texto(f.numero_control),
    });
  }
  return { docs, descartadas };
}

/** El saldo en dólares y de dónde sale la tasa. null = no hay tasa con qué convertirlo. */
export function saldoUsd(d: DocValery, tasaHoy: number | null): { usd: number; de: "documento" | "hoy" } | null {
  if (d.moneda === "USD" && d.factor > 1) return { usd: d.saldoBs / d.factor, de: "documento" };
  if (tasaHoy && tasaHoy > 0) return { usd: d.saldoBs / tasaHoy, de: "hoy" };
  return null;
}

/** Días hasta el vencimiento (negativo = vencido). Sin vencimiento en Valery: vence el día que se emitió. */
export function diasParaVencer(d: DocValery, hoy: string): number {
  const vence = d.vencimiento && d.vencimiento >= d.emision ? d.vencimiento : d.emision;
  return Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
}

export type ResumenCarteraValery = {
  documentos: number;
  contrapartes: number;
  saldoBs: number;
  vencidoBs: number;
  vencidos: number;
  /** null si algún documento en bolívares no se pudo convertir (no hay tasa de hoy). */
  saldoUsd: number | null;
  vencidoUsd: number | null;
  ultimaEmision: string | null;
  masVieja: string | null;
};

export function resumirCarteraValery(docs: DocValery[], hoy: string, tasaHoy: number | null): ResumenCarteraValery {
  let saldoBs = 0, vencidoBs = 0, vencidos = 0, saldoU = 0, vencidoU = 0, sinTasa = false;
  let ultima: string | null = null, vieja: string | null = null;
  const quienes = new Set<string>();
  for (const d of docs) {
    const vencido = diasParaVencer(d, hoy) < 0;
    const u = saldoUsd(d, tasaHoy);
    saldoBs += d.saldoBs;
    if (u) saldoU += u.usd; else sinTasa = true;
    if (vencido) { vencidoBs += d.saldoBs; vencidos++; if (u) vencidoU += u.usd; }
    quienes.add(d.contraparte.toUpperCase());
    if (!ultima || d.emision > ultima) ultima = d.emision;
    if (!vieja || d.emision < vieja) vieja = d.emision;
  }
  return {
    documentos: docs.length, contrapartes: quienes.size, saldoBs, vencidoBs, vencidos,
    saldoUsd: sinTasa ? null : saldoU, vencidoUsd: sinTasa ? null : vencidoU,
    ultimaEmision: ultima, masVieja: vieja,
  };
}

/** Búsqueda por contraparte, RIF o número de documento (sin ceros a la izquierda). */
export function buscarDocsValery(docs: DocValery[], q: string): DocValery[] {
  const t = q.trim().toUpperCase();
  if (!t) return docs;
  const sinCeros = t.replace(/^0+(?=.)/, "");
  return docs.filter((d) =>
    d.contraparte.toUpperCase().includes(t) || d.rif.toUpperCase().includes(t)
    || d.documento.replace(/^0+(?=.)/, "").includes(sinCeros) || d.tipo === t);
}
