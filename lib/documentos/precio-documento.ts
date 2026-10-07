// El precio que entra a un renglón de nota, cotización o devolución.
//
// El catálogo guarda el precio de venta CON IVA (el precio Máximo de Valery,
// ver lib/inventory/margen.ts). El documento, en cambio, se arma sin IVA: el
// renglón lleva la base y el IVA se suma abajo solo si quien emite lo elige.
// Antes el renglón tomaba el precio del catálogo tal cual: un artículo de
// $4,00 entraba a $4,64, el IVA quedaba escondido en la base imponible y, si
// además se marcaba «Incluir IVA», se cobraba dos veces.

import { aMonto } from "../ux/decimales.ts";
/** Precio de catálogo (con IVA) → precio del renglón (sin IVA), a 2 decimales como Valery. */
export function precioSinIva(precioConIva: number, ivaPct: number): number {
  if (!(precioConIva > 0)) return 0;
  return aMonto(precioConIva / (1 + ivaPct / 100));
}
