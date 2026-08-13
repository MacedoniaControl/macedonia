import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";

export type TableState = "ready" | "loading" | "empty" | "error" | "forbidden";

type DataTableShellProps = {
  title: string;
  description?: string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  action?: ReactNode;
  state?: TableState;
  empty?: ReactNode;
  children?: ReactNode;
};

export function DataTableShell({
  title,
  description,
  searchPlaceholder = "Buscar…",
  filters,
  action,
  state = "ready",
  empty,
  children,
}: DataTableShellProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
            <span className="pointer-events-none absolute left-3 text-muted">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 w-full rounded-xl border border-border-strong bg-surface-2 pl-9 pr-3 text-sm text-text placeholder:text-muted"
            />
          </label>
          {filters}
        </div>
      </header>

      <div className="p-4">
        {state === "loading" && (
          <div className="space-y-2" aria-busy="true" aria-label="Cargando">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        )}

        {state === "error" && (
          <EmptyState
            icon="alert"
            title="No se pudieron cargar los datos"
            message="Ocurrió un error al obtener la información. Intenta nuevamente en unos segundos."
          />
        )}

        {state === "forbidden" && (
          <EmptyState
            icon="audit"
            title="Sin permisos para ver esto"
            message="Tu rol no tiene acceso a esta información. Solicita acceso a un administrador."
          />
        )}

        {state === "empty" && (empty ?? (
          <EmptyState title="Sin registros" message="Todavía no hay información para mostrar." />
        ))}

        {state === "ready" && (
          <div className="sumi-scroll max-w-full overflow-x-auto">{children}</div>
        )}
      </div>
    </section>
  );
}
