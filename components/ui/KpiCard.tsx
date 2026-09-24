type KpiTone = "brand" | "navy" | "ok" | "warn" | "danger" | "info";

const accent: Record<KpiTone, string> = {
  brand: "bg-brand",
  navy: "bg-navy dark:bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
};

type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  /** El mismo monto en bolívares, debajo. */
  bs?: string | null;
  tone?: KpiTone;
};

export function KpiCard({ label, value, sub, bs, tone = "brand" }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent[tone]}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      </div>
      {/* Achica en movil y puede envolver: los montos en bolivares tienen
          siete y ocho digitos, y truncar una cifra la vuelve mentira. */}
      <p className="mt-2 text-lg font-semibold leading-tight tracking-tight tabular-nums text-text [overflow-wrap:anywhere] sm:text-2xl">
        {value}
      </p>
      {bs && <p className="mt-0.5 text-xs font-medium tabular-nums text-text/80 [overflow-wrap:anywhere]">≈ {bs}</p>}
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
