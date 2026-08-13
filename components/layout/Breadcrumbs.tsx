import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-1 text-sm text-muted">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {item.href && !last ? (
              <Link href={item.href} className="hover:text-brand">
                {item.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-text" : undefined} aria-current={last ? "page" : undefined}>
                {item.label}
              </span>
            )}
            {!last && <Icon name="chevronRight" size={14} aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}
