"use client";

// Ventana para contenido que no cabe en una pildora: el historial de una
// cuenta, su edicion. Sigue el mismo patron que ConfirmDialog -capa oscura y
// caja centrada- para no inventar una segunda forma de tapar la pantalla.

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export function Modal({
  titulo, children, onCerrar,
}: { titulo: string; children: ReactNode; onCerrar: () => void }) {
  // Escape cierra. Sin esto, quien navega con teclado queda encerrado dentro.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    // El fondo no debe desplazarse mientras la ventana esta abierta.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="sumi-entra my-auto w-full max-w-xl rounded-2xl border border-border bg-surface shadow-lg">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:text-text">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
