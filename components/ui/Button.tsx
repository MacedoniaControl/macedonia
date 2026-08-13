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
};

export function Button({ variant = "primary", icon, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}
