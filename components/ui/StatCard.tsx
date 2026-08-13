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
      <p className="mt-1.5 text-xl font-semibold text-text">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
