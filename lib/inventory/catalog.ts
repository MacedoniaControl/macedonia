// Catálogo de productos indexado por código de Valery.
// Hoy resuelve contra el seed en memoria (lib/ux/inventory-fisico-seed.json);
// mañana se cambia el CUERPO por una consulta a la DB sin tocar la FIRMA.
// Ver docs/decisions/inventory-model.md.
import seed from "@/lib/ux/inventory-fisico-seed.json";

export type InventoryProduct = {
  codigo: string;
  nombre: string;
  undPpal: string;
  existPpal: number;
  undAlt: string;
  existAlt: number;
};

type Seed = { fuente: string; fecha: string; items: InventoryProduct[] };
const SEED = seed as Seed;

export const CATALOG_META = { fuente: SEED.fuente, fecha: SEED.fecha, total: SEED.items.length };

/** Índice exacto: el código tal cual lo maneja Valery. */
const exact = new Map<string, InventoryProduct>();
/**
 * Índice tolerante a mayúsculas/minúsculas.
 * OJO: Valery tiene códigos que solo difieren en capitalización y son productos
 * DISTINTOS (ej. "6X8AT" vs "6x8AT"). Por eso guarda listas: el fallback solo
 * resuelve cuando hay un único candidato, nunca adivina entre ambiguos.
 */
const loose = new Map<string, InventoryProduct[]>();

for (const item of SEED.items) {
  const codigo = item.codigo.trim();
  exact.set(codigo, item);
  const key = codigo.toUpperCase();
  const list = loose.get(key);
  if (list) list.push(item);
  else loose.set(key, [item]);
}

/**
 * Busca un producto por código de Valery.
 * Tolera espacios sobrantes y diferencias de capitalización, salvo cuando la
 * capitalización distingue dos productos reales (entonces exige match exacto).
 */
export function lookupByCodigo(codigo: string): InventoryProduct | null {
  const c = codigo.trim();
  if (!c) return null;
  const hit = exact.get(c);
  if (hit) return hit;
  const candidatos = loose.get(c.toUpperCase());
  return candidatos && candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * Búsqueda para el buscador de productos (typeahead): por código o por nombre.
 * Prioriza: código exacto → código que empieza igual → nombre que empieza igual → contiene.
 */
export function searchProductos(query: string, limit = 8): InventoryProduct[] {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  const res: { item: InventoryProduct; score: number }[] = [];
  for (const item of SEED.items) {
    const cod = item.codigo.toUpperCase();
    const nom = item.nombre.toUpperCase();
    let score = -1;
    if (cod === q) score = 0;
    else if (cod.startsWith(q)) score = 1;
    else if (nom.startsWith(q)) score = 2;
    else if (cod.includes(q)) score = 3;
    else if (nom.includes(q)) score = 4;
    if (score >= 0) res.push({ item, score });
  }
  return res
    .sort((a, b) => a.score - b.score || b.item.existPpal - a.item.existPpal)
    .slice(0, limit)
    .map((r) => r.item);
}
