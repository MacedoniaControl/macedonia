"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CompanySelector } from "@/components/ui/CompanySelector";
import { findNavItem } from "@/lib/ux/nav";
import { alertasOperativas } from "@/lib/ux/dashboard-data";
import { useNotifications, updateNotif } from "@/lib/ux/notifications";
import { fetchBcvRate, useBcvRate } from "@/lib/ux/bcv-rate";

export function Header({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [bcvLoading, setBcvLoading] = useState(false);

  async function dolarPrice() {
    setBcvLoading(true);
    const r = await fetchBcvRate();
    setBcvLoading(false);
    if (!r.ok) alert(`No se pudo obtener el dólar del BCV.\n${r.error ?? ""}`);
  }

  const bcv = useBcvRate();
  const notifs = useNotifications();
  const pendientes = notifs.filter((n) => n.estado === "pendiente");
  const totalBadge = pendientes.length + alertasOperativas.length;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-1.5 border-b border-border bg-surface/90 px-3 backdrop-blur sm:gap-2 sm:px-4">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menú"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-text hover:bg-surface-2 lg:hidden"
      >
        <Icon name="menu" />
      </button>

      <p className="hidden truncate text-sm font-medium text-text sm:block">
        {current?.label ?? "Macedonia"}
      </p>

      <button
        type="button"
        onClick={dolarPrice}
        disabled={bcvLoading}
        aria-label="Actualizar precio del dólar BCV"
        className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-text transition hover:bg-surface-2 disabled:opacity-60"
      >
        <Icon name="dollar" size={16} />
        {bcvLoading ? "Consultando…" : (
          <>
            {/* En el teléfono se muestra la CIFRA, no la palabra: es el dato que
                se necesita, y ahorra el espacio que hacía falta para lo demás. */}
            <span className="tabular-nums sm:hidden">{bcv ? bcv.tasa.toFixed(2) : "Tasa"}</span>
            <span className="hidden sm:inline">Tasa BCV</span>
          </>
        )}
      </button>

      {/* Precio del dólar BCV, siempre visible junto al botón */}
      <div
        className="ml-2 hidden min-w-[9.5rem] shrink-0 rounded-xl border border-border bg-surface-2 px-3 py-1 leading-tight sm:block"
        aria-live="polite"
      >
        {bcv ? (
          <>
            <p className="text-sm font-semibold tabular-nums text-text">
              {bcv.tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs
            </p>
            <p className="text-[10px] text-muted">
              Consultado: {new Date(bcv.fetchedAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted">— Bs</p>
            <p className="text-[10px] text-muted">Pulsá “Tasa BCV”</p>
          </>
        )}
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        <CompanySelector />

        <div className="relative">
          <button
            type="button"
            aria-label={`Notificaciones (${totalBadge})`}
            aria-expanded={alertsOpen}
            onClick={() => setAlertsOpen((v) => !v)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text hover:bg-surface-2"
          >
            <Icon name="bell" />
            {totalBadge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {totalBadge}
              </span>
            )}
          </button>
          {alertsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAlertsOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 z-20 mt-1 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                {pendientes.length > 0 && (
                  <>
                    <p className="border-b border-border bg-warn/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-warn">
                      Autorizaciones pendientes ({pendientes.length})
                    </p>
                    <ul className="max-h-64 overflow-y-auto">
                      {pendientes.map((n) => (
                        <li key={n.id} className="border-b border-border px-3 py-2.5 last:border-0">
                          <p className="text-sm font-medium text-text">{n.titulo}</p>
                          <p className="text-xs text-muted">{n.mensaje}</p>
                          <p className="mt-0.5 text-[11px] text-muted">Autoriza: {n.para} · {n.hora}</p>
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => updateNotif(n.id, { estado: "aprobada" })}
                              className="rounded-lg bg-ok-strong px-2.5 py-1 text-xs font-medium text-white hover:brightness-90">Aprobar</button>
                            <button type="button" onClick={() => updateNotif(n.id, { estado: "rechazada" })}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-2">Rechazar</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Alertas operativas ({alertasOperativas.length})
                </p>
                <ul className="max-h-56 overflow-y-auto">
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
              </div>
            </>
          )}
        </div>

        <div className="hidden sm:block"><ThemeToggle /></div>
        <div className="hidden items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-xs font-semibold text-white">GV</span>
          <div className="hidden leading-tight md:block">
            <p className="text-xs font-medium text-text">Greeg V.</p>
            <p className="text-[10px] text-muted">Owner</p>
          </div>
        </div>
      </div>
    </header>
  );
}
