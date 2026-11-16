// ¿A qué cliente de la cartera va una nota de Valery?
//
// Pedido del usuario (16-11-2026): al pasar una nota de entrega de Ventas a
// Cuentas por Cobrar se abría un cliente nuevo aunque ya tuviera cuenta. Valery
// y la cartera escriben distinto al mismo cliente: «DEL SUR INTERNATIONAL
// CORP,C.A.» y «DEL SUR CORP»; «CORPO ALASKA C.A» y «CORPO ALASLKA». La búsqueda
// era por el nombre exacto (sin signos ni «C.A.»): si no coincidía, cliente nuevo.
//
// Ahora:
//   1. Si alguna vez ya se eligió a qué cliente va ese nombre de Valery, va
//      ahí: la cuenta guarda «Cliente en Valery: …» en su nota.
//   2. Si el nombre coincide (sin signos ni «C.A.»), va a ese cliente.
//   3. Si no, se proponen los parecidos y la persona elige; nunca se adivina.
//
// Pura, para probarla.

import { clienteNormal } from "../inventory/ventas-valery.ts";

/** Palabras que no distinguen a un cliente de otro. */
const GENERICAS = new Set([
  "DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "C", "A", "CA", "SA", "SRL", "SACA",
  "CORP", "CORPO", "CORPORACION", "CONSORCIO", "GRUPO", "INVERSIONES", "INVERSORA", "SERVICIOS", "SERVICIO",
  "SUMINISTROS", "SUMINISTRO", "INDUSTRIAL", "INDUSTRIALES", "COMERCIAL", "COMERCIALIZADORA", "DISTRIBUIDORA",
  "INTERNATIONAL", "INTERNACIONAL", "COMPANIA", "COMPANY", "EMPRESA", "EMPRESAS", "VENEZUELA", "ORIENTE",
]);

const tokens = (s: string) => clienteNormal(s).split(" ").filter((t) => t.length >= 2 && !GENERICAS.has(t));

/** Distancia de edición (para «ALASKA» y «ALASLKA»). */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = t;
    }
  }
  return prev[b.length];
}
const mismaPalabra = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && distancia(a, b) <= 1);

/**
 * Qué tan parecido es un nombre a otro (0–1): la parte de las palabras que
 * distinguen al cliente que tienen los dos. Sin palabras propias, 0.
 */
export function parecido(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return 0;
  const comunes = x.filter((t) => y.some((u) => mismaPalabra(t, u))).length;
  return comunes / Math.max(x.length, y.length);
}

/** Los clientes de la cartera que se parecen al nombre de Valery, del más al menos parecido. */
export function clientesParecidos(nombre: string, cartera: string[], minimo = 0.5): { contraparte: string; puntaje: number }[] {
  return cartera
    .map((c) => ({ contraparte: c, puntaje: parecido(nombre, c) }))
    .filter((c) => c.puntaje >= minimo)
    .sort((a, b) => b.puntaje - a.puntaje || a.contraparte.localeCompare(b.contraparte, "es"));
}

// ---------------------------------------------------------------- lo que ya se eligió

const MARCA = "Cliente en Valery: ";

/** Lo que se guarda en la nota de la cuenta cuando el cliente de Valery se llama distinto. */
export const notaAlias = (nombreValery: string) => `${MARCA}${nombreValery.trim()}`;

/** El nombre de Valery que una cuenta dice tener (o null). */
export function aliasDeNota(nota: string | null | undefined): string | null {
  if (!nota) return null;
  const i = nota.indexOf(MARCA);
  if (i < 0) return null;
  const resto = nota.slice(i + MARCA.length).split(" · ")[0].trim();
  return resto || null;
}

/**
 * El cliente de la cartera al que ya se mandó antes ese nombre de Valery: el
 * de la cuenta más reciente que lo dice en su nota.
 */
export function clienteRecordado(nombreValery: string, cuentas: { contraparte: string; nota: string | null; creada: string }[]): string | null {
  const buscado = clienteNormal(nombreValery);
  if (!buscado) return null;
  const suyas = cuentas.filter((c) => { const a = aliasDeNota(c.nota); return a !== null && clienteNormal(a) === buscado; })
    .sort((a, b) => b.creada.localeCompare(a.creada));
  return suyas[0]?.contraparte.trim() ?? null;
}
