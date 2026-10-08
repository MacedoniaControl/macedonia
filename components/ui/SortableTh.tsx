"use client";

// Cabecera de tabla ordenable. Expone aria-sort para lectores de pantalla
// y muestra la dirección con una flecha (no solo con color).
import { Icon } from "@/components/ui/Icon";

export function SortableTh({
  label,
  sortKey,
  align = "left",
  ariaSort,
  onSort,
  className = "",
  compacto = false,
}: {
  label: string;
  sortKey: string;
  align?: "left" | "right";
  ariaSort: (k: string) => "ascending" | "descending" | "none";
  onSort: (k: string) => void;
  className?: string;
  /** Más baja: la cabecera de las notas dentro de una cuenta. */
  compacto?: boolean;
}) {
  const estado = ariaSort(sortKey);
  const activo = estado !== "none";
  return (
    <th
      scope="col"
      aria-sort={estado}
      className={`py-0 pr-3 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex ${compacto ? "min-h-8" : "min-h-11"} items-center gap-1 rounded-lg px-1 transition hover:text-text ${
          align === "right" ? "flex-row-reverse" : ""
        } ${activo ? "text-text" : ""}`}
        title={`Ordenar por ${label}`}
      >
        {label}
        <span aria-hidden="true" className={activo ? "text-brand" : "text-muted opacity-40"}>
          {/* Abajo = de mayor a menor; arriba = de menor a mayor; sin ordenar, de lado y tenue. */}
          <span className={`inline-flex transition-transform ${estado === "ascending" ? "rotate-180" : ""}`}>
            <Icon name={estado === "none" ? "chevronRight" : "chevronDown"} size={14} />
          </span>
        </span>
      </button>
    </th>
  );
}
