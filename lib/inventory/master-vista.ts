// El Master como tres preguntas (rediseño del 13-10-2026).
//
// El de antes mezclaba en una tabla y cuatro filtros tres cosas distintas: lo
// que falta contar, lo que dio diferencia al contar y lo que está mal cargado
// en Valery. Además ponía «0» en Contado cuando nadie había contado. Ahora:
//
//   1. ¿Qué hay que contar?   Productos con existencia que nunca se contaron
//      o cuyo último conteo es viejo. Primero los que más valen (existencia ×
//      costo, para quien ve costos); sin costo, por existencia.
//   2. ¿Qué falta o sobra?    Lo contado que no cuadra con el sistema, en
//      unidades y en dinero. Primero lo que más pesa.
//   3. ¿Qué está mal en Valery?  Existencia negativa: salió mercancía sin que
//      se registrara su entrada. Se corrige en Valery, no contando.
//   + Todo: el catálogo entero con su existencia (lo que era la pestaña Valery).
//
// Pura, para probarla: la pantalla le pasa las filas de master().

import type { FilaMaster } from "./conteos-db";

export type VistaMaster = "contar" | "diferencias" | "valery" | "todo";

/** Un conteo con más de estos días ya no dice cuánto hay hoy: vuelve a «por contar». */
export const DIAS_CONTEO_VIEJO = 30;

const dias = (iso: string, hoy: string) =>
  Math.round((new Date(`${hoy}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);

export type FilaVista = FilaMaster & {
  /** Días desde el último conteo (null = nunca contado). */
  hace: number | null;
  viejo: boolean;
  /** Existencia × costo (null sin costo o sin permiso). */
  valor: number | null;
  /** Diferencia en dinero (null si no hay conteo o no hay costo). */
  difValor: number | null;
};

export type ResumenMaster = {
  /** Productos con existencia en el sistema. */
  conExistencia: number;
  /** De esos, cuántos tienen un conteo vigente (no viejo). */
  verificados: number;
  porContar: number;
  diferencias: number;
  faltanteUnidades: number; sobranteUnidades: number;
  /** En dinero (null si la persona no ve costos). */
  faltante: number | null; sobrante: number | null;
  negativos: number;
  total: number;
  /** El valor del inventario con existencia y cuánto de ese valor está verificado. */
  valorTotal: number | null; valorVerificado: number | null;
  /** No hay existencia ni conteos: el sistema todavía no tiene el inventario cargado. */
  vacio: boolean;
  conCosto: boolean;
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function prepararMaster(filas: FilaMaster[], hoy: string): FilaVista[] {
  return filas.map((f) => {
    const hace = f.fechaConteo ? dias(f.fechaConteo, hoy) : null;
    const costo = f.costo;
    return {
      ...f,
      hace,
      viejo: hace !== null && hace > DIAS_CONTEO_VIEJO,
      valor: costo !== null && f.valery > 0 ? r4(f.valery * costo) : null,
      difValor: costo !== null && f.diferencia !== null ? r4(f.diferencia * costo) : null,
    };
  });
}

export const esPorContar = (f: FilaVista) => f.valery > 0 && (f.contado === null || f.viejo);
export const esDiferencia = (f: FilaVista) => f.diferencia !== null && Math.abs(f.diferencia) > 1e-9;
export const esNegativo = (f: FilaVista) => f.valery < 0;

export function resumirMaster(fs: FilaVista[]): ResumenMaster {
  const conCosto = fs.some((f) => f.costo !== null);
  const conEx = fs.filter((f) => f.valery > 0);
  const verif = conEx.filter((f) => f.contado !== null && !f.viejo);
  const difs = fs.filter(esDiferencia);
  const suma = (xs: number[]) => r4(xs.reduce((a, n) => a + n, 0));
  return {
    conExistencia: conEx.length,
    verificados: verif.length,
    porContar: fs.filter(esPorContar).length,
    diferencias: difs.length,
    faltanteUnidades: suma(difs.filter((f) => f.diferencia! < 0).map((f) => -f.diferencia!)),
    sobranteUnidades: suma(difs.filter((f) => f.diferencia! > 0).map((f) => f.diferencia!)),
    faltante: conCosto ? suma(difs.filter((f) => f.diferencia! < 0).map((f) => -(f.difValor ?? 0))) : null,
    sobrante: conCosto ? suma(difs.filter((f) => f.diferencia! > 0).map((f) => f.difValor ?? 0)) : null,
    negativos: fs.filter(esNegativo).length,
    total: fs.length,
    valorTotal: conCosto ? suma(conEx.map((f) => f.valor ?? 0)) : null,
    valorVerificado: conCosto ? suma(verif.map((f) => f.valor ?? 0)) : null,
    vacio: fs.length > 0 && fs.every((f) => f.valery === 0 && f.contado === null),
    conCosto,
  };
}

/** Las filas de una vista, en el orden que importa. */
export function filasDe(fs: FilaVista[], vista: VistaMaster, q = ""): FilaVista[] {
  const t = q.trim().toLowerCase();
  const busca = (f: FilaVista) => !t || f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t);
  const porNombre = (a: FilaVista, b: FilaVista) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true });
  const peso = (f: FilaVista) => f.valor ?? f.valery;
  const pesoDif = (f: FilaVista) => Math.abs(f.difValor ?? f.diferencia ?? 0);
  const entra: Record<VistaMaster, (f: FilaVista) => boolean> = {
    contar: esPorContar, diferencias: esDiferencia, valery: esNegativo, todo: () => true,
  };
  const orden: Record<VistaMaster, (a: FilaVista, b: FilaVista) => number> = {
    // Nunca contado antes que contado hace mucho; dentro, lo que más vale.
    contar: (a, b) => Number(a.contado !== null) - Number(b.contado !== null) || peso(b) - peso(a) || porNombre(a, b),
    diferencias: (a, b) => pesoDif(b) - pesoDif(a) || porNombre(a, b),
    valery: (a, b) => a.valery - b.valery || porNombre(a, b),
    todo: porNombre,
  };
  return fs.filter((f) => busca(f) && entra[vista](f)).sort(orden[vista]);
}

/** La vista con la que abre: lo que más urge. */
export function vistaInicial(r: ResumenMaster): VistaMaster {
  if (r.diferencias > 0) return "diferencias";
  if (r.porContar > 0) return "contar";
  if (r.negativos > 0) return "valery";
  return "todo";
}
