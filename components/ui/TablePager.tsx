"use client";

import { Icon } from "@/components/ui/Icon";
import { PAGE_SIZES } from "@/lib/ux/use-table-view";

export function TablePager({
  desde,
  hasta,
  total,
  page,
  pages,
  size,
  setPage,
  setSize,
  etiqueta = "resultados",
}: {
  desde: number;
  hasta: number;
  total: number;
  page: number;
  pages: number;
  size: number;
  setPage: (n: number) => void;
  setSize: (n: number) => void;
  etiqueta?: string;
}) {
  if (total === 0) return null;
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-lg border border-border text-text transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav
      aria-label="Paginación"
      className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
    >
      <p className="text-sm text-muted" aria-live="polite">
        <span className="font-medium text-text">{desde}–{hasta}</span> de{" "}
        <span className="font-medium text-text">{total}</span> {etiqueta}
      </p>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Por página
          <select
            aria-label="Filas por página"
            className="h-11 rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-text"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => setPage(0)} disabled={page === 0} aria-label="Primera página">
            <span aria-hidden="true">«</span>
          </button>
          <button type="button" className={btn} onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Página anterior">
            <span className="rotate-180" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
          </button>
          <span className="px-2 text-sm text-muted">
            {page + 1} / {pages}
          </span>
          <button type="button" className={btn} onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Página siguiente">
            <span aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
          </button>
          <button type="button" className={btn} onClick={() => setPage(pages - 1)} disabled={page >= pages - 1} aria-label="Última página">
            <span aria-hidden="true">»</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
