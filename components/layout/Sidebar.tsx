"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { navGroups } from "@/lib/ux/nav";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";

export function Sidebar({ empresa, open, onClose }: { empresa?: string | null; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const emp = empresa && isEmpresaId(empresa) ? EMPRESAS[empresa] : null;
  // Prefija los links con la empresa activa: /admin/quotes -> /admin/<empresa>/quotes
  const scoped = (href: string) => (emp ? href.replace(/^\/admin\//, `/admin/${emp.id}/`) : href);

  return (
    <>
      {/* Overlay móvil */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navegación principal"
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
          {emp ? (
            <img src={emp.logo} alt="" className="h-8 w-auto max-w-[36px] object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white font-bold">M</span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-text">{emp ? emp.nombreCorto : "Macedonia"}</p>
            <p className="text-[11px] text-muted">{emp ? "Macedonia" : "Sumigases · Sudematin"}</p>
          </div>

          {/* Volver al Centro de Control (elegir empresa / salir del panel) */}
          <Link
            href="/"
            onClick={onClose}
            aria-label="Volver al menú principal de Macedonia"
            title="Volver al menú principal"
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-brand"
          >
            <span className="rotate-180"><Icon name="chevronRight" size={18} /></span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="sumi-scroll flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const href = scoped(item.href);
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-sm transition ${
                          active
                            ? "bg-brand-soft font-medium text-brand"
                            : "text-text hover:bg-surface-2"
                        }`}
                      >
                        <span className={active ? "text-brand" : "text-muted"}>
                          <Icon name={item.icon} size={18} />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
