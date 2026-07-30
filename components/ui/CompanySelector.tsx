"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EMPRESA_IDS, EMPRESAS } from "@/lib/ux/empresas";

/**
 * Selector de empresa activa. Navega entre los dashboards separados por empresa
 * (/admin/<id>/dashboard) y el consolidado (/admin/dashboard). Refleja la ruta actual.
 * El aislamiento real de datos por empresa vivirá en el backend (RLS).
 */
const OPCIONES = [
  ...EMPRESA_IDS.map((id) => ({ id, name: EMPRESAS[id].nombreCorto, href: `/admin/${id}/dashboard` })),
  { id: "all", name: "Consolidado", href: "/admin/dashboard" },
];

export function CompanySelector() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Empresa activa según la URL: /admin/<id>/... ; si no, consolidado.
  const match = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/);
  const activeId = match ? match[1] : "all";
  const active = OPCIONES.find((o) => o.id === activeId) ?? OPCIONES[OPCIONES.length - 1];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Empresa activa"
        className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text hover:bg-surface-2"
      >
        <Icon name="building" size={18} />
        <span className="max-w-[8rem] truncate">{active.name}</span>
        <Icon name="chevronDown" size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul role="listbox" className="absolute z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
            {OPCIONES.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === activeId}
                  onClick={() => {
                    setOpen(false);
                    router.push(o.href);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                    o.id === activeId ? "text-brand" : "text-text"
                  }`}
                >
                  {o.name}
                  {o.id === activeId && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
