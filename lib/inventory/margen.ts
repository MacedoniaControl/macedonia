// Margen de un producto, calculado igual que el "% Util." de Valery.
//
// Vive aparte de la pantalla para poder probarlo: es aritmetica pura.

import { PCT_IVA } from "../finanzas/retencion.ts";

/**
 * Utilidad sobre el precio de venta, en %: 1 - costo / precio, los dos SIN IVA.
 *
 * `productos` guarda el costo SIN IVA y el precio CON IVA (el precio Maximo de
 * Valery). Antes la pantalla dividia uno por otro tal cual, con dos errores que
 * se sumaban: comparaba un precio con IVA contra un costo sin IVA, y calculaba
 * sobre el costo en vez de sobre la venta. Un cable que en Valery deja 35% salia
 * con 78%.
 *
 * null cuando no hay con que calcular: sin costo (nunca se compro, o esta
 * persona no puede verlo) o sin precio.
 */
export function margenSobreVenta(costoSinIva: number | null, precioConIva: number): number | null {
  if (costoSinIva === null || !(costoSinIva > 0) || !(precioConIva > 0)) return null;
  const precioSinIva = precioConIva / (1 + PCT_IVA);
  return Math.round((1 - costoSinIva / precioSinIva) * 1000) / 10;
}
