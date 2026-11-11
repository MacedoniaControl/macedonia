// El Master: el inventario de Macedonia, con lo que dice Valery al lado.
//
// Pedido del usuario (11-11-2026): Inventario tenía cinco pestañas y el Master
// y «Contra Valery» contaban la misma historia por separado. Ahora es una sola
// vista. El inventario maestro es el de Macedonia (el kardex: lo que llega de
// Valery más los conteos de Macedonia); Valery se muestra al lado para ver
// dónde no coinciden. Tres preguntas, cada una con su número y su lista:
//
//   1. ¿Qué hay que contar?        Con existencia y sin un conteo de los últimos
//      30 días. Primero lo que más vale.
//   2. ¿Qué no cuadra con Valery?  La existencia de Macedonia contra la última
//      lectura de Valery (Owner y Administrador). Si la diferencia es lo que
//      ajustaron los conteos de Macedonia, está explicada: se dice.
//   3. ¿Qué está en negativo?      Salió mercancía sin que entrara: falta
//      registrar una entrada o contar.
//   + Todo: el catálogo entero.
//
// Antes había «¿Qué falta o sobra?»: el último conteo contra la existencia de
// HOY. Desde que cerrar un conteo ajusta el inventario (migración 46), esa
// resta solo mostraba lo que se vendió después de contar, como si faltara. Lo
// que se contó sigue en la columna «Último conteo» y en el historial de Conteo.
//
// Pura, para probarla: la pantalla le pasa las filas de master() y la
// comparación con Valery (lib/inventory/comparar-valery.ts).

import type { FilaMaster } from "./conteos-db";
import type { Comparacion } from "./comparar-valery.ts";

export type VistaMaster = "contar" | "valery" | "negativo" | "todo";

/** Un conteo con más de estos días ya no dice cuánto hay hoy: vuelve a «por contar». */
export const DIAS_CONTEO_VIEJO = 30;
const MARGEN = 0.005;

const dias = (iso: string, hoy: string) =>
  Math.round((new Date(`${hoy}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);

export type FilaVista = Omit<FilaMaster, "valery" | "diferencia"> & {
  /** La existencia de Macedonia: el inventario maestro. */
  existencia: number;
  /** Días desde el último conteo (null = nunca contado). */
  hace: number | null;
  viejo: boolean;
  /** Existencia × costo (null sin costo o sin permiso). */
  valor: number | null;
  /** Lo que dice Valery en su última lectura. Null: sin lectura, o el código no está en Valery. */
  enValery: number | null;
  /** Macedonia menos Valery (null sin lectura). */
  difValery: number | null;
  /** Lo que movieron los conteos de Macedonia desde el corte (null sin lectura). */
  conteos: number | null;
  /** La diferencia con Valery que no explican los conteos (null sin lectura). */
  sinExplicar: number | null;
  /** La diferencia con Valery es lo que movieron los conteos de Macedonia desde el corte. */
  porConteo: boolean;
};

export type ResumenMaster = {
  /** Productos con existencia. */
  conExistencia: number;
  /** De esos, cuántos tienen un conteo vigente (no viejo). */
  verificados: number;
  porContar: number;
  /** Hay lectura de Valery para comparar. */
  conValery: boolean;
  /** No coinciden con Valery, y de esas cuántas las explican los conteos de Macedonia. */
  distintas: number;
  porConteo: number;
  negativos: number;
  total: number;
  /** El valor del inventario con existencia y cuánto de ese valor está verificado. */
  valorTotal: number | null; valorVerificado: number | null;
  /** No hay existencia ni conteos: el inventario todavía no está cargado. */
  vacio: boolean;
  conCosto: boolean;
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Las filas del Master con lo que dice Valery. Los códigos se juntan tal cual
 * (las mayúsculas cuentan, como en Valery). Un producto que Valery tiene y el
 * catálogo de Macedonia no, entra igual: es una diferencia.
 */
export function prepararMaster(filas: FilaMaster[], hoy: string, comparacion: Comparacion | null = null): FilaVista[] {
  const deValery = new Map((comparacion?.filas ?? []).map((c) => [c.codigo, c]));
  const vistas = filas.map((f): FilaVista => {
    const hace = f.fechaConteo ? dias(f.fechaConteo, hoy) : null;
    const c = deValery.get(f.codigo);
    const existencia = f.valery;
    return {
      codigo: f.codigo, nombre: f.nombre, unidad: f.unidad, costo: f.costo, contado: f.contado, fechaConteo: f.fechaConteo, zona: f.zona,
      existencia,
      hace,
      viejo: hace !== null && hace > DIAS_CONTEO_VIEJO,
      valor: f.costo !== null && existencia > 0 ? r4(existencia * f.costo) : null,
      enValery: comparacion ? (c ? c.valery : null) : null,
      // Sin la fila en la comparación es que los dos están en cero.
      difValery: comparacion ? (c ? c.diferencia : 0) : null,
      conteos: comparacion ? (c ? c.conteos : 0) : null,
      sinExplicar: comparacion ? (c ? c.sinExplicar : 0) : null,
      porConteo: !!c && Math.abs(c.diferencia) >= MARGEN && Math.abs(c.sinExplicar) < MARGEN,
    };
  });
  const enCatalogo = new Set(filas.map((f) => f.codigo));
  for (const c of comparacion?.filas ?? []) {
    if (enCatalogo.has(c.codigo)) continue;
    vistas.push({
      codigo: c.codigo, nombre: c.nombre, unidad: "", costo: null, contado: null, fechaConteo: null, zona: null,
      existencia: c.macedonia, hace: null, viejo: false, valor: null, enValery: c.valery, difValery: c.diferencia,
      conteos: c.conteos, sinExplicar: c.sinExplicar,
      porConteo: Math.abs(c.diferencia) >= MARGEN && Math.abs(c.sinExplicar) < MARGEN,
    });
  }
  return vistas;
}

export const esPorContar = (f: FilaVista) => f.existencia > 0 && (f.contado === null || f.viejo);
export const esDistintaDeValery = (f: FilaVista) => f.difValery !== null && Math.abs(f.difValery) >= MARGEN;
export const esNegativo = (f: FilaVista) => f.existencia < 0;

export function resumirMaster(fs: FilaVista[]): ResumenMaster {
  const conCosto = fs.some((f) => f.costo !== null);
  const conEx = fs.filter((f) => f.existencia > 0);
  const verif = conEx.filter((f) => f.contado !== null && !f.viejo);
  const distintas = fs.filter(esDistintaDeValery);
  const suma = (xs: number[]) => r4(xs.reduce((a, n) => a + n, 0));
  return {
    conExistencia: conEx.length,
    verificados: verif.length,
    porContar: fs.filter(esPorContar).length,
    conValery: fs.some((f) => f.difValery !== null),
    distintas: distintas.length,
    porConteo: distintas.filter((f) => f.porConteo).length,
    negativos: fs.filter(esNegativo).length,
    total: fs.length,
    valorTotal: conCosto ? suma(conEx.map((f) => f.valor ?? 0)) : null,
    valorVerificado: conCosto ? suma(verif.map((f) => f.valor ?? 0)) : null,
    vacio: fs.length > 0 && fs.every((f) => f.existencia === 0 && f.contado === null && f.enValery === null),
    conCosto,
  };
}

/** Las filas de una vista, en el orden que importa. */
export function filasDe(fs: FilaVista[], vista: VistaMaster, q = ""): FilaVista[] {
  const t = q.trim().toLowerCase();
  const busca = (f: FilaVista) => !t || f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t);
  const porNombre = (a: FilaVista, b: FilaVista) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true });
  const peso = (f: FilaVista) => f.valor ?? f.existencia;
  const entra: Record<VistaMaster, (f: FilaVista) => boolean> = {
    contar: esPorContar, valery: esDistintaDeValery, negativo: esNegativo, todo: () => true,
  };
  const orden: Record<VistaMaster, (a: FilaVista, b: FilaVista) => number> = {
    // Nunca contado antes que contado hace mucho; dentro, lo que más vale.
    contar: (a, b) => Number(a.contado !== null) - Number(b.contado !== null) || peso(b) - peso(a) || porNombre(a, b),
    // Lo que no explica nada primero; dentro, la diferencia más grande.
    valery: (a, b) => Number(a.porConteo) - Number(b.porConteo) || Math.abs(b.difValery ?? 0) - Math.abs(a.difValery ?? 0) || porNombre(a, b),
    negativo: (a, b) => a.existencia - b.existencia || porNombre(a, b),
    todo: porNombre,
  };
  return fs.filter((f) => busca(f) && entra[vista](f)).sort(orden[vista]);
}

/** La vista con la que abre: lo que más urge. */
export function vistaInicial(r: ResumenMaster): VistaMaster {
  if (r.porContar > 0) return "contar";
  if (r.distintas - r.porConteo > 0) return "valery";
  if (r.negativos > 0) return "negativo";
  return "todo";
}
