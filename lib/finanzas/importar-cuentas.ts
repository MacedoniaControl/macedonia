// Lectura de un archivo de cartera para cargar cuentas por cobrar o pagar.
//
// Acepta CSV y texto separado por tabulaciones (que es lo que sale al copiar y
// pegar desde Excel). El .xls binario necesita una librería: ver la nota en
// docs/CAMBIOS-FRONT.md.
//
// No inserta nada: devuelve las filas leídas y los problemas encontrados, para
// que quien importa vea qué va a entrar ANTES de que entre. Una importación que
// escribe primero y avisa después deja la cartera sucia.

export type FilaImportada = {
  contraparte: string;
  documento: string;
  monto: number;
  vence: string;
};

export type Lectura = {
  filas: FilaImportada[];
  problemas: { linea: number; motivo: string }[];
};

/** Nombres aceptados por columna. Se comparan sin acentos ni mayúsculas. */
const ALIAS: Record<keyof FilaImportada, string[]> = {
  contraparte: ["contraparte", "cliente", "proveedor", "razon social", "nombre"],
  documento: ["documento", "doc", "factura", "nro", "numero", "n"],
  monto: ["monto", "total", "saldo", "importe"],
  vence: ["vence", "vencimiento", "fecha venc", "fecha de vencimiento", "fecha"],
};

const limpiar = (s: string) =>
  s.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[."']/g, "").replace(/\s+/g, " ");

/** Detecta el separador mirando la cabecera: coma, punto y coma o tabulación. */
function separadorDe(cabecera: string): string {
  const cuenta = (c: string) => cabecera.split(c).length;
  return [";", "\t", ","].sort((a, b) => cuenta(b) - cuenta(a))[0];
}

/** Un número que puede venir "1.234,56" (es-VE) o "1234.56". */
export function aNumero(v: string): number | null {
  const t = v.trim().replace(/[$\s]/g, "");
  if (!t) return null;
  // Si hay coma y punto, el ÚLTIMO separador es el decimal.
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  let normal = t;
  if (coma >= 0 && punto >= 0) {
    normal = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    // Sola: decimal si deja 1 o 2 dígitos detrás, si no es de miles.
    normal = t.length - coma - 1 <= 2 ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Fecha en ISO. Acepta aaaa-mm-dd, dd/mm/aaaa y dd-mm-aaaa. */
export function aFecha(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function leerCartera(texto: string): Lectura {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) {
    return { filas: [], problemas: [{ linea: 0, motivo: "El archivo no tiene filas de datos." }] };
  }

  const sep = separadorDe(lineas[0]);
  const cabecera = lineas[0].split(sep).map(limpiar);

  const indice = (campo: keyof FilaImportada) =>
    cabecera.findIndex((c) => ALIAS[campo].some((a) => c === a || c.startsWith(a)));

  const iCon = indice("contraparte"), iDoc = indice("documento");
  const iMon = indice("monto"), iVen = indice("vence");

  const faltan = [
    iCon < 0 && "contraparte/cliente/proveedor",
    iDoc < 0 && "documento",
    iMon < 0 && "monto/saldo",
  ].filter(Boolean);

  if (faltan.length) {
    return { filas: [], problemas: [{ linea: 1, motivo: `Faltan columnas: ${faltan.join(", ")}.` }] };
  }

  const filas: FilaImportada[] = [];
  const problemas: Lectura["problemas"] = [];

  for (let i = 1; i < lineas.length; i++) {
    const c = lineas[i].split(sep);
    const contraparte = (c[iCon] ?? "").trim();
    const documento = (c[iDoc] ?? "").trim();
    const monto = aNumero(c[iMon] ?? "");
    const vence = iVen >= 0 ? aFecha(c[iVen] ?? "") : null;

    if (!contraparte) { problemas.push({ linea: i + 1, motivo: "Sin contraparte." }); continue; }
    if (!documento) { problemas.push({ linea: i + 1, motivo: "Sin documento." }); continue; }
    if (monto === null || monto <= 0) { problemas.push({ linea: i + 1, motivo: `Monto inválido: "${c[iMon] ?? ""}".` }); continue; }

    filas.push({
      contraparte, documento, monto,
      // Sin fecha de vencimiento se usa la de hoy: vencida es más seguro que
      // al día, porque aparece en las alertas en vez de pasar desapercibida.
      vence: vence ?? new Date().toISOString().slice(0, 10),
    });
  }

  return { filas, problemas };
}
