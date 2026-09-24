// Colores y logos de los documentos que genera Macedonia: las actas de conteo
// (servidor) y las descargas del inventario (navegador). Un solo lugar, para
// que los dos se vean de la misma familia.

import { SUMIGASES_LOGO } from "./sumigases-logo.ts";
import { SUDEMATIN_LOGO } from "./sudematin-logo.ts";

export const C = {
  marron: "#b04e15", navy: "#0b2545", tinta: "#0f1b2d", gris: "#5b6b82", linea: "#d9e0ea",
  fondo: "#f4f6fa", rojo: "#ce2323", azul: "#2461e7", ambar: "#a25903",
  fondoRojo: "#fdf1f1", fondoAzul: "#eff4fe", fondoAmbar: "#fbf3e9",
};

export function logoDe(empresa: string): { src: string; ancho: number; alto: number } {
  // Sumigases es horizontal (600x104); Sudematin, cuadrado.
  return /sudematin/i.test(empresa)
    ? { src: SUDEMATIN_LOGO, ancho: 52, alto: 52 }
    : { src: SUMIGASES_LOGO, ancho: 130, alto: 130 * 104 / 600 };
}

/** Color de Excel (ARGB) desde un hex. */
export const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
