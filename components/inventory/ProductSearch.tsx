"use client";

// Buscador de productos del catálogo. Typeahead por código o nombre, navegable
// con teclado. Complementa al escáner: si no hay etiqueta, se busca a mano.
//
// Lee de la BASE (/api/inventory/search), no del JSON del código. Eso trae tres
// cosas que antes no hacían falta:
//
//   · espera antes de consultar, para no disparar una petición por tecla;
//   · descarta respuestas viejas, porque si "ele" tarda más que "electrodo" la
//     lista terminaría mostrando lo que se escribió antes;
//   · avisa cuando la base no responde, en vez de decir "sin resultados" — para
//     quien busca son cosas muy distintas.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";

export type ProductoCatalogo = {
  codigo: string;
  nombre: string;
  unidad: string | null;
  precio: number;
};

const ESPERA_MS = 220;

export function ProductSearch({
  onPick,
  placeholder = "Buscar producto por código o nombre…",
}: {
  onPick: (p: ProductoCatalogo) => void;
  placeholder?: string;
}) {
  const empresa = useEmpresaActiva();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<ProductoCatalogo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cada búsqueda lleva número. Solo la última manda: si llega tarde una
  // anterior, se descarta en vez de pisar la lista con resultados obsoletos.
  const turno = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResults([]);
      setFallo(null);
      setBuscando(false);
      return;
    }

    const mio = ++turno.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(texto)}&empresa=${empresa}`,
        );
        const j = await r.json();
        if (mio !== turno.current) return; // llegó tarde: ya hay una búsqueda más nueva
        if (!r.ok) {
          setFallo(j.error ?? "No se pudo buscar.");
          setResults([]);
        } else {
          setFallo(null);
          setResults(j.results ?? []);
          setIdx(0);
        }
      } catch {
        if (mio !== turno.current) return;
        setFallo("Sin conexión con el sistema.");
        setResults([]);
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    }, ESPERA_MS);

    return () => clearTimeout(t);
  }, [q, empresa]);

  function elegir(p: ProductoCatalogo) {
    onPick(p);
    setQ("");
    setOpen(false);
    setIdx(0);
    setResults([]);
    inputRef.current?.focus();
  }

  const mostrarLista = open && q.trim().length >= 2;

  return (
    <div className="relative">
      <label className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-muted">
          <Icon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
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
          aria-expanded={mostrarLista && results.length > 0}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-border-strong bg-surface-2 pl-9 pr-3 text-sm text-text"
        />
      </label>

      {mostrarLista && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          {fallo && (
            <li className="px-3 py-2.5 text-sm text-danger">
              {fallo} Vuelve a intentar en un momento.
            </li>
          )}
          {!fallo && buscando && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted">Buscando…</li>
          )}
          {!fallo && !buscando && results.length === 0 && (
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
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {p.precio > 0 ? `$${p.precio.toFixed(2)}` : "sin precio"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
