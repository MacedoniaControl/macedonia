import type { ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({ title, description, action, children, className = "" }: SectionCardProps) {
  return (
    <section
      // min-w-0: permite que la tarjeta encoja como hijo de grid/flex; sin esto,
      // gráficas Recharts (ResponsiveContainer) desbordan el ancho en móvil.
      className={`min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5 ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold tracking-tight text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
