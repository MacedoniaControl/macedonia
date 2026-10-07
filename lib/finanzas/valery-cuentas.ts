// Cuentas por cobrar y por pagar desde los reportes de Valery, tal como salen.
//
//   Por cobrar · «Estado de Cuenta de Clientes»: una fila «- | Descripción
//     Cliente : NOMBRE» por cliente, debajo sus documentos y una fila de
//     subtotal. El monto de cada documento es el Saldo Inicial (más débitos,
//     menos créditos y anticipos); la columna «Saldo» es el ACUMULADO del
//     cliente, no el del documento. Valery no trae la fecha de vencimiento.
//   Por pagar · «Relación de Cuentas por Pagar a Proveedores»: igual, con
//     «- | Proveedor Descrip. : NOMBRE». Dos variantes de columnas: facturas
//     (con BI, IVA, IVA retenido) y notas (con Monto). El monto es «Saldo»:
//     lo que falta pagar, ya sin la retención ni lo abonado.
//
// Se reconoce por la cabecera exacta, en cualquiera de las primeras filas.
// También se acepta un pedazo del reporte copiado a un libro nuevo, sin la
// cabecera: si trae la fila «Descripción Cliente …» (o «Proveedor Descrip. …»)
// se leen las columnas en el orden del reporte. Junto con la plantilla de
// Macedonia (plantilla-cuentas.ts), es lo único que admite la importación.

import { aFechaPlantilla, fechaFinDeMes, type FilaPlantilla, type TipoPlantilla } from "./plantilla-cuentas.ts";
import type { ClaseCuenta } from "./retencion.ts";
import { venceNotaEntrega } from "./vencimiento.ts";

export type Celda = string | number | boolean | null;
export type HojaLeida = { nombre: string; filas: Celda[][] };

const t = (v: Celda | undefined) => (v === null || v === undefined ? "" : String(v).trim());
const cabeceraDe = (fila: Celda[]) => { const c = fila.map(t); while (c.length && !c[c.length - 1]) c.pop(); return c; };

export const CABECERAS_VALERY = {
  cobrar: [["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Concepto", "Saldo Inicial", "Anticipo", "Débito", "Crédito", "Saldo"]],
  pagar: [
    ["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Días Vencidos", "Concepto", "BI", "IVA", "Total Operación",
      "IVA RETENIDO (75%)", "REF 25% IVA Bs", "REF Equiv. En $", "Monto Cancelado", "Saldo"],
    ["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Días Vencidos", "Concepto", "Monto", "Total Operación", "Monto Cancelado", "Saldo"],
  ],
} as const;

const NOMBRE = { cobrar: "el «Estado de Cuenta de Clientes»", pagar: "la «Relación de Cuentas por Pagar a Proveedores»" } as const;
const GRUPO = { cobrar: /^Descripci[oó]n Cliente\s*:?\s*/i, pagar: /^Proveedor Descrip\.?\s*:?\s*/i } as const;

/** De qué reporte de Valery es una hoja (null = de ninguno). */
export function reporteValery(cabecera: Celda[]): TipoPlantilla | null {
  const c = cabeceraDe(cabecera);
  for (const tipo of ["cobrar", "pagar"] as const) {
    if (CABECERAS_VALERY[tipo].some((e) => e.length === c.length && e.every((x, i) => c[i] === x))) return tipo;
  }
  return null;
}

/** Cuántas filas de arriba se miran buscando la cabecera (Valery a veces pone títulos encima). */
const FILAS_TITULO = 10;

/**
 * Cómo leer una hoja: de qué reporte es, sus columnas y desde qué fila van los
 * datos. null = no es de Valery.
 *
 * Sin cabecera, la hoja es de Valery solo si tiene la fila de grupo del cliente
 * o proveedor Y algún documento con fecha de emisión en su columna: un archivo
 * cualquiera no se lee como si lo fuera.
 */
export function disposicionValery(h: HojaLeida): { tipo: TipoPlantilla; cab: string[]; desde: number } | null {
  for (let i = 0; i < Math.min(FILAS_TITULO, h.filas.length); i++) {
    const tipo = reporteValery(h.filas[i] ?? []);
    if (tipo) return { tipo, cab: cabeceraDe(h.filas[i]), desde: i + 1 };
  }
  for (const tipo of ["cobrar", "pagar"] as const) {
    if (!h.filas.some((f) => GRUPO[tipo].test(t(f[1])))) continue;
    const ancho = Math.max(...h.filas.map((f) => cabeceraDe(f).length));
    const cab = [...(tipo === "pagar" && ancho <= CABECERAS_VALERY.pagar[1].length ? CABECERAS_VALERY.pagar[1] : CABECERAS_VALERY[tipo][0])];
    const emision = cab.indexOf("Fecha Emisión");
    const conDocumento = h.filas.some((f) => t(f[1]) && !GRUPO[tipo].test(t(f[1])) && aFechaPlantilla(t(f[emision])));
    if (conDocumento) return { tipo, cab, desde: 0 };
  }
  return null;
}

/** Por qué las hojas no son el reporte de Valery que va en esta pantalla. null = sí lo son. */
export function errorDeValery(tipo: TipoPlantilla, hojas: HojaLeida[]): string | null {
  const tipos = hojas.map((h) => disposicionValery(h)?.tipo ?? null);
  if (tipos.includes(tipo)) return null;
  const otro: TipoPlantilla = tipo === "cobrar" ? "pagar" : "cobrar";
  if (tipos.includes(otro)) {
    return `Este archivo es ${NOMBRE[otro]} de Valery: va en Cuentas ${otro === "cobrar" ? "por Cobrar" : "por Pagar"}, no aquí.`;
  }
  return null;
}

export const esValery = (hojas: HojaLeida[]) => hojas.some((h) => disposicionValery(h) !== null);

/** «NE» → nota de entrega; «NDE» (en por pagar, la nota de entrega del proveedor); lo demás, factura. */
function claseDe(tipoDoc: string): ClaseCuenta {
  const d = tipoDoc.toUpperCase();
  if (d === "NE" || d === "NET" || d === "NDE") return "nota_entrega";
  if (d === "NDC" || d === "NC" || d === "NCR") return "nota_credito";
  if (d === "NDB" || d === "ND") return "nota_debito";
  return "factura";
}

const num = (v: Celda | undefined) => (typeof v === "number" ? v : Number(t(v).replace(",", ".")) || 0);
const dosDec = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type FilaValery = FilaPlantilla & { clase: ClaseCuenta; hoja: string; linea: number; sinVencimiento: boolean; sinNumero: boolean };
export type LecturaValery = {
  filas: FilaValery[];
  problemas: { linea: number; motivo: string }[];
  /** Documentos con saldo 0 (ya pagados): no se cargan. */
  enCero: number;
  /** Por cobrar: cuántas venían sin vencimiento. */
  sinVencimiento: number;
  /** Saldos viejos sin número de documento: entran como «S/N fecha». */
  sinNumero: number;
};

/** Lee todas las hojas del archivo que sean del reporte de esta pantalla. */
export function leerValery(tipo: TipoPlantilla, hojas: HojaLeida[]): LecturaValery {
  const filas: FilaValery[] = [];
  const problemas: LecturaValery["problemas"] = [];
  let enCero = 0, sinVencimiento = 0;
  const varias = hojas.filter((h) => disposicionValery(h)?.tipo === tipo).length > 1;

  for (const h of hojas) {
    const d = disposicionValery(h);
    if (d?.tipo !== tipo) continue;
    const { cab, desde } = d;
    const col = (n: string) => cab.indexOf(n);
    const pre = varias ? `${h.nombre.trim()}, ` : "";
    let quien = "";
    h.filas.slice(desde).forEach((v, k) => {
      const linea = desde + k + 1;
      const c0 = t(v[0]), c1 = t(v[1]);
      // La fila del cliente: Valery le pone «-» en la primera columna, pero
      // copiada a mano a veces llega sin él.
      if (c0 === "-" || GRUPO[tipo].test(c1)) { quien = c1.replace(GRUPO[tipo], "").trim(); return; }
      if (!c1) return;   // subtotal o fila vacía
      if (/^tipo( de)? doc/i.test(c1)) return;   // los títulos escritos a mano («Tipo de documento»)
      const tipoDoc = c1.toUpperCase();
      const emitida = aFechaPlantilla(t(v[col("Fecha Emisión")]));
      // Valery tiene saldos viejos sin número (saldos iniciales): se identifican por la fecha.
      const sinNumero = !t(v[col("Documento")]);
      const numero = sinNumero && emitida ? `S/N ${emitida.split("-").reverse().join("-")}` : t(v[col("Documento")]).replace(/\.0+$/, "");
      // Un vencimiento con un día de más («31/9») pasa a fin de ese mes, anotado.
      const vf = fechaFinDeMes(t(v[col("Fecha Venc.")]));
      const venceValery = vf.fecha;
      if (!quien) return void problemas.push({ linea, motivo: `${pre}el documento ${tipoDoc} ${numero} no tiene ${tipo === "cobrar" ? "cliente" : "proveedor"} arriba.` });
      if (!emitida) return void problemas.push({ linea, motivo: `${pre}${tipoDoc} ${numero}: fecha de emisión inválida «${t(v[col("Fecha Emisión")])}».` });

      let monto: number, nota: string;
      if (tipo === "cobrar") {
        monto = num(v[col("Saldo Inicial")]) + num(v[col("Débito")]) - num(v[col("Crédito")]) - num(v[col("Anticipo")]);
        const concepto = t(v[col("Concepto")]);
        nota = ["Valery", concepto].filter(Boolean).join(" · ");
      } else {
        monto = num(v[col("Saldo")]);
        const total = num(v[col("Total Operación")]);
        const ret = col("IVA RETENIDO (75%)") >= 0 ? num(v[col("IVA RETENIDO (75%)")]) : 0;
        const pagado = num(v[col("Monto Cancelado")]);
        nota = ["Valery", `total ${fmt(total)}`, ret ? `IVA retenido ${fmt(ret)}` : "", pagado ? `abonado ${fmt(pagado)}` : ""].filter(Boolean).join(" · ");
      }
      monto = dosDec(monto);
      if (monto < 0) return void problemas.push({ linea, motivo: `${pre}${tipoDoc} ${numero} de ${quien}: saldo negativo (${fmt(monto)}).` });
      if (monto === 0) { enCero++; return; }
      // Valery no trae vencimiento en por cobrar. La nota de entrega vence a los
      // 30 días (regla de la empresa); lo demás, el día que se emitió.
      const sinVence = tipo === "cobrar" && claseDe(tipoDoc) === "nota_entrega" ? venceNotaEntrega(emitida) : emitida;
      const vence = venceValery && venceValery >= emitida ? venceValery : sinVence;
      if (!venceValery) sinVencimiento++;
      filas.push({
        contraparte: quien, documento: `${tipoDoc}-${numero}`, emitida, vence, monto,
        nota: [nota, sinNumero ? "sin número en Valery" : "", !venceValery ? "sin vencimiento en Valery" : "",
          vf.corregida ? `vencimiento «${t(v[col("Fecha Venc.")])}» no existe: fin de mes` : ""].filter(Boolean).join(" · "),
        clase: claseDe(tipoDoc), hoja: h.nombre.trim(), linea, sinVencimiento: !venceValery, sinNumero,
      });
    });
  }
  return { filas, problemas, enCero, sinVencimiento, sinNumero: filas.filter((f) => f.sinNumero).length };
}

// ---------------------------------------------------------------- duplicados
/** El número de un documento sin el tipo, sin ceros a la izquierda ni signos: «NE-0000017809» → «17809». */
export function numeroDocumento(d: string): string {
  // «NE-8432·ISMESOL» (el estado de cuenta viejo le pegaba el cliente) es la NE-8432.
  return d.split("·")[0].toUpperCase().replace(/^(NE|NET|NDE|NDC|NDB|ND|NC|NCR|FAC|FCM|FACT|FACTURA|NOTA)[\s\-#:.]*/, "")
    .replace(/\.0+$/, "").replace(/[^A-Z0-9]/g, "").replace(/^0+(?=.)/, "");
}

/** Nombre comparable: sin tildes, signos, espacios ni «C.A.». */
export function nombreComparable(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\(.*\)$/, "")
    .replace(/\b(C\s*[.,]?\s*A|S\s*[.,]?\s*A|S\s*[.,]?\s*R\s*[.,]?\s*L|SACA)\b\.?/g, " ").replace(/[^A-Z0-9]/g, "");
}

/** ¿Es la misma contraparte? Igual, o una abreviatura de la otra («FERREX» / «FERREX, C.A.»). */
export function mismaContraparte(a: string, b: string): boolean {
  const x = nombreComparable(a), y = nombreComparable(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length < y.length ? [x, y] : [y, x];
  return corto.length >= 4 && largo.startsWith(corto);
}

export type CuentaExistente = { contraparte: string; documento: string; monto: number; saldo: number; emitida: string };
export type Duplicada<F> = { fila: F; existente: CuentaExistente };

/** Separa las filas nuevas de las que ya están en la cartera, y las repetidas dentro del mismo archivo. */
export function separarDuplicadas<F extends FilaPlantilla & { linea?: number }>(filas: F[], cartera: CuentaExistente[]) {
  const porNumero = new Map<string, CuentaExistente[]>();
  for (const c of cartera) {
    const k = numeroDocumento(c.documento);
    porNumero.set(k, [...(porNumero.get(k) ?? []), c]);
  }
  const nuevas: F[] = [];
  const duplicadas: Duplicada<F>[] = [];
  const enArchivo: { fila: F; primera: F }[] = [];
  const vistas: F[] = [];
  for (const f of filas) {
    const k = numeroDocumento(f.documento);
    const ya = (porNumero.get(k) ?? []).find((c) => mismaContraparte(c.contraparte, f.contraparte));
    if (ya) { duplicadas.push({ fila: f, existente: ya }); continue; }
    const repetida = vistas.find((v) => numeroDocumento(v.documento) === k && mismaContraparte(v.contraparte, f.contraparte));
    if (repetida) { enArchivo.push({ fila: f, primera: repetida }); continue; }
    vistas.push(f);
    nuevas.push(f);
  }
  return { nuevas, duplicadas, enArchivo };
}
