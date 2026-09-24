// Leer una cantidad contada, escrita por una persona en Venezuela.
//
// Usa la misma regla que los montos (lib/ux/monto.ts): coma decimal, punto de
// miles, y lo que no se entiende da error en vez de un numero plausible. La
// diferencia con un monto es que aquí importa distinguir tres cosas que un
// numero solo no distingue: no contado, contado en cero, y mal escrito.

import { parseMonto } from "../ux/monto.ts";

export type Lectura =
  | { estado: "vacio" }
  | { estado: "cero"; valor: 0 }
  | { estado: "ok"; valor: number }
  | { estado: "error"; msg: string };

export function leerCantidad(texto: string): Lectura {
  const t = texto.trim();
  // Vacio es "no lo conte": distinto de cero, que es "fui y no hay ninguno".
  if (t === "") return { estado: "vacio" };
  if (/^-/.test(t)) return { estado: "error", msg: "No puede ser negativo." };
  const n = parseMonto(t);
  if (n === null) return { estado: "error", msg: `No entiendo «${t}». Usa coma para los decimales: 12,5` };
  if (n === 0) return { estado: "cero", valor: 0 };
  // La base guarda tres decimales: un cuarto no existe en lo que se cuenta.
  return { estado: "ok", valor: Math.round(n * 1000) / 1000 };
}

/** Unidades que no se parten: medio guante o media careta no se cuentan. */
const ENTERAS = new Set(["UND", "UNIDAD", "UN", "PAR", "CAJA", "CILINDRO", "CIL", "BLISTER", "BOLSA", "SACO", "TALLA", "ROLLO"]);

export function vaEntera(unidad: string | null | undefined): boolean {
  return ENTERAS.has(String(unidad ?? "").trim().toUpperCase());
}

/** Numero con formato venezolano, sin ceros de mas: 1.600 · 212,5 · 0,875 */
export function fmtCantidad(n: number): string {
  return n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
}
