import { Icon } from "@/components/ui/Icon";

type AlertTone = "warn" | "danger" | "info" | "ok";

const tones: Record<AlertTone, { border: string; text: string }> = {
  warn: { border: "border-l-warn", text: "text-warn" },
  danger: { border: "border-l-danger", text: "text-danger" },
  info: { border: "border-l-info", text: "text-info" },
  ok: { border: "border-l-ok", text: "text-ok" },
};

export function AlertCard({
  tone = "info",
  titulo,
  mensaje,
}: {
  tone?: AlertTone;
  titulo: string;
  mensaje: string;
}) {
  const t = tones[tone];
  return (
    <div className={`flex gap-3 rounded-xl border border-border border-l-4 ${t.border} bg-surface-2 p-3`}>
      <span className={`mt-0.5 shrink-0 ${t.text}`}>
        <Icon name="alert" size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{titulo}</p>
        <p className="text-sm text-muted">{mensaje}</p>
      </div>
    </div>
  );
}
