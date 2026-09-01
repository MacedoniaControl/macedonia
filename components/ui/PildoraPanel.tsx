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
        <>
          {/* En el teléfono el panel deja de colgar de la píldora y pasa a ser
              una hoja desde abajo.

              Con `absolute right-0` se anclaba al borde derecho de la píldora, y
              cuando la píldora cae a la izquierda el panel se iba FUERA de la
              pantalla: medido en 375px, arrancaba en -165px. El conteo físico y
              el registro de abonos quedaban inoperables justo en el teléfono
              para el que se diseñaron.

              Una hoja desde abajo además queda al alcance del pulgar, que es
              como se sostiene el teléfono en el galpón. */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <div
            // La base es el popover de escritorio, para que Tailwind vea el
            // ancho como clase literal. El teléfono lo sobrescribe con max-sm:
            // — una clase armada como `sm:${ancho}` no la detecta el compilador.
            className={`absolute right-0 z-40 mt-2 ${ancho} max-w-[calc(100vw-2rem)]
                        rounded-2xl border border-border bg-surface p-4 shadow-xl
                        max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50
                        max-sm:mt-0 max-sm:w-auto max-sm:max-w-none
                        max-sm:max-h-[85vh] max-sm:overflow-y-auto
                        max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0
                        max-sm:border-b-0 max-sm:pb-6`}
          >
            {/* Agarradera: dice que se puede cerrar arrastrando o tocando fuera. */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
            {children(() => setAbierto(false))}
          </div>
        </>
      )}
    </div>
  );
}
