// Qué gas del parque es un producto de la nota de entrega.
//
// La nota tiene dos partes que antes no se hablaban: los renglones (lo que se
// cobra) y la sección Cilindros (lo que sale del parque). Si el vendedor
// agregaba «OXIGENO GASEOSO» como renglón y no tocaba Cilindros, el parque no
// se enteraba de que salió un lleno. Ahora un renglón de gas llena solo los
// LLENOS de su gas; los vacíos que trae el cliente se cargan a mano (decisión
// de la empresa, 02-10-2026).
//
// Es un gas el producto cuyo nombre EMPIEZA por el gas («OXIGENO GASEOSO»,
// «ARGON CIL 6 M3», «ACETILENO 2KG»). Así no entran los accesorios
// («REGULADOR D/OXIGENO», «PICO CORTE ACETILENO»), ni la venta del casco
// («CILINDRO DE OXIGENO»), ni lo que no va en cilindro (nitrógeno líquido, o
// un producto con unidad que no sea cilindro: el oxígeno por m³).

export type ProductoGas = { codigo?: string; descripcion: string; unidad?: string | null; cantidad: number };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Unidades con las que el renglón son cilindros. Sin unidad también vale: el
 * catálogo de Sudematin no la tiene todavía y el editor de renglones le pone
 * «UNIDAD» a lo que viene sin ella.
 */
const ES_CILINDRO = new Set(["", "UNIDAD", "CILINDRO", "CILINDROS", "CIL"]);

/** El gas del parque (de la lista de la empresa) que es este producto, o null. */
export function gasDeProducto(p: Pick<ProductoGas, "descripcion" | "unidad">, gases: string[]): string | null {
  const n = norm(p.descripcion);
  if (!ES_CILINDRO.has(norm(p.unidad ?? "")) || /LIQUIDO/.test(n)) return null;
  const hay = new Set(gases.map(norm));
  const si = (g: string) => (hay.has(g) ? gases.find((x) => norm(x) === g)! : null);

  if (n.startsWith("ACETILENO")) {
    const kg = n.match(/\b(\d+)\s*K(?:G|GS)?\b/)?.[1];
    return (kg && si(`ACETILENO ${kg}K`)) || si("ACETILENO");
  }
  if (n.startsWith("ARGOMIX")) return si("ARGOMIX");
  if (n.startsWith("ARGON")) return (/\bUAP\b/.test(n) && si("UAP")) || si("ARGON");
  if (n.startsWith("CO2") || n.startsWith("DIOXIDO DE CARBONO")) return si("CO2");
  for (const g of ["OXIGENO", "NITROGENO"]) if (n.startsWith(g)) return si(g);
  return null;
}

/** Los llenos que salen por los renglones de la nota, por gas. */
export function llenosDeRenglones(lineas: ProductoGas[], gases: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lineas) {
    const g = gasDeProducto(l, gases);
    const n = Math.round(l.cantidad);
    if (g && n > 0) r[g] = (r[g] ?? 0) + n;
  }
  return r;
}
