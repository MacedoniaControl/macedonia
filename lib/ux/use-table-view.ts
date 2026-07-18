"use client";

// Orden + paginación reutilizable para tablas de datos.
// Nace de un problema real: el inventario mostraba 100 de 1703 filas sin forma
// de llegar al resto. Ver docs/decisions/inventory-model.md.

import { useEffect, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
/** Cómo extraer el valor ordenable de cada columna. */
export type Accessors<T> = Record<string, (row: T) => string | number>;

export const PAGE_SIZES = [25, 50, 100, 250];

export function useTableView<T>(rows: T[], accessors: Accessors<T>, initialSize = 50) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);

  const sorted = useMemo(() => {
    if (!sortKey || !accessors[sortKey]) return rows;
    const get = accessors[sortKey];
    // copia: no mutar el array de origen
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
      const sa = String(va);
      const sb = String(vb);
      return dir === "asc" ? sa.localeCompare(sb, "es") : sb.localeCompare(sa, "es");
    });
  }, [rows, sortKey, dir, accessors]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / size));
  // si cambian filtros/tamaño y la página actual ya no existe, volver al inicio
  const safePage = Math.min(page, pages - 1);
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [page, pages]);

  const start = safePage * size;
  const visible = useMemo(() => sorted.slice(start, start + size), [sorted, start, size]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir("asc");
    }
    setPage(0);
  }

  /** Valor para aria-sort en el <th>. */
  function ariaSort(key: string): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return dir === "asc" ? "ascending" : "descending";
  }

  return {
    visible,
    total,
    page: safePage,
    pages,
    size,
    setSize: (n: number) => {
      setSize(n);
      setPage(0);
    },
    setPage,
    sortKey,
    dir,
    toggleSort,
    ariaSort,
    desde: total === 0 ? 0 : start + 1,
    hasta: Math.min(start + size, total),
  };
}
