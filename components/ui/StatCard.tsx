type StatCardProps = {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
};

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-accent/40 bg-accent/10"
          : "border-border bg-surface-2"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {/* La cifra achica en pantallas chicas y puede envolver.
          A 320px, con las tarjetas a dos por fila, la caja mide 87px y
          "$2.365.456" necesitaba 113: el numero se cortaba. Achicar el tipo es
          preferible a truncar una cifra — un monto a medias no se lee, engaña.
          `tabular-nums` mantiene las columnas alineadas al cambiar de tamaño. */}
      <p className="mt-1.5 text-base font-semibold leading-tight tabular-nums text-text [overflow-wrap:anywhere] sm:text-xl">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
