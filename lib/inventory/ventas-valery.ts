// Ventas de Valery → kardex de Macedonia.
//
// Se recibe UN reporte: la «Relación de Ventas Diarias (Detallado por
// Renglón)» de Valery, en cualquiera de sus dos formatos:
//   · completo: fecha, tipo, documento y cliente en CADA renglón;
//   · agrupado: solo el primer renglón de cada documento los lleva; los
//     siguientes vienen vacíos y los heredan (y las columnas van en otro orden).
// Cualquier otro archivo se rechaza: un reporte distinto tiene columnas con
// otro significado.
//
// Qué hace cada renglón en el inventario:
//   · FAC y NET (factura y nota de entrega) → SALIDA;
//   · DEV (devolución) → ENTRADA (vuelve la mercancía);
//   · una FAC que factura una NET ya descontada NO vuelve a descontar (Valery
//     exporta las dos). Mismas reglas que el histórico (scripts/historico-valery.py).
//
// Esto es la parte pura (sin base): leer, validar y decidir. La escribe
// lib/inventory/ventas-valery-db.ts, y la base lo vuelve a comprobar
// (supabase/32-importar-ventas-valery.sql).

export type Celda = string | number | boolean | null;
export type TipoDoc = "FAC" | "NET" | "DEV";
export type FormatoVentas = "completo" | "agrupado";

export const COLUMNAS_VENTAS: Record<FormatoVentas, readonly string[]> = {
  completo: ["Fecha Emision", "Tipo Doc", "Documento", "Cliente", "Cantidad", "Producto", "Codigo", "Total Neto Bs", "Impuesto Bs",
    "Total IGTF Bs", "Total Operacion Bs", "Tasa del Dia", "Total Operacion $", "Credito Bs", "Credito $", "Contado Bs", "Contado $",
    "Total Costo Bs", "Total Costo $", "Utilidad-Venta Bs", "Utilidad-Venta $", "% Utilidad"],
  agrupado: ["Fecha Emision", "Tipo Doc", "Documento", "Cliente", "Credito Bs", "Credito $", "Contado Bs", "Contado $", "Codigo",
    "Producto", "Cantidad", "Total Neto Bs", "Impuesto Bs", "Total IGTF Bs", "Total Operacion Bs", "Tasa del Dia", "Total Operacion $",
    "Total Costo Bs", "Total Costo $", "Utilidad-Venta Bs", "Utilidad-Venta $", "% Utilidad"],
};

/** La serie de facturas de cada empresa. Un archivo con facturas de la otra serie es de la otra empresa. */
export const SERIE_FAC: Record<string, { desde: number; hasta: number; nombre: string }> = {
  sumigases: { desde: 1, hasta: 9999, nombre: "Sumigases" },
  sudematin: { desde: 19000, hasta: 999999, nombre: "Sudematin" },
};

export type RenglonVenta = {
  /** Fila de Excel (para los mensajes). */
  fila: number;
  fecha: string;          // aaaa-mm-dd
  tipo: TipoDoc;
  documento: string;      // 0000001433
  cliente: string;
  codigo: string;
  producto: string;
  cantidad: number;
  netoBs: number;
  tasa: number;
  /** Venta sin IVA en dólares (neto Bs / tasa del día). Solo para reconocer la factura de una nota. */
  ventaUsd: number;
  /** Identifica el renglón entre archivos: el mismo renglón exportado dos veces no se importa dos veces. */
  clave: string;
};

export type LecturaVentas = {
  formato: FormatoVentas;
  renglones: RenglonVenta[];
  /** Renglones que no se pueden leer (línea = fila de Excel). */
  problemas: { linea: number; motivo: string }[];
  /** Renglones sin cantidad (Valery a veces exporta líneas en cero): no mueven nada. */
  enCero: number;
};

const limpio = (v: Celda) => (v === null || v === undefined ? "" : String(v).trim());

/** El número de una celda: el .xls lo trae como número; el .xlsx como texto. */
export function numero(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = limpio(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de una celda: número de serie de Excel, aaaa-mm-dd o dd/mm/aaaa. */
export function fechaDe(v: Celda): string | null {
  const n = typeof v === "number" ? v : /^\d{5}(\.\d+)?$/.test(limpio(v)) ? Number(limpio(v)) : null;
  if (n !== null) {
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
  }
  const t = limpio(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Qué formato es, por la cabecera. null = no es el reporte de ventas de Valery. */
export function formatoDe(cabecera: Celda[]): FormatoVentas | null {
  const c = cabecera.map(limpio);
  while (c.length && !c[c.length - 1]) c.pop();
  for (const f of ["completo", "agrupado"] as const) {
    const e = COLUMNAS_VENTAS[f];
    if (c.length === e.length && e.every((x, i) => c[i] === x)) return f;
  }
  return null;
}

/** Por qué el archivo no es el reporte de ventas. null = sí lo es. */
export function errorDeVentas(cabecera: Celda[]): string | null {
  if (formatoDe(cabecera)) return null;
  const c = cabecera.map(limpio);
  const reconoce = "Solo se admite la «Relación de Ventas Diarias (Detallado por Renglón)» de Valery, tal como sale.";
  if (c.includes("Factor Cambio") || c.includes("Razon Social")) return `Este archivo es un libro de compras, no de ventas. ${reconoce}`;
  if (c.some((x) => /^Descripci[oó]n Cliente/.test(x)) || c.includes("Saldo Inicial")) return `Este archivo es un estado de cuenta de clientes, no de ventas. ${reconoce}`;
  // El formato más parecido, para decir qué columna no calza.
  const cerca = (["completo", "agrupado"] as const)
    .map((f) => ({ f, i: COLUMNAS_VENTAS[f].findIndex((x, i) => c[i] !== x) }))
    .sort((a, b) => b.i - a.i)[0];
  const col = cerca.i < 0 ? COLUMNAS_VENTAS[cerca.f].length : cerca.i;
  const esperada = COLUMNAS_VENTAS[cerca.f][col];
  return esperada
    ? `Las columnas no son las del reporte de ventas de Valery: en la columna ${col + 1} debía decir «${esperada}» y dice «${c[col] ?? ""}». ${reconoce}`
    : `El archivo trae columnas de más (la ${col + 1}: «${c[col]}»). ${reconoce}`;
}

/** Lee los renglones (la primera fila es la cabecera; la última de totales se ignora). */
export function leerVentas(filas: Celda[][]): LecturaVentas {
  const formato = formatoDe(filas[0] ?? []);
  if (!formato) throw new Error(errorDeVentas(filas[0] ?? []) ?? "No es el reporte de ventas de Valery.");
  const col = Object.fromEntries(COLUMNAS_VENTAS[formato].map((n, i) => [n, i])) as Record<string, number>;
  const renglones: RenglonVenta[] = [];
  const problemas: LecturaVentas["problemas"] = [];
  const veces = new Map<string, number>();
  let previo: Pick<RenglonVenta, "fecha" | "tipo" | "documento" | "cliente"> | null = null;
  let enCero = 0;

  filas.slice(1).forEach((v, k) => {
    const linea = k + 2;
    const celda = (n: string) => v[col[n]] ?? null;
    const codigo = limpio(celda("Codigo"));
    const fecha = fechaDe(celda("Fecha Emision"));
    if (fecha) {
      const tipo = limpio(celda("Tipo Doc")).toUpperCase();
      if (tipo !== "FAC" && tipo !== "NET" && tipo !== "DEV") {
        previo = null;
        return void problemas.push({ linea, motivo: `Tipo de documento «${tipo}»: solo se leen FAC, NET y DEV.` });
      }
      previo = { fecha, tipo, documento: limpio(celda("Documento")).replace(/\.0$/, ""), cliente: limpio(celda("Cliente")) };
    } else if (!codigo) {
      return;   // fila de totales o vacía
    } else if (formato === "completo" || !previo) {
      return void problemas.push({ linea, motivo: "El renglón no tiene fecha." });
    }
    // En el agrupado, los renglones siguientes heredan el documento.
    const doc = previo!;
    if (!codigo) return void problemas.push({ linea, motivo: "El renglón no tiene código de producto." });
    if (!doc.documento) return void problemas.push({ linea, motivo: "El renglón no tiene número de documento." });
    const cantidad = numero(celda("Cantidad"));
    const netoBs = numero(celda("Total Neto Bs")) ?? 0;
    const tasa = numero(celda("Tasa del Dia")) ?? 0;
    if (cantidad === null || cantidad < 0) return void problemas.push({ linea, motivo: `Cantidad inválida: «${limpio(celda("Cantidad"))}».` });
    if (cantidad === 0) { enCero++; return; }
    // Mismo renglón en dos archivos = misma clave. Si un documento trae dos
    // renglones idénticos, el contador los separa.
    const base = [doc.fecha, doc.tipo, doc.documento, codigo, cantidad, netoBs.toFixed(2)].join("|");
    const n = (veces.get(base) ?? 0) + 1;
    veces.set(base, n);
    renglones.push({
      fila: linea, ...doc, codigo, producto: limpio(celda("Producto")), cantidad, netoBs, tasa,
      ventaUsd: tasa > 0 ? netoBs / tasa : 0, clave: `V|${base}|${n}`,
    });
  });
  return { formato, renglones, problemas, enCero };
}

/** Facturas de la serie de la otra empresa (el archivo está en la carpeta equivocada). */
export function facturasAjenas(renglones: RenglonVenta[], empresa: string): string[] {
  const s = SERIE_FAC[empresa];
  if (!s) return [];
  return [...new Set(renglones.filter((r) => r.tipo === "FAC")
    .filter((r) => { const n = Number(r.documento.replace(/\D/g, "")); return !(n >= s.desde && n <= s.hasta); })
    .map((r) => r.documento))];
}

// ---------------------------------------------------------------- la factura de una nota
/** Nombre de cliente comparable: sin tildes, sin «C.A.», sin el alias entre paréntesis. */
export function clienteNormal(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\(.*\)$/, "").trim()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(C ?A|S ?A|S ?R ?L|SACA|CA)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Una nota que ya está en la base (de una importación anterior). */
export type NotaPrevia = {
  clave: string; fecha: string; cliente: string; codigo: string; cantidad: number; ventaUsd: number; documento: string;
  /** La factura que ya la facturó, si alguna. */
  facturadaCon: string | null;
};

export type Facturacion = {
  /** Claves de los renglones FAC que facturan una nota: no descuentan. */
  facturas: Set<string>;
  /** Nota → factura que la factura (para marcarla y no usarla dos veces). */
  notas: Map<string, string>;
};

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Qué facturas facturan una nota de entrega (se queda la nota, la factura no
 * descuenta). Las mismas reglas del histórico:
 *   1. el mismo día: renglón de factura igual a uno de nota (cliente, código,
 *      cantidad y monto en dólares ±1 %);
 *   2. días después, por factura:
 *      · con 2 renglones o más: TODOS están en notas del cliente de 1 a 60 días
 *        antes (mismo código y cantidad, monto ±3 %);
 *      · con 1 renglón: una nota de 1 renglón igual (monto ±1 %) de 1 a 7 días antes;
 *      · y ninguna de esas notas se devolvió antes de facturar.
 * `previas` son las notas ya importadas: una factura nueva puede facturar una nota vieja.
 */
export function notasFacturadas(renglones: RenglonVenta[], previas: NotaPrevia[] = []): Facturacion {
  type Nota = { clave: string; fecha: string; cliente: string; codigo: string; cantidad: number; ventaUsd: number; documento: string; libreDe?: string | null };
  // Una nota que ya se importó y vuelve a venir en el archivo es la misma: una sola vez,
  // con la marca que tiene en la base.
  const unicas = new Map<string, Nota>();
  for (const r of renglones) if (r.tipo === "NET") unicas.set(r.clave, { ...r, cliente: clienteNormal(r.cliente) });
  for (const p of previas) unicas.set(p.clave, { ...p, cliente: clienteNormal(p.cliente), libreDe: p.facturadaCon });
  const notas = [...unicas.values()];
  const usadas = new Map<string, string>();
  const facturas = new Set<string>();
  // Una nota ya marcada por OTRA factura no está disponible; por la misma, sí (reimportar da lo mismo).
  const libre = (n: Nota, factura: string) => !usadas.has(n.clave) && (!n.libreDe || n.libreDe === factura);
  const facDoc = (r: RenglonVenta) => `FAC ${r.documento}`;
  const k = (x: { cliente: string; codigo: string; cantidad: number }) => `${x.cliente}|${x.codigo}|${x.cantidad}`;
  const porClave = new Map<string, Nota[]>();
  for (const n of notas) { const kk = k(n); porClave.set(kk, [...(porClave.get(kk) ?? []), n]); }
  const facs = renglones.filter((r) => r.tipo === "FAC");

  // 1. El mismo día, renglón por renglón.
  for (const f of facs) {
    const c = (porClave.get(k({ ...f, cliente: clienteNormal(f.cliente) })) ?? [])
      .find((n) => n.fecha === f.fecha && libre(n, facDoc(f)) && Math.abs(n.ventaUsd - f.ventaUsd) <= 0.01 * Math.abs(n.ventaUsd) + 0.05);
    if (c) { usadas.set(c.clave, facDoc(f)); facturas.add(f.clave); }
  }

  // 2. Días después, por factura completa.
  const devs = renglones.filter((r) => r.tipo === "DEV").map((r) => ({ ...r, cliente: clienteNormal(r.cliente) }));
  const renglonesNota = new Map<string, number>();
  for (const n of notas) renglonesNota.set(n.documento, (renglonesNota.get(n.documento) ?? 0) + 1);
  const porFactura = new Map<string, RenglonVenta[]>();
  for (const f of facs) if (!facturas.has(f.clave)) porFactura.set(f.documento, [...(porFactura.get(f.documento) ?? []), f]);
  const ordenadas = [...porFactura.values()].sort((a, b) => a[0].fecha.localeCompare(b[0].fecha));
  for (const ls of ordenadas) {
    const uno = ls.length === 1;
    const [tope, tol] = uno ? [7, 0.01] : [60, 0.03];
    const doc = facDoc(ls[0]);
    const tomadas: Nota[] = [];
    let todas = true;
    for (const x of ls) {
      const c = (porClave.get(k({ ...x, cliente: clienteNormal(x.cliente) })) ?? []).find((n) => {
        const d = dias(n.fecha, x.fecha);
        return libre(n, doc) && !tomadas.includes(n) && d >= 1 && d <= tope
          && Math.abs(n.ventaUsd - x.ventaUsd) <= tol * Math.abs(n.ventaUsd) + 0.5
          && (!uno || renglonesNota.get(n.documento) === 1);
      });
      if (!c) { todas = false; break; }
      tomadas.push(c);
    }
    if (!todas || ls.reduce((a, x) => a + x.ventaUsd, 0) <= 0) continue;
    // Si la nota se devolvió antes de facturar, la factura es la única venta.
    const devuelta = tomadas.some((n) => devs.some((d) => d.cliente === n.cliente && d.codigo === n.codigo && d.cantidad === n.cantidad
      && dias(n.fecha, d.fecha) >= 0 && dias(ls[0].fecha, d.fecha) <= 3));
    if (devuelta) continue;
    for (const n of tomadas) usadas.set(n.clave, doc);
    for (const x of ls) facturas.add(x.clave);
  }
  return { facturas, notas: usadas };
}

// ---------------------------------------------------------------- lo que se importa
export type MovimientoVenta = {
  renglon: string; fecha: string; direccion: "entrada" | "salida"; tipo: TipoDoc; documento: string;
  cliente: string; codigo: string; nombre: string; cantidad: number; montoUsd: number;
  /** En una NET: la factura que la factura. */
  facturadaCon: string | null;
};

export type PlanVentas = {
  movimientos: MovimientoVenta[];
  /** Notas de importaciones anteriores que ahora quedan facturadas. */
  notasPrevias: { renglon: string; factura: string }[];
  /** Facturas que no descuentan porque facturan una nota. */
  facturasDeNotas: number;
  /** Renglones anteriores al corte: ya están en la existencia de Valery. */
  antesDelCorte: number;
  desde: string | null;
  hasta: string | null;
};

/** Decide qué entra: solo desde el corte, sin las facturas de notas. */
export function planVentas(renglones: RenglonVenta[], corte: string, previas: NotaPrevia[] = []): PlanVentas {
  const fac = notasFacturadas(renglones, previas);
  const enBase = new Set(previas.map((p) => p.clave));
  const movimientos: MovimientoVenta[] = [];
  let antesDelCorte = 0, facturasDeNotas = 0;
  for (const r of renglones) {
    if (r.fecha < corte) { antesDelCorte++; continue; }
    if (fac.facturas.has(r.clave)) { facturasDeNotas++; continue; }
    movimientos.push({
      renglon: r.clave, fecha: r.fecha, direccion: r.tipo === "DEV" ? "entrada" : "salida", tipo: r.tipo,
      documento: `${r.tipo} ${r.documento}`, cliente: r.cliente, codigo: r.codigo, nombre: r.producto || r.codigo,
      cantidad: r.cantidad, montoUsd: Math.round(Math.abs(r.ventaUsd) * 100) / 100,
      facturadaCon: r.tipo === "NET" ? fac.notas.get(r.clave) ?? null : null,
    });
  }
  // Las notas que ya están en la base se marcan allá (si vienen también en el archivo, su renglón no se vuelve a insertar).
  const notasPrevias = [...fac.notas].filter(([nota]) => enBase.has(nota)).map(([renglon, factura]) => ({ renglon, factura }));
  const fechas = movimientos.map((m) => m.fecha).sort();
  return { movimientos, notasPrevias, facturasDeNotas, antesDelCorte, desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null };
}
