import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Los fondos con texto blanco usan las variantes "strong" (>=4.5:1 AA).
// hover:brightness-90 oscurece, así que el contraste sube, nunca baja.
const variants: Record<Variant, string> = {
  primary: "bg-brand-strong text-white hover:brightness-90",
  secondary: "border border-border bg-surface text-text hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-90",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
  children?: ReactNode;
  /** En curso. Deshabilita y muestra `textoCargando` SIN cambiar de ancho. */
  cargando?: boolean;
  textoCargando?: string;
};

export function Button({
  variant = "primary", icon, children, className = "",
  cargando = false, textoCargando, disabled, ...rest
}: ButtonProps) {
  // Los dos rótulos viven en la MISMA celda de rejilla: el ancho lo fija el
  // más largo y no cambia nunca. Cambiar el texto a secas encoge el botón bajo
  // el dedo justo en el momento de pulsarlo, que es cuando peor se siente.
  const conEstados = textoCargando !== undefined;

  return (
    <button
      disabled={disabled ?? cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition active:scale-[0.972] disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      {conEstados ? (
        <span className="grid items-center justify-items-center">
          <span className={`col-start-1 row-start-1 whitespace-nowrap transition ${cargando ? "opacity-0" : "opacity-100"}`}>
            {children}
          </span>
          <span
            aria-hidden={!cargando}
            className={`col-start-1 row-start-1 whitespace-nowrap transition ${cargando ? "opacity-100" : "opacity-0"}`}
          >
            {textoCargando}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
