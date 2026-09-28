"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { MenuUsuario } from "@/components/layout/MenuUsuario";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CompanySelector } from "@/components/ui/CompanySelector";
import { findNavItem } from "@/lib/ux/nav";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { alertasDe, marcarRevisada, type Alerta } from "@/lib/ux/alertas-db";
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
  const viejaBcv = !!bcv && Date.now() - new Date(bcv.fetchedAt).getTime() > 90 * 60_000;
  const ddmm = (ymd: string) => ymd.split("-").reverse().slice(0, 2).join("-");
  // Las alertas salen de la base (alertas-db). Se piden al entrar a cada
  // pantalla, al abrir la campana y cada 5 minutos. Mientras llega la
  // respuesta se deja la lista anterior: que el número no parpadee.
  const empresa = useEmpresaActiva();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [vez, setVez] = useState(0);
  useEffect(() => {
    let vigente = true;
    alertasDe(empresa).then((a) => { if (vigente) setAlertas(a); }).catch(() => {});
    const t = setInterval(() => setVez((n) => n + 1), 5 * 60_000);
    return () => { vigente = false; clearInterval(t); };
  }, [empresa, pathname, vez]);
  const totalBadge = alertas.length;

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
        aria-label="Consultar ahora el dólar BCV"
        title="Se actualiza sola cada 30 minutos. Toca para consultar ya."
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
            {/* La fecha valor es el día para el que vale; la hora, la última vez
                que el BCV la confirmó. Con más de hora y media sin confirmarse,
                se avisa: la base la pide cada 30 minutos. */}
            <p className={`text-[10px] ${viejaBcv ? "font-medium text-warn" : "text-muted"}`}
              title={bcv.proxima ? `Ya publicada la del ${ddmm(bcv.proxima.fechaValor)}: ${bcv.proxima.tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs` : undefined}>
              {viejaBcv ? "Sin actualizar desde " : `Vale el ${ddmm(bcv.fecha)} · `}
              {new Date(bcv.fetchedAt).toLocaleString("es-VE", viejaBcv ? { dateStyle: "short", timeStyle: "short" } : { timeStyle: "short" })}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted">— Bs</p>
            <p className="text-[10px] text-muted">Pulsa “Tasa BCV”</p>
          </>
        )}
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        <CompanySelector />

        <div className="relative">
          <button
            type="button"
            aria-label={`Alertas (${totalBadge})`}
            aria-expanded={alertsOpen}
            onClick={() => { if (!alertsOpen) setVez((n) => n + 1); setAlertsOpen((v) => !v); }}
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
                <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Alertas Operativas ({alertas.length})
                </p>
                {alertas.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted">Nada que atender por ahora.</p>
                ) : (
                  <ul className="max-h-[22rem] overflow-y-auto">
                    {alertas.map((a) => {
                      const cuerpo = (
                        <>
                          <span className={`mt-0.5 shrink-0 ${a.tono === "danger" ? "text-danger" : a.tono === "warn" ? "text-warn" : "text-info"}`}>
                            <Icon name="alert" size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-text">{a.titulo}</span>
                            <span className="block text-xs text-muted">{a.mensaje}</span>
                          </span>
                          {a.enlace && <span className="mt-0.5 shrink-0 text-muted" aria-hidden><Icon name="chevronRight" size={14} /></span>}
                        </>
                      );
                      return (
                        <li key={a.id} className="border-b border-border last:border-0">
                          {a.enlace ? (
                            <Link href={a.enlace} onClick={() => setAlertsOpen(false)} className="flex gap-2.5 px-3 py-2.5 hover:bg-surface-2">{cuerpo}</Link>
                          ) : (
                            <div className="px-3 py-2.5">
                              <div className="flex gap-2.5">{cuerpo}</div>
                              {a.notificacion !== undefined && (
                                <button type="button"
                                  onClick={async () => { const r = await marcarRevisada(a.notificacion!); if (r.ok) setAlertas((l) => l.filter((x) => x.id !== a.id)); }}
                                  className="ml-[26px] mt-2 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-2">
                                  Marcar revisada
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <div className="hidden sm:block"><ThemeToggle /></div>
        <MenuUsuario />
      </div>
    </header>
  );
}
