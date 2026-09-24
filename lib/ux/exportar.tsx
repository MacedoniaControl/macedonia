"use client";

// Que tabla descarga el boton "Descargar" del inventario.
//
// Cada pestaña (Master, Conteo, Movimientos…) declara con useExportable como
// armar SU tabla, con lo que tiene en pantalla. El boton, que vive arriba en
// la cabecera, le pide la tabla a la pestaña que este montada al tocarlo.
//
// Se guarda una funcion, no la tabla: armar 23.000 filas en cada render para
// un boton que casi nunca se toca seria trabajo tirado.

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { TablaExport } from "./tabla-export";

type Armar = () => TablaExport | null;
type Registro = { poner: (f: Armar) => void; quitar: (f: Armar) => void; armar: () => TablaExport | null };

const Ctx = createContext<Registro | null>(null);

export function ProveedorExportar({ children }: { children: ReactNode }) {
  const actual = useRef<Armar | null>(null);
  const registro = useMemo<Registro>(() => ({
    poner: (f) => { actual.current = f; },
    quitar: (f) => { if (actual.current === f) actual.current = null; },
    armar: () => actual.current?.() ?? null,
  }), []);
  return <Ctx.Provider value={registro}>{children}</Ctx.Provider>;
}

/** El registro, para el boton. null fuera de un ProveedorExportar. */
export function useRegistroExportar(): Registro | null {
  return useContext(Ctx);
}

/**
 * Declara la tabla de esta vista. Fuera de un ProveedorExportar (Productos
 * como pagina suelta) no hace nada.
 */
export function useExportable(armar: Armar) {
  const registro = useContext(Ctx);
  useEffect(() => {
    if (!registro) return;
    registro.poner(armar);
    return () => registro.quitar(armar);
  });
}
