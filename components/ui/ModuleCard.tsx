import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

type ModuleCardProps = {
  href: string;
  title: string;
  description: string;
  icon: IconName;
};

export function ModuleCard({ href, title, description, icon }: ModuleCardProps) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-brand/50 hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-text group-hover:text-brand">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
    </Link>
  );
}
