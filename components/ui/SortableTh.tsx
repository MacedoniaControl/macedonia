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
}: {
  label: string;
  sortKey: string;
  align?: "left" | "right";
  ariaSort: (k: string) => "ascending" | "descending" | "none";
  onSort: (k: string) => void;
}) {
  const estado = ariaSort(sortKey);
  const activo = estado !== "none";
  return (
    <th
      scope="col"
      aria-sort={estado}
      className={`py-0 pr-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-1 transition hover:text-text ${
          align === "right" ? "flex-row-reverse" : ""
        } ${activo ? "text-text" : ""}`}
        title={`Ordenar por ${label}`}
      >
        {label}
        <span aria-hidden="true" className={activo ? "text-brand" : "text-muted opacity-40"}>
          <Icon name={estado === "descending" ? "chevronDown" : "chevronRight"} size={14} />
        </span>
      </button>
    </th>
  );
}
