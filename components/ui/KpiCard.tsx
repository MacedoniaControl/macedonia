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
  tone?: KpiTone;
  demo?: boolean;
};

export function KpiCard({ label, value, sub, tone = "brand", demo }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent[tone]}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {demo && (
          <span
            className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted"
            title="Valor demo: aún sin fuente transaccional real"
          >
            demo
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
