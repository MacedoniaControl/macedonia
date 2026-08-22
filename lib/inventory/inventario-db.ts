"use server";

// Inventario leído de la base: catálogo (tabla `productos`) más existencia
// calculada del kardex (vista `existencias`).
//
// Sustituye a `fisicoDe()`, que leía un JSON del código. Diferencia importante:
// ese JSON traía la existencia congelada del día del export de Valery; aquí la
// existencia sale de los movimientos y cambia sola cuando alguien registra uno.

import { createClient } from "@/lib/supabase/server";

export type ItemInventario = {
  codigo: string;
  nombre: string;
  undPpal: string;
  existPpal: number;
  undAlt: string;
  existAlt: number;
  precio: number;
};

/**
 * Catálogo de una empresa con su existencia actual.
 *
 * Nunca pide `costo_unitario`: esa columna está vetada por permiso y pedirla
 * haría fallar la consulta ENTERA para un vendedor — se caería el inventario
 * completo, no solo el costo.
 */
export async function inventarioDe(empresa: string): Promise<ItemInventario[]> {
  const sb = await createClient();

  type FilaProd = { codigo: string; nombre: string; unidad: string | null; unidad_alt: string | null; precio_unitario: number };
  type FilaExis = { codigo: string; existencia: number };

  // ⚠️ Supabase corta las consultas en 1.000 filas POR DEFECTO y NO avisa: de
  // 1.704 productos devuelve 1.000 y el resto simplemente deja de existir para
  // la aplicación. Hay que pedir por tramos explícitos hasta que se acabe.
  const TRAMO = 1000;

  const todo = async <T>(tabla: string, columnas: string): Promise<T[]> => {
    const acumulado: T[] = [];
    for (let desde = 0; ; desde += TRAMO) {
      const { data, error } = await sb
        .from(tabla)
        .select(columnas)
        .eq("empresa_id", empresa)
        .order("codigo")
        .range(desde, desde + TRAMO - 1);

      if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
      const lote = (data as T[] | null) ?? [];
      acumulado.push(...lote);
      if (lote.length < TRAMO) return acumulado;   // último tramo
    }
  };

  const [filasProd, filasExis] = await Promise.all([
    todo<FilaProd>("productos", "codigo, nombre, unidad, unidad_alt, precio_unitario"),
    todo<FilaExis>("existencias", "codigo, existencia"),
  ]);

  const porCodigo = new Map(filasExis.map((e) => [e.codigo, Number(e.existencia) || 0]));

  return filasProd.map((p) => ({
    codigo: p.codigo,
    nombre: p.nombre,
    undPpal: p.unidad ?? "",
    // Sin movimientos, la existencia es 0. No es un dato faltante: es que
    // todavía no entró ni salió nada de ese código.
    existPpal: porCodigo.get(p.codigo) ?? 0,
    undAlt: p.unidad_alt ?? "",
    existAlt: 0,
    precio: Number(p.precio_unitario) || 0,
  }));
}

/** Cuántos productos y cuántos con movimientos. Para la cabecera de la pantalla. */
export async function resumenInventario(
  empresa: string,
): Promise<{ productos: number; conMovimientos: number }> {
  const sb = await createClient();

  const [p, e] = await Promise.all([
    sb.from("productos").select("codigo", { count: "exact", head: true }).eq("empresa_id", empresa),
    sb.from("existencias").select("codigo", { count: "exact", head: true }).eq("empresa_id", empresa),
  ]);

  return { productos: p.count ?? 0, conMovimientos: e.count ?? 0 };
}
