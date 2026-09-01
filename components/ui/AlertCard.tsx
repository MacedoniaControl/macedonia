import { Icon } from "@/components/ui/Icon";

type AlertTone = "warn" | "danger" | "info" | "ok";

// El aviso se distingue por su superficie teñida y el color del ícono, no por
// una barra gruesa a la izquierda: esa barra es el tic más reconocible de una
// interfaz generada, y acá no aportaba nada que el color del ícono no diga ya.
const tones: Record<AlertTone, { borde: string; fondo: string; text: string }> = {
  warn:   { borde: "border-warn/35",   fondo: "bg-warn/10",   text: "text-warn" },
  danger: { borde: "border-danger/35", fondo: "bg-danger/10", text: "text-danger" },
  info:   { borde: "border-info/35",   fondo: "bg-info/10",   text: "text-info" },
  ok:     { borde: "border-ok/35",     fondo: "bg-ok/10",     text: "text-ok" },
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
    <div className={`flex gap-3 rounded-xl border ${t.borde} ${t.fondo} p-3`}>
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
