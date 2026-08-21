// Catálogo de productos leído de Supabase. Reemplaza al que leía el JSON en el
// código (lib/inventory/catalog.ts), que se mantiene como respaldo mientras dure
// la migración.
//
// SOLO SERVIDOR. El costo de compra está vetado por permiso de columna, así que
// aquí NUNCA se pide `costo_unitario`: pedirlo haría fallar la consulta entera
// para un vendedor, y con ella la búsqueda de productos.
//
// Las firmas conservan la forma de las originales (código + empresa) pero ahora
// devuelven promesas: leer de una base es una operación de red y fingir que es
// instantánea solo esconde los fallos.

import { createClient } from "@/lib/supabase/server";

export type ProductoDb = {
  codigo: string;
  nombre: string;
  unidad: string | null;
  precio: number;
};

/** Columnas seguras: todas menos costo_unitario. */
const COLUMNAS = "codigo, nombre, unidad, precio_unitario";

type Fila = { codigo: string; nombre: string; unidad: string | null; precio_unitario: number };

const aProducto = (f: Fila): ProductoDb => ({
  codigo: f.codigo,
  nombre: f.nombre,
  unidad: f.unidad,
  precio: Number(f.precio_unitario) || 0,
});

/**
 * Busca un producto por su código exacto de Valery.
 *
 * OJO: la comparación es SENSIBLE A MAYÚSCULAS a propósito. En Valery hay
 * códigos que solo difieren en capitalización y son productos DISTINTOS:
 * `6x8AT` es "ENCERADOS 6X8 AT" y `6X8AT` es "ENCERADO 6X8 AT". Buscar sin
 * distinguir devolvería uno de los dos al azar, y el error saldría recién
 * cuando el despacho llegara equivocado al cliente.
 */
export async function buscarPorCodigo(
  codigo: string,
  empresa: string,
): Promise<ProductoDb | null> {
  const c = codigo.trim();
  if (!c) return null;

  const sb = await createClient();
  const { data, error } = await sb
    .from("productos")
    .select(COLUMNAS)
    .eq("empresa_id", empresa)
    .eq("codigo", c)
    .maybeSingle();

  if (error) throw new Error(`No se pudo consultar el catálogo: ${error.message}`);
  return data ? aProducto(data as Fila) : null;
}

/**
 * Búsqueda para el typeahead: por código o por nombre.
 *
 * Aquí SÍ es insensible a mayúsculas: quien escribe a mano no sabe la
 * capitalización exacta, y ve la lista de resultados antes de elegir. La
 * distinción estricta importa cuando el sistema elige solo (el escáner), no
 * cuando elige una persona mirando.
 */
export async function buscarProductos(
  consulta: string,
  empresa: string,
  limite = 8,
): Promise<ProductoDb[]> {
  const q = consulta.trim();
  if (q.length < 2) return [];

  const sb = await createClient();
  // `or` con ilike: coincide por código o por nombre en una sola consulta.
  const patron = `%${q.replace(/[%_]/g, "")}%`;
  const { data, error } = await sb
    .from("productos")
    .select(COLUMNAS)
    .eq("empresa_id", empresa)
    .or(`codigo.ilike.${patron},nombre.ilike.${patron}`)
    .limit(limite);

  if (error) throw new Error(`No se pudo buscar en el catálogo: ${error.message}`);
  return (data as Fila[] | null)?.map(aProducto) ?? [];
}

/** Cuántos productos tiene una empresa. Para mostrar el total en pantalla. */
export async function contarProductos(empresa: string): Promise<number> {
  const sb = await createClient();
  const { count, error } = await sb
    .from("productos")
    .select("codigo", { count: "exact", head: true })
    .eq("empresa_id", empresa);

  if (error) throw new Error(`No se pudo contar el catálogo: ${error.message}`);
  return count ?? 0;
}
