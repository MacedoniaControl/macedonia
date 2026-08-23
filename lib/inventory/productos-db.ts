"use server";

// Catálogo de productos para la pantalla de Productos.
//
// El COSTO va aparte, y a propósito: la columna `costo_unitario` está vetada por
// permiso, así que pedirla junto con el resto haría fallar la consulta ENTERA
// para un vendedor — se caería la lista completa, no solo el costo.
//
// Se pide por separado con costos_productos(), que verifica el rol dentro de la
// base. Si la persona no puede, devuelve vacío y la pantalla muestra la lista
// sin la columna de costo, en vez de romperse.

import { createClient } from "@/lib/supabase/server";

export type ProductoLista = {
  codigo: string;
  nombre: string;
  unidad: string | null;
  precio: number;
  /** null = esta persona no puede ver costos. */
  costo: number | null;
};

const TRAMO = 1000;

export async function listarProductos(empresa: string): Promise<ProductoLista[]> {
  const sb = await createClient();

  type FilaProd = { codigo: string; nombre: string; unidad: string | null; precio_unitario: number };

  // Supabase corta en 1.000 filas y no avisa: hay que pedir por tramos.
  const productos: FilaProd[] = [];
  for (let desde = 0; ; desde += TRAMO) {
    const { data, error } = await sb
      .from("productos")
      .select("codigo, nombre, unidad, precio_unitario")
      .eq("empresa_id", empresa)
      .order("codigo")
      .range(desde, desde + TRAMO - 1);

    if (error) throw new Error(`No se pudo leer el catálogo: ${error.message}`);
    const lote = (data as FilaProd[] | null) ?? [];
    productos.push(...lote);
    if (lote.length < TRAMO) break;
  }

  // El costo solo si la persona puede. Un error aquí NO tumba la lista.
  let costos = new Map<string, number>();
  try {
    const { data } = await sb.rpc("costos_productos", { e: empresa });
    const filas = (data as { codigo: string; costo: number }[] | null) ?? [];
    costos = new Map(filas.map((c) => [c.codigo, Number(c.costo) || 0]));
  } catch {
    // Sin permiso de costos: la lista se muestra igual, sin esa columna.
  }

  return productos.map((p) => ({
    codigo: p.codigo,
    nombre: p.nombre,
    unidad: p.unidad,
    precio: Number(p.precio_unitario) || 0,
    costo: costos.has(p.codigo) ? (costos.get(p.codigo) as number) : null,
  }));
}

/** ¿Esta persona puede ver costos? Para decidir si se muestra la columna. */
export async function puedeVerCostos(empresa: string): Promise<boolean> {
  const sb = await createClient();
  const { data } = await sb.rpc("costos_productos", { e: empresa });
  return Array.isArray(data) && data.length > 0;
}
