"use client";

// Separar facturas de notas de entrega, en cobrar y en pagar.
//
// Vive en un componente y no copiado en las dos pantallas porque ya nos paso
// tres veces que dos copias de la misma decision se separan y terminan
// diciendo cosas distintas.
//
// Factura y nota de entrega se muestran SIEMPRE, aunque tengan cero. Que no
// haya facturas es un dato -no estas facturando- y esconder la pestaña lo
// oculta. Las demas clases solo aparecen si existen: son casos raros y
// llenarian la barra de opciones vacias.

import { CLASES, grupoDeClase, type ClaseCuenta } from "@/lib/finanzas/retencion";

const FIJAS: ClaseCuenta[] = ["factura", "nota_entrega"];

export function FiltroClase({
  conteo,
  total,
  valor,
  onCambio,
}: {
  /** Cuántas cuentas hay de cada clase. */
  conteo: Record<string, number>;
  total: number;
  valor: string;
  onCambio: (clase: string) => void;
}) {
  // Solo se ofrece la pestaña del GRUPO: las notas de debito se cuentan bajo
  // «Nota de entrega», asi que no tienen pestaña propia.
  const visibles = CLASES.filter(
    (c) => grupoDeClase(c.id) === c.id && (FIJAS.includes(c.id) || conteo[c.id]),
  );

  return (
    <div className="sumi-tabs -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1"
      role="group" aria-label="Filtrar por clase de documento">
      {[{ id: "todas", label: `Todas (${total})` },
        ...visibles.map((c) => ({ id: c.id as string, label: `${c.label} (${conteo[c.id] ?? 0})` })),
      ].map((op) => (
        <button
          key={op.id}
          type="button"
          onClick={() => onCambio(op.id)}
          aria-pressed={valor === op.id}
          className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
            valor === op.id
              ? "border-brand-strong bg-brand-strong text-white"
              : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text"
          }`}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
}
