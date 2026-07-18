"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { companies } from "@/lib/ux/dashboard-data";

/**
 * Selector de empresa (presentacional). El scope real y la validación de acceso viven en el
 * server (ver docs/contracts/company-selector-component.md y docs/decisions/company-scope.md).
 * Aquí solo se gestiona el estado visual para la demo.
 */
export function CompanySelector() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(companies[0]?.id ?? "");
  const active = companies.find((c) => c.id === activeId) ?? companies[0];

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
        <span className="max-w-[8rem] truncate">{active?.name}</span>
        <Icon name="chevronDown" size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            className="absolute z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {companies.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === activeId}
                  onClick={() => {
                    setActiveId(c.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                    c.id === activeId ? "text-brand" : "text-text"
                  }`}
                >
                  {c.name}
                  {c.id === activeId && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
