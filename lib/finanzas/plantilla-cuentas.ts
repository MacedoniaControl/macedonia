// La plantilla de Excel para cargar cuentas por cobrar o por pagar.
//
// Solo se admite ESTA plantilla: la que se descarga con «Descargar plantilla».
// Antes se aceptaba cualquier archivo que tuviera columnas parecidas, y eso
// dejaba pasar exportes de otros sistemas con significados distintos (un
// «Total» que no era el saldo, una «Fecha» que no era el vencimiento). Ahora
// el archivo tiene que traer tres cosas de la plantilla, o se rechaza:
//   1. la hoja con su nombre («Cuentas por Cobrar» / «Cuentas por Pagar»);
//   2. la marca interna de la plantilla (una hoja oculta);
//   3. las columnas exactas, en el mismo orden.
//
// También detecta los documentos que ya están en la cartera: importar dos
// veces el mismo archivo duplicaba la deuda.

import { aNumero } from "./importar-cuentas.ts";
import { aMonto } from "../ux/decimales.ts";

export type TipoPlantilla = "cobrar" | "pagar";

export const HOJA: Record<TipoPlantilla, string> = { cobrar: "Cuentas por Cobrar", pagar: "Cuentas por Pagar" };
export const HOJA_MARCA = "Macedonia";
export const MARCA: Record<TipoPlantilla, string> = { cobrar: "macedonia-plantilla-cxc-v1", pagar: "macedonia-plantilla-cxp-v1" };
export const COLUMNAS: Record<TipoPlantilla, string[]> = {
  cobrar: ["Cliente", "Documento", "Fecha de emisión", "Fecha de vencimiento", "Monto USD", "Nota"],
  pagar: ["Proveedor", "Documento", "Fecha de emisión", "Fecha de vencimiento", "Monto USD", "Nota"],
};

export type FilaPlantilla = { contraparte: string; documento: string; emitida: string; vence: string; monto: number; nota: string };
export type LecturaPlantilla = {
  filas: FilaPlantilla[];
  /** Filas que no entran y por qué (línea = fila de Excel). */
  problemas: { linea: number; motivo: string }[];
  /** Ya estaban en la cartera: no se vuelven a cargar. */
  repetidas: FilaPlantilla[];
};

/** Por qué el archivo no es la plantilla. null = sí lo es. */
export function errorDePlantilla(tipo: TipoPlantilla, hojas: string[], marca: string | null, cabecera: string[]): string | null {
  const otro: TipoPlantilla = tipo === "cobrar" ? "pagar" : "cobrar";
  const descargala = `Descarga la plantilla con «Descargar plantilla», copia ahí los datos y súbela.`;
  if (marca === MARCA[otro] || hojas.includes(HOJA[otro])) {
    return `Esta es la plantilla de ${HOJA[otro]}, no la de ${HOJA[tipo]}. Súbela en su pantalla.`;
  }
  if (!hojas.includes(HOJA[tipo]) || marca !== MARCA[tipo]) {
    return `Este archivo no es la plantilla de ${HOJA[tipo]} de Macedonia. Solo se admite esa plantilla. ${descargala}`;
  }
  const esperada = COLUMNAS[tipo];
  const tiene = cabecera.map((c) => c.trim());
  const distinta = esperada.findIndex((c, i) => tiene[i] !== c);
  if (distinta >= 0 || tiene.slice(esperada.length).some((c) => c)) {
    const i = distinta >= 0 ? distinta : esperada.length;
    return `Las columnas no son las de la plantilla: en la columna ${String.fromCharCode(65 + i)} debía decir «${esperada[i] ?? "(nada)"}» y dice «${tiene[i] ?? ""}». No cambies los títulos ni el orden. ${descargala}`;
  }
  return null;
}

/** Fecha en ISO. Acepta aaaa-mm-dd, dd/mm/aaaa, dd-mm-aaaa y el número de serie de Excel. */
export function aFechaPlantilla(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mes, a] = m;
    const iso = `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
    // El día tiene que existir en ese mes: «31/9» no existe. JavaScript la
    // corre sola al 1 de octubre y la base la rechaza al guardar.
    const f = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(f.getTime()) || f.getUTCDate() !== Number(d) || f.getUTCMonth() + 1 !== Number(mes) ? null : iso;
  }
  // Excel guarda las fechas como días desde el 30-12-1899.
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Math.floor(Number(t));
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Una fecha con un día de más para su mes («31/9/2026», «30/2/2026») pasa al
 * último día de ese mes. Para el vencimiento: el que lo escribió quiso decir
 * «fin de mes». Devuelve la fecha y si se corrigió. Lo demás, como aFechaPlantilla.
 */
export function fechaFinDeMes(v: string): { fecha: string | null; corregida: boolean } {
  const exacta = aFechaPlantilla(v);
  if (exacta) return { fecha: exacta, corregida: false };
  const m = v.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return { fecha: null, corregida: false };
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 29 || d > 31) return { fecha: null, corregida: false };
  const ultimo = new Date(Date.UTC(a, mes, 0)).getUTCDate();
  return { fecha: `${a}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`, corregida: true };
}

/** Cómo se reconoce una cuenta ya cargada: contraparte + documento, sin mayúsculas ni espacios de más. */
export const claveCuenta = (contraparte: string, documento: string) =>
  `${contraparte}|${documento}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9|]/g, "");

/**
 * Lee las filas de la hoja de la plantilla (la primera fila son los títulos).
 * `existentes` son las claves de lo que ya está en la cartera.
 */
export function leerPlantilla(filasHoja: string[][], existentes: Set<string>): LecturaPlantilla {
  const filas: FilaPlantilla[] = [];
  const problemas: LecturaPlantilla["problemas"] = [];
  const repetidas: FilaPlantilla[] = [];
  const vistas = new Set<string>();

  filasHoja.slice(1).forEach((c, i) => {
    const linea = i + 2;
    const celda = (k: number) => (c[k] ?? "").trim();
    if (!c.some((x) => (x ?? "").trim())) return; // fila en blanco
    const contraparte = celda(0), documento = celda(1);
    const emitida = aFechaPlantilla(celda(2)), vence = aFechaPlantilla(celda(3));
    const monto = aNumero(celda(4));
    if (!contraparte) return void problemas.push({ linea, motivo: "Falta la contraparte (columna A)." });
    if (!documento) return void problemas.push({ linea, motivo: "Falta el documento (columna B)." });
    if (!emitida) return void problemas.push({ linea, motivo: `Fecha de emisión inválida: «${celda(2)}».` });
    if (!vence) return void problemas.push({ linea, motivo: `Fecha de vencimiento inválida: «${celda(3)}».` });
    if (vence < emitida) return void problemas.push({ linea, motivo: "Vence antes de emitirse." });
    if (monto === null || !(monto > 0)) return void problemas.push({ linea, motivo: `Monto inválido: «${celda(4)}».` });
    const fila: FilaPlantilla = { contraparte, documento, emitida, vence, monto: aMonto(monto), nota: celda(5) };
    const clave = claveCuenta(contraparte, documento);
    if (vistas.has(clave)) return void problemas.push({ linea, motivo: `${documento} de ${contraparte} está dos veces en el archivo.` });
    vistas.add(clave);
    if (existentes.has(clave)) return void repetidas.push(fila);
    filas.push(fila);
  });
  if (!filas.length && !problemas.length && !repetidas.length) {
    problemas.push({ linea: 2, motivo: "La plantilla no tiene filas con datos." });
  }
  return { filas, problemas, repetidas };
}
