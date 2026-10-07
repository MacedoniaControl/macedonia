// Orden de las tablas de cartera (cobrar y pagar) al tocar una cabecera.
//
// El primer toque pone lo que más importa arriba: montos y saldos de mayor a
// menor, el vencimiento del más viejo al más nuevo y el estado del más grave
// (más días vencido) al que ya está pagado. El segundo toque lo invierte.
// Lo que no tiene valor (un cliente sin deuda abierta no tiene «vence») va
// siempre al final, en cualquier dirección.
//
// Pura, para que la pantalla y la descarga salgan en el mismo orden.

import { CASI_CERO } from "../ux/decimales.ts";

export type ClaveOrden = "nombre" | "documentos" | "monto" | "saldo" | "vence" | "estado";
export type Orden = { clave: ClaveOrden; dir: "asc" | "desc" } | null;

const PRIMERA: Record<ClaveOrden, "asc" | "desc"> = {
  nombre: "asc", documentos: "desc", monto: "desc", saldo: "desc", vence: "asc", estado: "desc",
};

/** El orden al tocar la cabecera `clave`: la misma la invierte, otra empieza por lo importante. */
export function siguienteOrden(actual: Orden, clave: ClaveOrden): Orden {
  if (actual?.clave === clave) return { clave, dir: actual.dir === "asc" ? "desc" : "asc" };
  return { clave, dir: PRIMERA[clave] };
}

/** Para aria-sort en la cabecera. */
export function ariaOrden(actual: Orden, clave: string): "ascending" | "descending" | "none" {
  if (actual?.clave !== clave) return "none";
  return actual.dir === "asc" ? "ascending" : "descending";
}

/**
 * La gravedad del estado como número, para ordenar: más alto = peor.
 * Pagada o liquidada va al fondo; si no, cuantos más días vencida, peor
 * (una por vencer en 3 días va antes que una al día en 30).
 */
export function gravedad(saldo: number, dias: number | null, liquidada = false): number | null {
  if (liquidada || saldo <= CASI_CERO || dias === null) return null;
  return -dias;
}

/** Ordena sin tocar el arreglo. A igual valor se respeta el orden que traía. */
export function ordenar<T>(filas: T[], orden: Orden, valor: (fila: T, clave: ClaveOrden) => number | string | null): T[] {
  if (!orden) return filas;
  const signo = orden.dir === "asc" ? 1 : -1;
  return filas
    .map((f, i) => ({ f, i, v: valor(f, orden.clave) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const d = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), "es", { sensitivity: "base" });
      return d === 0 ? a.i - b.i : d * signo;
    })
    .map((x) => x.f);
}
