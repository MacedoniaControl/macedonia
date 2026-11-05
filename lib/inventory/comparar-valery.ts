// Inventario: lo que dice Macedonia contra lo que dice Valery (la parte pura).
//
// Pedido del Owner (2026-11-05): «compara y después cierra la brecha». Valery
// es la fuente: el agente trae su existencia por depósito y aquí se compara,
// producto por producto, con la del kardex de Macedonia. Nunca se copia un
// número encima del otro: la diferencia se explica.
//
// Lo único que Macedonia mueve por su cuenta son los conteos físicos (los
// ajustes «manual» desde el corte): una diferencia del mismo tamaño que esos
// ajustes está explicada. Lo demás queda «sin explicar» y es lo que hay que
// mirar (o contar).
//
// Los códigos distinguen mayúsculas, como en Valery: «6X8AT» y «6x8AT» son
// productos distintos y nunca se juntan.

export type ExistenciaMacedonia = { codigo: string; existencia: number };
export type ExistenciaValery = { codigo: string; nombre?: string | null; existencia: number };
/** Un ajuste de Macedonia, con signo (+ entró, − salió). */
export type AjusteMacedonia = { codigo: string; cantidad: number };

export type FilaComparacion = {
  codigo: string;
  nombre: string;
  macedonia: number;
  /** Null: Valery no tiene ese código en ningún depósito. */
  valery: number | null;
  /** Macedonia menos Valery. */
  diferencia: number;
  /** Lo que movieron los conteos de Macedonia desde el corte. */
  conteos: number;
  /** La diferencia que no explican los conteos. */
  sinExplicar: number;
};

export type Comparacion = {
  filas: FilaComparacion[];
  /** Productos que están en alguno de los dos con existencia. */
  productos: number;
  coinciden: number;
  distintas: number;
  /** Distintas, pero del mismo tamaño que los conteos de Macedonia. */
  porConteo: number;
  /** Con existencia en Macedonia y sin el código en Valery. */
  noEnValery: number;
};

/** Margen: el kardex guarda 3 decimales y Valery más. */
export const MARGEN = 0.005;
const cero = (n: number) => Math.abs(n) < MARGEN;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function compararConValery(
  macedonia: ExistenciaMacedonia[], valery: ExistenciaValery[], nombres: Map<string, string>, ajustes: AjusteMacedonia[] = [],
): Comparacion {
  const sumar = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const mac = new Map<string, number>();
  for (const e of macedonia) sumar(mac, e.codigo, Number(e.existencia) || 0);
  // Un código puede estar en varios depósitos de Valery: se suman.
  const val = new Map<string, number>();
  const nombreValery = new Map<string, string>();
  for (const e of valery) {
    sumar(val, e.codigo, Number(e.existencia) || 0);
    if (e.nombre && !nombreValery.has(e.codigo)) nombreValery.set(e.codigo, e.nombre);
  }
  const con = new Map<string, number>();
  for (const a of ajustes) sumar(con, a.codigo, Number(a.cantidad) || 0);

  const filas: FilaComparacion[] = [];
  let coinciden = 0, distintas = 0, porConteo = 0, noEnValery = 0;
  for (const codigo of new Set([...mac.keys(), ...val.keys()])) {
    const m = mac.get(codigo) ?? 0;
    const v = val.has(codigo) ? val.get(codigo)! : null;
    // Ni aquí ni allá hay nada: no es un producto que comparar.
    if (cero(m) && (v === null || cero(v))) continue;
    const diferencia = r3(m - (v ?? 0));
    const conteos = r3(con.get(codigo) ?? 0);
    const sinExplicar = r3(diferencia - conteos);
    if (v === null) noEnValery++;
    if (cero(diferencia)) coinciden++;
    else {
      distintas++;
      if (cero(sinExplicar)) porConteo++;
    }
    filas.push({ codigo, nombre: nombres.get(codigo) ?? nombreValery.get(codigo) ?? codigo, macedonia: r3(m), valery: v === null ? null : r3(v), diferencia, conteos, sinExplicar });
  }
  return { filas, productos: filas.length, coinciden, distintas, porConteo, noEnValery };
}
