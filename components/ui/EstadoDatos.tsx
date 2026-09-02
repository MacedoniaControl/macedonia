"use client";

// Los cuatro estados de una tabla: cargando, error, vacío y con datos.
//
// Hasta ahora ninguna pantalla los distinguía. Si `listarCuentas` fallaba, se
// pintaban los encabezados sobre una tabla sin filas — EXACTAMENTE igual que si
// no hubiera deudas. Alguien podía concluir "no debemos nada" cuando lo que
// pasó fue que no cargó. Ese es el peor modo de fallo del producto: no se ve
// como un error, se ve como un dato.
//
// Sale de DataTableShell, que llevaba semanas construido y sin usar. De ahí se
// rescatan los estados y se deja afuera su cabecera: traía un buscador sin
// manejador, un control que parece funcionar y no hace nada.

import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";

export function EstadoDatos({
  cargando,
  error,
  vacio,
  children,
  tituloVacio = "Sin registros",
  mensajeVacio = "Todavía no hay información para mostrar.",
  filas = 4,
}: {
  cargando: boolean;
  error?: string | null;
  /** Verdadero cuando cargó bien y no hay nada. */
  vacio: boolean;
  children: ReactNode;
  tituloVacio?: string;
  mensajeVacio?: string;
  /** Cuántas líneas de esqueleto: acercarse al alto real evita el salto. */
  filas?: number;
}) {
  if (cargando) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Cargando">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="alert"
        title="No se pudieron cargar los datos"
        // El mensaje de la base se muestra: "no se pudo cargar" a secas no deja
        // hacer nada, y quien atiende el mostrador necesita poder decir QUÉ falló.
        message={`${error} · Reintentá en unos segundos.`}
      />
    );
  }

  if (vacio) return <EmptyState title={tituloVacio} message={mensajeVacio} />;

  return <>{children}</>;
}
