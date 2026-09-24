"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useInicio } from "@/lib/ux/inicio";

export type Crumb = { label: string; href?: string };

/**
 * Migas de pan. Todas empiezan en «Inicio», que lleva a la pantalla principal
 * de quien esta en sesion (Cilindros para el tecnico, Dashboard para los
 * demas): volver es el mismo gesto en todas las secciones. En el propio inicio
 * no se repite.
 *
 * Los grupos del menu (Finanzas, Inventario…) no son pantallas: se ven como
 * enlace y no llevan a ningun lado, y «Inventario › Cilindros» hacia pensar
 * que Cilindros estaba dentro de Inventario. Quedan Inicio y la seccion.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const inicio = useInicio();
  const ruta = usePathname();
  const propias = items.filter((it, i) => it.href !== undefined || i === items.length - 1);
  // En el propio inicio no hay a donde volver.
  if (ruta === inicio) return null;
  const todas: Crumb[] = [{ label: "Inicio", href: inicio }, ...propias];
  return (
    <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-1 text-sm text-muted">
      {todas.map((item, i) => {
        const last = i === todas.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {item.href && !last ? (
              <Link href={item.href} className="-my-2 py-2 font-medium hover:underline">
                {/* El color en el span: `a { color: inherit }` (globals.css) le gana a una utilidad en el enlace. */}
                <span className="text-brand">{item.label}</span>
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
