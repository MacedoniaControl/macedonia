"use client";

// Píldora que abre un panel desplegable anclado a ella.
//
// Existe porque los formularios de alta y de abono ocupaban una columna fija
// junto a la tabla: robaban ancho a lo que se mira todos los días (la cartera)
// para mostrar algo que se usa de a ratos. Ahora se despliegan cuando hacen
// falta y desaparecen cuando no.

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export function PildoraPanel({
  etiqueta,
  icono = "plus",
  ancho = "w-[26rem]",
  children,
}: {
  etiqueta: string;
  icono?: IconName;
  ancho?: string;
  children: (cerrar: () => void) => React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera o con Escape. Sin esto el panel queda tapando
  // la tabla y hay que volver a la píldora para salir.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition
          ${abierto
            ? "border-brand-strong bg-brand-soft text-brand"
            : "border-border-strong bg-surface text-text hover:bg-surface-2"}`}
      >
        <Icon name={icono} size={16} />
        {etiqueta}
      </button>

      {abierto && (
        <div
          className={`absolute right-0 z-40 mt-2 ${ancho} max-w-[calc(100vw-2rem)] rounded-2xl
                      border border-border bg-surface p-4 shadow-xl`}
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}
