// Lo que una pestaña del inventario entrega para descargar en Excel o PDF.
//
// Cada pestaña arma su tabla con lo MISMO que muestra: sus filtros, su busqueda
// y su orden. Los archivos solo la dibujan (lib/ux/tabla-archivos.ts), asi que
// el Excel, el PDF y la pantalla no pueden decir cosas distintas.
//
// Funciones puras: se prueban sin navegador (tabla-export.test.ts).

export type TipoColumna = "texto" | "codigo" | "num" | "dif" | "usd" | "pct" | "fecha";
export type Columna = { titulo: string; tipo?: TipoColumna };
export type Celda = string | number | null;

export type TablaExport = {
  /** Nombre corto para el archivo: "Master", "Movimientos"… */
  seccion: string;
  /** Titulo del documento: "Inventario Master". */
  titulo: string;
  /** Que esta mostrando la vista: filtros, busqueda, orden. */
  detalle: string[];
  columnas: Columna[];
  filas: Celda[][];
  /** Fila de totales, alineada con las columnas. */
  totales?: Celda[];
  /** Aclaracion al pie. */
  nota?: string;
};

export type MetaExport = { empresa: string; rif: string; generado: string; por: string };

/** Con esta cantidad de filas el PDF ya son decenas de paginas: se avisa. */
export const FILAS_PDF_AVISO = 3000;
/** Filas por pagina del PDF, aproximado, para el aviso. */
export const FILAS_POR_PAGINA = 45;

/** "Inventario Master - Sumigases - 24-09-2026.xlsx", sin caracteres que un sistema rechace. */
export function nombreArchivo(t: Pick<TablaExport, "seccion">, empresa: string, fecha: string, ext: "xlsx" | "pdf"): string {
  const limpio = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${limpio(`Inventario ${t.seccion} - ${empresa} - ${fecha}`)}.${ext}`;
}

/** Fecha y hora de Venezuela: "24-09-2026 10:05". */
export function ahoraCaracas(d = new Date()): { fecha: string; fechaHora: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const fecha = `${p.day}-${p.month}-${p.year}`;
  return { fecha, fechaHora: `${fecha} ${p.hour}:${p.minute}` };
}

const num = (n: number, max = 3) => Math.abs(n).toLocaleString("es-VE", { maximumFractionDigits: max });

/** Una celda como texto, para el PDF. En Excel van como numero con formato. */
export function textoCelda(v: Celda, tipo: TipoColumna = "texto"): string {
  if (v === null || v === "") return "—";
  if (typeof v === "string") return tipo === "fecha" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("-") : v;
  switch (tipo) {
    case "dif": return v === 0 ? "0" : `${v > 0 ? "+" : "−"}${num(v)}`;
    case "usd": return `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "pct": return `${v < 0 ? "−" : ""}${num(v, 1)} %`;
    default: return `${v < 0 ? "−" : ""}${num(v)}`;
  }
}

/** Mas de cinco columnas no entran paradas en una hoja. */
export function orientacion(t: Pick<TablaExport, "columnas">): "portrait" | "landscape" {
  return t.columnas.length > 5 ? "landscape" : "portrait";
}

/** Una fecha ISO de la base como en pantalla: 2026-09-23 → 23-09-2026. */
export const fechaVista = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("-") : null);

/** El estado de la tabla de Valery, igual que en pantalla. */
export const fmtEstadoValery = (existencia: number) => (existencia < 0 ? "Negativa" : existencia === 0 ? "En cero" : "Disponible");
