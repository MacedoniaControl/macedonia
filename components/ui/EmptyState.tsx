import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  message: string;
  actions?: ReactNode;
};

export function EmptyState({ icon = "inventory", title, message, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
