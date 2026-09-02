// Lector de .xlsx (Excel 2007 en adelante), sin dependencias.
//
// Un .xlsx es un ZIP con XML adentro. Descomprimirlo lo hace el propio motor,
// con DecompressionStream, que está tanto en el navegador como en Node.
//
// Se escribió a mano en vez de instalar `xlsx` (SheetJS): la versión publicada
// en npm arrastra una vulnerabilidad conocida de prototype pollution, y las
// corregidas viven fuera de npm, o sea fuera de package-lock.
//
// NO lee .xls binario (Excel 97-2003). Ese formato es otra cosa y sí necesitaría
// una librería.

type Archivos = Map<string, Uint8Array>;

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([datos as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Abre el ZIP: recorre el directorio central y saca cada entrada. */
async function abrirZip(buf: ArrayBuffer): Promise<Archivos> {
  const b = new Uint8Array(buf);

  // El "fin del directorio central" está al final, pero puede haber comentario
  // detrás: se busca su firma de atrás para adelante.
  let fin = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 65558; i--) {
    if (u32(b, i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error("El archivo no es un .xlsx válido (no se encontró el índice del ZIP).");

  const cantidad = u16(b, fin + 10);
  let p = u32(b, fin + 16);

  const salida: Archivos = new Map();
  for (let n = 0; n < cantidad; n++) {
    if (u32(b, p) !== 0x02014b50) break;
    const metodo = u16(b, p + 10);
    const comprimido = u32(b, p + 20);
    const largoNombre = u16(b, p + 28);
    const largoExtra = u16(b, p + 30);
    const largoComentario = u16(b, p + 32);
    const offsetLocal = u32(b, p + 42);
    const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + largoNombre));

    // La cabecera local repite el nombre y el extra, y sus largos pueden diferir
    // de los del directorio: hay que leerlos de ahí, no reutilizarlos.
    const ln = u16(b, offsetLocal + 26);
    const le = u16(b, offsetLocal + 28);
    const inicio = offsetLocal + 30 + ln + le;
    const crudo = b.subarray(inicio, inicio + comprimido);

    salida.set(nombre, metodo === 0 ? crudo : await inflar(crudo));
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return salida;
}

const texto = (u?: Uint8Array) => (u ? new TextDecoder().decode(u) : "");

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");   // último: si no, desarma las otras entidades
}

/** La tabla de textos compartidos, donde Excel guarda las cadenas repetidas. */
function leerCompartidas(xml: string): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    // Una celda puede venir partida en varios <t> si tiene formato mezclado.
    const partes = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    return desescapar(partes.join(""));
  });
}

/** El número de columna de una referencia tipo "BC12" → 55 (base 0). */
function columnaDe(ref: string): number {
  const letras = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Las combinaciones de celdas de una hoja.
 *
 * En un .xlsx el valor de una combinación vive SOLO en su celda superior
 * izquierda; el resto del rango queda vacío. Sin resolverlas, un rótulo que
 * visualmente abarca cuatro columnas se lee en una sola, y las otras tres
 * parecen no tener título — que es como termina uno atribuyendo un número a la
 * etiqueta equivocada.
 */
function combinaciones(xml: string): { r1: number; c1: number; r2: number; c2: number }[] {
  return [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((m) => ({
    c1: columnaDe(m[1] + "1"), r1: Number(m[2]) - 1,
    c2: columnaDe(m[3] + "1"), r2: Number(m[4]) - 1,
  }));
}

/** Los nombres de las hojas, en el orden en que están en el libro. */
function nombresDeHojas(xml: string): string[] {
  return [...xml.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => desescapar(m[1]));
}

/**
 * Excel guarda 127254.97999999999 donde el usuario escribió 127254,98.
 * Es ruido de punto flotante, no un dato: se recorta sin cambiar el valor.
 */
function limpiarNumero(v: string): string {
  if (!/^-?\d+\.\d{6,}$/.test(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : v;
}

/**
 * Lee una hoja de un .xlsx y devuelve una matriz de texto.
 *
 * Las celdas vacías vienen como cadena vacía: Excel omite del XML las celdas
 * sin valor, así que hay que rellenar los huecos o las columnas se corren.
 */
export async function leerXlsx(
  buf: ArrayBuffer,
  cualHoja = 0,
  /** Repetir el valor de una combinación en todo su rango. */
  resolverCombinaciones = true,
): Promise<string[][]> {
  const zip = await abrirZip(buf);

  const hojas = [...zip.entries()]
    .filter(([k]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a[0].match(/\d+/)![0]) - Number(b[0].match(/\d+/)![0]));
  if (hojas.length === 0) throw new Error("El .xlsx no tiene hojas legibles.");

  const hoja = hojas[Math.min(cualHoja, hojas.length - 1)][1];

  const compartidas = leerCompartidas(texto(zip.get("xl/sharedStrings.xml")));
  const xml = texto(hoja);
  const filas: string[][] = [];

  for (const mf of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    // La fila se coloca en SU numero, no a continuacion de la anterior. Excel
    // omite del XML las filas vacias igual que las celdas: apilarlas en orden
    // corre todo hacia arriba, y entonces un rotulo pasa a leerse como si
    // fuera el valor que tiene debajo. Es exactamente el error que hizo que yo
    // atribuyera "129" a la etiqueta equivocada.
    const nfila = Number(mf[1].match(/\br="(\d+)"/)?.[1] ?? 0) - 1;
    const celdas: string[] = [];
    for (const mc of mf[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = mc[1];
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const tipo = attrs.match(/t="([^"]+)"/)?.[1];
      const cuerpo = mc[2];

      let valor: string;
      if (tipo === "inlineStr") {
        valor = desescapar([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      } else {
        const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        valor = tipo === "s" ? (compartidas[Number(v)] ?? "") : limpiarNumero(desescapar(v));
      }

      const i = ref ? columnaDe(ref) : celdas.length;
      while (celdas.length < i) celdas.push("");   // huecos que Excel no escribe
      celdas[i] = valor;
    }
    if (nfila >= 0) {
      while (filas.length < nfila) filas.push([]);
      filas[nfila] = celdas;
    } else {
      filas.push(celdas);
    }
  }
  if (resolverCombinaciones) {
    for (const m of combinaciones(xml)) {
      const valor = filas[m.r1]?.[m.c1] ?? "";
      if (!valor) continue;
      for (let r = m.r1; r <= m.r2; r++) {
        if (!filas[r]) continue;
        for (let c = m.c1; c <= m.c2; c++) {
          while (filas[r].length <= c) filas[r].push("");
          if (!filas[r][c]) filas[r][c] = valor;
        }
      }
    }
  }

  return filas;
}

/**
 * Busca un rótulo y devuelve el valor que tiene DEBAJO.
 *
 * En una planilla hecha a mano, la posición de un número no es estable pero su
 * rótulo sí. Buscar por rótulo es lo único que aguanta que alguien inserte una
 * columna — y es lo que evita leer el número de al lado.
 *
 * Devuelve también el rótulo encontrado: en planillas copiadas de hoja en hoja,
 * el título suele quedar del original, y hay que poder verlo para dudar de él.
 */
export function valorBajoRotulo(
  filas: string[][],
  rotulo: RegExp,
): { valor: string; rotulo: string; fila: number; columna: number } | null {
  for (let r = 0; r < filas.length; r++) {
    for (let c = 0; c < (filas[r]?.length ?? 0); c++) {
      const t = (filas[r][c] || "").replace(/\s+/g, " ").trim();
      if (!t || !rotulo.test(t)) continue;
      const abajo = (filas[r + 1]?.[c] || "").trim();
      if (abajo) return { valor: abajo, rotulo: t, fila: r + 1, columna: c };
    }
  }
  return null;
}

/** Un .xlsx siempre empieza con "PK": sirve para distinguirlo del .xls viejo. */
export function pareceXlsx(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b;
}

/** Convierte la matriz a texto separado por tabulaciones, para reusar el parser. */
export function aTexto(filas: string[][]): string {
  return filas.map((f) => f.map((c) => c.replace(/[\t\r\n]/g, " ")).join("\t")).join("\n");
}

/** Cuántas hojas tiene el libro y cómo se llaman. */
export async function hojasDe(buf: ArrayBuffer): Promise<string[]> {
  const zip = await abrirZip(buf);
  const nombres = nombresDeHojas(texto(zip.get("xl/workbook.xml")));
  if (nombres.length) return nombres;
  return [...zip.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .map((_, i) => `Hoja ${i + 1}`);
}

/**
 * La primera hoja que tenga datos de verdad.
 *
 * Muchos libros abren con una hoja de portada o de notas: leer siempre la
 * primera devolvería una matriz vacía y parecería que el archivo no sirve.
 */
export async function leerPrimeraConDatos(
  buf: ArrayBuffer,
  minimoFilas = 2,
): Promise<{ hoja: number; nombre: string; filas: string[][] }> {
  const nombres = await hojasDe(buf);
  for (let i = 0; i < nombres.length; i++) {
    const filas = await leerXlsx(buf, i);
    const utiles = filas.filter((f) => f.some((c) => c.trim()));
    if (utiles.length >= minimoFilas) return { hoja: i, nombre: nombres[i], filas };
  }
  return { hoja: 0, nombre: nombres[0] ?? "Hoja 1", filas: await leerXlsx(buf, 0) };
}
