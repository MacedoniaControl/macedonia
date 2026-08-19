"use client";

// Buscador de productos del catálogo (inventario Valery). Typeahead por código o nombre,
// navegable con teclado. Complementa al escáner: si no hay etiqueta, se busca a mano.

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { searchProductos, type InventoryProduct } from "@/lib/inventory/catalog";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";

export function ProductSearch({
  onPick,
  placeholder = "Buscar producto por código o nombre…",
}: {
  onPick: (p: InventoryProduct) => void;
  placeholder?: string;
}) {
  const empresa = useEmpresaActiva();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchProductos(q, empresa, 8), [q, empresa]);

  function elegir(p: InventoryProduct) {
    onPick(p);
    setQ("");
    setOpen(false);
    setIdx(0);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <label className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); elegir(results[idx]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          aria-label="Buscar producto en el catálogo"
          aria-expanded={open && results.length > 0}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-border-strong bg-surface-2 pl-9 pr-3 text-sm text-text"
        />
      </label>

      {open && q.trim().length >= 2 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          {results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted">Sin resultados en el catálogo.</li>
          )}
          {results.map((p, i) => (
            <li key={p.codigo}>
              <button
                type="button"
                role="option"
                aria-selected={i === idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p)}
                onMouseEnter={() => setIdx(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === idx ? "bg-surface-2" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text">{p.nombre}</span>
                  <span className="font-mono text-[11px] text-muted">{p.codigo}</span>
                </span>
                <span className={`shrink-0 text-xs ${p.existPpal <= 0 ? "text-danger" : "text-muted"}`}>
                  {p.existPpal} {p.undPpal}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
