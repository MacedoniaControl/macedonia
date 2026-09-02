/**
 * Lee el conteo manual de cilindros (el libro tipo "SEPTIEMBRE 2026.xlsx").
 *
 * El libro tiene una hoja por gas y cada hoja repite la misma banda de
 * encabezados varias veces hacia abajo. El total del parque -los cilindros de
 * los que la empresa es propietaria- NO esta rotulado en la mayoria de las
 * hojas: vive en la celda inmediatamente a la derecha de "Prestados", en la
 * fila de ese primer encabezado. Solo OXIG y UAP traen el rotulo "TOTAL DE
 * CILINDROS", y esta mas abajo, en una banda repetida, no encima del numero.
 *
 * Por eso la regla es posicional y el rotulo solo sirve para confirmar la
 * columna cuando existe. Las columnas G a O estan ocultas en Excel, asi que
 * nada de esto se ve al abrir el archivo.
 */
import { leerXlsx, hojasDe } from "../ux/xlsx.ts";

/** Nombre de hoja -> gas. El orden es el que se muestra al revisar. */
export const HOJAS_GAS: Record<string, string> = {
  OXIG: "Oxigeno",
  NITRO: "Nitrogeno",
  ARGON: "Argon",
  ARGOMIX: "Argomix",
  CO2: "CO2",
  ACET: "Acetileno",
  UAP: "UAP",
};

export type TotalGas = {
  gas: string;
  hoja: string;
  total: number;
  /** Celda de origen, en notacion Excel, para poder auditar el numero. */
  celda: string;
  /** El rotulo que confirma la columna, si la hoja lo trae. */
  rotulo: string | null;
  /** Otra hoja declara exactamente el mismo total: puede ser copia y pega. */
  repetido: boolean;
};

function normalizar(v: string | undefined): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function letraColumna(indice: number): string {
  let s = "";
  for (let n = indice; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

/** Ubica el total dentro de una hoja ya leida. `null` si la hoja no calza. */
export function totalDeHoja(filas: string[][]): Omit<TotalGas, "gas" | "hoja" | "repetido"> | null {
  const fila = filas.findIndex((f) =>
    (f ?? []).some((v) => /^prestados\b/i.test(normalizar(v))),
  );
  if (fila < 0) return null;

  const encabezado = filas[fila] ?? [];
  const iPrestados = encabezado.findIndex((v) => /^prestados\b/i.test(normalizar(v)));
  const columna = iPrestados + 1;

  const bruto = normalizar(encabezado[columna]);
  // "#REF!" y demas restos de formulas rotas no son un conteo.
  if (!/^\d+$/.test(bruto)) return null;

  let rotulo: string | null = null;
  for (const f of filas) {
    const v = normalizar((f ?? [])[columna]);
    if (/TOTAL DE CILINDROS/i.test(v)) {
      rotulo = v;
      break;
    }
  }

  return { total: Number(bruto), celda: `${letraColumna(columna)}${fila + 1}`, rotulo };
}

/** Lee el libro completo y devuelve el total por gas. */
export async function leerParque(buf: ArrayBuffer): Promise<TotalGas[]> {
  const hojas = await hojasDe(buf);
  const salida: TotalGas[] = [];

  for (const [hoja, gas] of Object.entries(HOJAS_GAS)) {
    const i = hojas.indexOf(hoja);
    if (i < 0) continue;
    const encontrado = totalDeHoja(await leerXlsx(buf, i));
    if (!encontrado) continue;
    salida.push({ gas, hoja, repetido: false, ...encontrado });
  }

  // Un mismo total en varias hojas casi siempre es la hoja duplicada y nunca
  // recontada. No lo descartamos -puede ser cierto- pero queda marcado para
  // que nadie cargue un parque inventado creyendo que lo conto alguien.
  const veces = new Map<number, number>();
  for (const t of salida) veces.set(t.total, (veces.get(t.total) ?? 0) + 1);
  for (const t of salida) t.repetido = (veces.get(t.total) ?? 0) > 1;

  return salida;
}
