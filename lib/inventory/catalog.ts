// Catálogo de productos indexado por código de Valery, POR EMPRESA.
// Cada empresa tiene su propio export de Valery: el catálogo nunca se comparte,
// o el escáner y el buscador de una empresa encontrarían productos de la otra.
// Hoy resuelve contra los seeds en memoria (lib/ux/inventory-data.ts);
// mañana se cambia el CUERPO por una consulta a la DB sin tocar la FIRMA.
// Ver docs/decisions/inventory-model.md.
import { fisicoDe, fisicoMeta, type FisicoItem } from "@/lib/ux/inventory-data";

export type InventoryProduct = FisicoItem;

export function catalogMeta(empresa: string) {
  const m = fisicoMeta(empresa);
  return { ...m, total: fisicoDe(empresa).length };
}

type Indice = {
  /** Índice exacto: el código tal cual lo maneja Valery. */
  exact: Map<string, InventoryProduct>;
  /**
   * Índice tolerante a mayúsculas/minúsculas.
   * OJO: Valery tiene códigos que solo difieren en capitalización y son productos
   * DISTINTOS (ej. "6X8AT" vs "6x8AT"). Por eso guarda listas: el fallback solo
   * resuelve cuando hay un único candidato, nunca adivina entre ambiguos.
   */
  loose: Map<string, InventoryProduct[]>;
};

const indices = new Map<string, Indice>();

function indiceDe(empresa: string): Indice {
  const cache = indices.get(empresa);
  if (cache) return cache;

  const exact = new Map<string, InventoryProduct>();
  const loose = new Map<string, InventoryProduct[]>();
  for (const item of fisicoDe(empresa)) {
    const codigo = item.codigo.trim();
    exact.set(codigo, item);
    const key = codigo.toUpperCase();
    const list = loose.get(key);
    if (list) list.push(item);
    else loose.set(key, [item]);
  }

  const idx = { exact, loose };
  indices.set(empresa, idx);
  return idx;
}

/**
 * Busca un producto por código de Valery, dentro del catálogo de una empresa.
 * Tolera espacios sobrantes y diferencias de capitalización, salvo cuando la
 * capitalización distingue dos productos reales (entonces exige match exacto).
 */
export function lookupByCodigo(codigo: string, empresa: string): InventoryProduct | null {
  const c = codigo.trim();
  if (!c) return null;
  const { exact, loose } = indiceDe(empresa);
  const hit = exact.get(c);
  if (hit) return hit;
  const candidatos = loose.get(c.toUpperCase());
  return candidatos && candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * Búsqueda para el buscador de productos (typeahead): por código o por nombre.
 * Prioriza: código exacto → código que empieza igual → nombre que empieza igual → contiene.
 */
export function searchProductos(query: string, empresa: string, limit = 8): InventoryProduct[] {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  const res: { item: InventoryProduct; score: number }[] = [];
  for (const item of fisicoDe(empresa)) {
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
