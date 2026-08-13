import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "danger" | "info" | "brand" | "navy" | "muted";

const toneClasses: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok ring-ok/30",
  warn: "bg-warn/10 text-warn ring-warn/30",
  danger: "bg-danger/10 text-danger ring-danger/30",
  info: "bg-info/10 text-info ring-info/30",
  brand: "bg-brand/10 text-brand ring-brand/30",
  navy: "bg-navy/10 text-navy ring-navy/30 dark:text-accent",
  muted: "bg-muted/10 text-muted ring-muted/30",
};

export function StatusBadge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}
