"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CompanySelector } from "@/components/ui/CompanySelector";
import { findNavItem } from "@/lib/ux/nav";
import { alertasOperativas } from "@/lib/ux/dashboard-data";

export function Header({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const [alertsOpen, setAlertsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menú"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text hover:bg-surface-2 lg:hidden"
      >
        <Icon name="menu" />
      </button>

      <p className="truncate text-sm font-medium text-text">{current?.label ?? "SumiControl"}</p>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden sm:block">
          <CompanySelector />
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="Alertas"
            aria-expanded={alertsOpen}
            onClick={() => setAlertsOpen((v) => !v)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-text hover:bg-surface-2"
          >
            <Icon name="bell" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
          </button>
          {alertsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAlertsOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 z-20 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Alertas operativas ({alertasOperativas.length})
                </p>
                <ul className="max-h-72 overflow-y-auto">
                  {alertasOperativas.map((a) => (
                    <li key={a.titulo} className="flex gap-2.5 border-b border-border px-3 py-2.5 last:border-0">
                      <span className={`mt-0.5 shrink-0 ${a.tone === "warn" ? "text-warn" : "text-info"}`}>
                        <Icon name="alert" size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text">{a.titulo}</span>
                        <span className="block text-xs text-muted">{a.mensaje}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/admin/dashboard"
                  onClick={() => setAlertsOpen(false)}
                  className="block px-3 py-2 text-center text-xs font-medium text-brand hover:bg-surface-2"
                >
                  Ver dashboard
                </Link>
              </div>
            </>
          )}
        </div>

        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-xs font-semibold text-white">
            GV
          </span>
          <div className="hidden leading-tight md:block">
            <p className="text-xs font-medium text-text">Greeg V.</p>
            <p className="text-[10px] text-muted">Owner</p>
          </div>
        </div>
      </div>
    </header>
  );
}
