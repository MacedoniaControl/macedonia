// Leer TODAS las filas de una consulta.
//
// Supabase devuelve como maximo 1.000 filas por pedido y corta sin avisar: con
// 2.208 productos, `.range(0, 9999)` traia 1.000 y el resto no existia para la
// pantalla.
//
// Y pedir las paginas una detras de otra es lento en las vistas: `existencias`
// suma los 23.459 movimientos de nuevo en cada pagina. Por eso la primera
// pagina viene con el total de filas, y las demas se piden todas a la vez.
// Medido como tecnico (23-09-2026): 439 ms en serie, 219 ms en paralelo.

const TRAMO = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

/**
 * `armar(desde, hasta, contar)` arma la consulta de un tramo. Con `contar` en
 * true tiene que pedir el total (`{ count: "exact" }`); tiene que ordenar por
 * algo estable, o las paginas repiten y saltean filas.
 */
export async function todasLasFilas<T>(armar: (desde: number, hasta: number, contar: boolean) => Pagina<T>): Promise<T[]> {
  const primera = await armar(0, TRAMO - 1, true);
  if (primera.error) throw new Error(primera.error.message);
  const filas = primera.data ?? [];
  const total = primera.count ?? filas.length;
  if (filas.length >= total || filas.length < TRAMO) return filas;

  const resto = await Promise.all(
    Array.from({ length: Math.ceil((total - TRAMO) / TRAMO) }, (_, i) => armar((i + 1) * TRAMO, (i + 2) * TRAMO - 1, false)),
  );
  for (const r of resto) {
    if (r.error) throw new Error(r.error.message);
    filas.push(...(r.data ?? []));
  }
  return filas;
}
