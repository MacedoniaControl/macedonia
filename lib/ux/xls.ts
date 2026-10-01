// Lector de .xls (Excel 97-2003, BIFF8), sin dependencias.
//
// Valery exporta sus reportes en este formato. Un .xls es un «archivo
// compuesto» de OLE (un pequeño sistema de archivos con sectores y una tabla
// de asignación) que guarda adentro el flujo «Workbook»: una lista de
// registros BIFF. De ahí se sacan las hojas, la tabla de textos compartidos
// y las celdas.
//
// Se escribió a mano por la misma razón que lib/ux/xlsx.ts: la librería que
// lo haría (SheetJS) en npm arrastra una vulnerabilidad conocida.
//
// Devuelve valores con su tipo: número, texto o booleano (null = vacía). Las
// fechas llegan como número de serie de Excel (días desde el 30-12-1899).

export type Celda = string | number | boolean | null;

const FIRMA = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FIN_CADENA = 0xfffffffe;
const LIBRE = 0xffffffff;

/** ¿Es un .xls (archivo compuesto de OLE)? */
export function pareceXls(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  return b.length === 8 && FIRMA.every((x, i) => b[i] === x);
}

// ---------------------------------------------------------------- archivo compuesto
function flujoWorkbook(buf: ArrayBuffer): Uint8Array {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (!pareceXls(buf)) throw new Error("No es un archivo de Excel 97-2003 (.xls).");
  const sector = 1 << dv.getUint16(0x1e, true);
  const mini = 1 << dv.getUint16(0x20, true);
  const nFat = dv.getUint32(0x2c, true);
  const dirInicio = dv.getUint32(0x30, true);
  const corte = dv.getUint32(0x38, true);
  const miniFatInicio = dv.getUint32(0x3c, true);
  let difat = dv.getUint32(0x44, true);
  const off = (s: number) => (s + 1) * sector;

  // Los sectores de la FAT: 109 en la cabecera y el resto en la DIFAT encadenada.
  const sectoresFat: number[] = [];
  for (let i = 0; i < 109 && sectoresFat.length < nFat; i++) sectoresFat.push(dv.getUint32(0x4c + i * 4, true));
  for (let vueltas = 0; difat !== FIN_CADENA && difat !== LIBRE && sectoresFat.length < nFat && vueltas < 10_000; vueltas++) {
    const o = off(difat);
    for (let i = 0; i < sector / 4 - 1 && sectoresFat.length < nFat; i++) sectoresFat.push(dv.getUint32(o + i * 4, true));
    difat = dv.getUint32(o + sector - 4, true);
  }
  const fat: number[] = [];
  for (const s of sectoresFat) for (let i = 0; i < sector / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true));

  const cadena = (inicio: number, tabla: number[]) => {
    const out: number[] = [];
    for (let s = inicio; s !== FIN_CADENA && s !== LIBRE && s < tabla.length; s = tabla[s]) {
      out.push(s);
      if (out.length > tabla.length) throw new Error("El archivo .xls está dañado (cadena de sectores sin fin).");
    }
    return out;
  };
  const leer = (inicio: number) => {
    const ss = cadena(inicio, fat);
    const r = new Uint8Array(ss.length * sector);
    ss.forEach((s, i) => r.set(b.subarray(off(s), off(s) + sector), i * sector));
    return r;
  };

  // El directorio: entradas de 128 bytes.
  const dir = leer(dirInicio);
  const ddv = new DataView(dir.buffer);
  type Entrada = { nombre: string; tipo: number; inicio: number; tam: number };
  const entradas: Entrada[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const largo = ddv.getUint16(o + 0x40, true);
    let nombre = "";
    for (let i = 0; i < Math.max(0, largo - 2); i += 2) nombre += String.fromCharCode(ddv.getUint16(o + i, true));
    entradas.push({ nombre, tipo: dir[o + 0x42], inicio: ddv.getUint32(o + 0x74, true), tam: ddv.getUint32(o + 0x78, true) });
  }
  const raiz = entradas.find((e) => e.tipo === 5);
  const wb = entradas.find((e) => e.tipo === 2 && (e.nombre === "Workbook" || e.nombre === "Book"));
  if (!wb) throw new Error("El archivo .xls no trae hoja de cálculo.");
  if (wb.nombre === "Book") throw new Error("Es un Excel muy viejo (95 o anterior). Expórtalo de nuevo desde Valery.");

  if (wb.tam >= corte || !raiz) return leer(wb.inicio).subarray(0, wb.tam);
  // Flujo chico: vive en el «mini flujo», con su propia tabla de asignación.
  const miniFat: number[] = [];
  if (miniFatInicio !== FIN_CADENA) {
    const mf = leer(miniFatInicio);
    const mdv = new DataView(mf.buffer);
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mdv.getUint32(i, true));
  }
  const contenedor = leer(raiz.inicio);
  const ms = cadena(wb.inicio, miniFat);
  const r = new Uint8Array(ms.length * mini);
  ms.forEach((s, i) => r.set(contenedor.subarray(s * mini, s * mini + mini), i * mini));
  return r.subarray(0, wb.tam);
}

// ---------------------------------------------------------------- registros BIFF
type Registro = { tipo: number; datos: Uint8Array; pos: number };

function registros(w: Uint8Array): Registro[] {
  const out: Registro[] = [];
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
  for (let p = 0; p + 4 <= w.length; ) {
    const tipo = dv.getUint16(p, true), largo = dv.getUint16(p + 2, true);
    out.push({ tipo, datos: w.subarray(p + 4, p + 4 + largo), pos: p });
    p += 4 + largo;
  }
  return out;
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const f64 = (b: Uint8Array, i: number) => new DataView(b.buffer, b.byteOffset + i, 8).getFloat64(0, true);

function rk(v: number): number {
  let n: number;
  if (v & 2) n = (v | 0) >> 2;   // entero de 30 bits con signo
  else {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(4, v & 0xfffffffc, true);
    n = dv.getFloat64(0, true);
  }
  return v & 1 ? n / 100 : n;
}

/** Caracteres de un texto BIFF8: comprimidos (1 byte) o UTF-16 (2 bytes). */
function caracteres(b: Uint8Array, i: number, n: number, ancho: boolean): string {
  let s = "";
  for (let k = 0; k < n; k++) s += String.fromCharCode(ancho ? u16(b, i + 2 * k) : b[i + k]);
  return s;
}

/** Texto con longitud de 1 o 2 bytes y su byte de opciones (LABEL, STRING, nombre de hoja). */
function texto(b: Uint8Array, i: number, largo2: boolean): string {
  const n = largo2 ? u16(b, i) : b[i];
  const o = i + (largo2 ? 2 : 1);
  const op = b[o];
  let p = o + 1;
  if (op & 8) p += 2;   // corridas de formato
  if (op & 4) p += 4;   // datos extendidos
  return caracteres(b, p, n, (op & 1) === 1);
}

/**
 * La tabla de textos compartidos (SST). Un texto puede quedar partido entre el
 * SST y los CONTINUE que le siguen; al cruzar, el CONTINUE trae su propio byte
 * de opciones (1 o 2 bytes por carácter) para el resto del texto.
 */
function tablaTextos(partes: Uint8Array[]): string[] {
  const textos: string[] = [];
  let parte = 0, p = 8;
  const total = u32(partes[0], 4);
  const actual = () => partes[parte];
  const asegurar = () => { while (parte < partes.length && p >= actual().length) { parte++; p = 0; } };
  const byte = () => { asegurar(); return actual()[p++]; };
  const saltar = (n: number) => { while (n > 0) { asegurar(); const d = Math.min(n, actual().length - p); p += d; n -= d; } };
  for (let t = 0; t < total && parte < partes.length; t++) {
    asegurar();
    const n = byte() | (byte() << 8);
    const op = byte();
    let ancho = (op & 1) === 1;
    const corridas = op & 8 ? (byte() | (byte() << 8)) : 0;
    const ext = op & 4 ? (byte() | (byte() << 8) | (byte() << 16) | (byte() << 24)) >>> 0 : 0;
    let s = "";
    let faltan = n;
    while (faltan > 0) {
      if (p >= actual().length) { parte++; p = 0; if (parte >= partes.length) break; ancho = (actual()[p++] & 1) === 1; }
      const cabe = Math.min(faltan, Math.floor((actual().length - p) / (ancho ? 2 : 1)));
      s += caracteres(actual(), p, cabe, ancho);
      p += cabe * (ancho ? 2 : 1);
      faltan -= cabe;
    }
    saltar(corridas * 4 + ext);
    textos.push(s);
  }
  return textos;
}

type Libro = { hojas: { nombre: string; pos: number }[]; textos: string[]; regs: Registro[] };

function libro(buf: ArrayBuffer): Libro {
  const regs = registros(flujoWorkbook(buf));
  const hojas: Libro["hojas"] = [];
  let textos: string[] = [];
  for (let i = 0; i < regs.length; i++) {
    const r = regs[i];
    if (r.tipo === 0x0085) hojas.push({ pos: u32(r.datos, 0), nombre: texto(r.datos, 6, false) });
    else if (r.tipo === 0x00fc) {
      const partes = [r.datos];
      for (let j = i + 1; j < regs.length && regs[j].tipo === 0x003c; j++) partes.push(regs[j].datos);
      textos = tablaTextos(partes);
    } else if (r.tipo === 0x000a && hojas.length) break;   // fin de los datos globales
  }
  return { hojas, textos, regs };
}

/** Nombres de las hojas, en orden. */
export function hojasXls(buf: ArrayBuffer): string[] {
  return libro(buf).hojas.map((h) => h.nombre);
}

/** Celdas de una hoja (por índice), fila por fila. Las filas vacías del medio quedan como []. */
export function leerXls(buf: ArrayBuffer, hoja = 0): Celda[][] {
  const { hojas, textos, regs } = libro(buf);
  const h = hojas[hoja];
  if (!h) throw new Error(`El archivo no tiene la hoja ${hoja + 1}.`);
  const filas: Celda[][] = [];
  const poner = (f: number, c: number, v: Celda) => {
    while (filas.length <= f) filas.push([]);
    const fila = filas[f];
    while (fila.length < c) fila.push(null);
    fila[c] = v;
  };
  let i = regs.findIndex((r) => r.pos === h.pos);
  if (i < 0) throw new Error("El archivo .xls está dañado (no se encuentra la hoja).");
  let pendiente: [number, number] | null = null;   // FORMULA de texto: el valor viene en el STRING siguiente
  for (i++; i < regs.length; i++) {
    const { tipo, datos: d } = regs[i];
    if (tipo === 0x000a) break;   // EOF de la hoja
    switch (tipo) {
      case 0x0203: poner(u16(d, 0), u16(d, 2), f64(d, 6)); break;                         // NUMBER
      case 0x027e: poner(u16(d, 0), u16(d, 2), rk(u32(d, 6))); break;                     // RK
      case 0x00bd: {                                                                      // MULRK
        const f = u16(d, 0), c0 = u16(d, 2), n = (d.length - 6) / 6;
        for (let k = 0; k < n; k++) poner(f, c0 + k, rk(u32(d, 4 + k * 6 + 2)));
        break;
      }
      case 0x00fd: poner(u16(d, 0), u16(d, 2), textos[u32(d, 6)] ?? ""); break;           // LABELSST
      case 0x0204: poner(u16(d, 0), u16(d, 2), texto(d, 6, true)); break;                 // LABEL
      case 0x0205: poner(u16(d, 0), u16(d, 2), d[7] ? null : d[6] === 1); break;          // BOOLERR
      case 0x0006: {                                                                      // FORMULA
        const f = u16(d, 0), c = u16(d, 2);
        if (d[12] === 0xff && d[13] === 0xff) {
          if (d[6] === 0) pendiente = [f, c];
          else if (d[6] === 1) poner(f, c, d[8] === 1);
        } else poner(f, c, f64(d, 6));
        break;
      }
      case 0x0207: if (pendiente) { poner(pendiente[0], pendiente[1], texto(d, 0, true)); pendiente = null; } break;  // STRING
    }
  }
  return filas;
}
