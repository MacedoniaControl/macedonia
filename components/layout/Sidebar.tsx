"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { navGroups } from "@/lib/ux/nav";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

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
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white font-bold">
            S
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text">SumiControl</p>
            <p className="text-[11px] text-muted">Sumigases · Sudematin</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
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
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
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
