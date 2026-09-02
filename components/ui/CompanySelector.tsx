"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EMPRESA_IDS, EMPRESAS } from "@/lib/ux/empresas";
import { EMPRESA_POR_DEFECTO } from "@/lib/ux/use-empresa";

/**
 * Selector de empresa activa. Navega entre los dashboards separados por empresa
 * (/admin/<id>/dashboard) y refleja la ruta actual.
 *
 * NO hay consolidado: las dos empresas son separadas y nada de una aparece
 * dentro de la otra. El aislamiento real vive en el RLS de la base; esto es
 * solo la etiqueta, y su trabajo es no mentir sobre cuál está activa.
 */

const OPCIONES = [
  ...EMPRESA_IDS.map((id) => ({ id, name: EMPRESAS[id].nombreCorto, href: `/admin/${id}/dashboard` })),
];

export function CompanySelector() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Empresa activa según la URL: /admin/<id>/...
  //
  // Cuando la ruta NO trae empresa, cae al mismo lugar que useEmpresaActiva:
  // "sumigases". Antes caía a "all" —el consolidado— y como esa opción se
  // eliminó, el `find` fallaba y agarraba el ÚLTIMO elemento de la lista:
  // Sudematin. El resultado era una pantalla que leía datos de Sumigases con
  // el nombre de Sudematin arriba. La pared entre empresas la rompí yo al
  // sacar el consolidado y dejar esta línea buscándolo.
  //
  // Este valor de reserva tiene que seguir siendo el MISMO que el de
  // lib/ux/use-empresa.ts, o la etiqueta vuelve a mentir.
  const match = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/);
  const activeId = match ? match[1] : EMPRESA_POR_DEFECTO;
  const active = OPCIONES.find((o) => o.id === activeId) ?? OPCIONES[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Empresa activa"
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 sm:gap-2 sm:px-3 text-sm font-medium text-text hover:bg-surface-2"
      >
        <Icon name="building" size={18} />
        <span className="max-w-[4.5rem] truncate sm:max-w-[8rem]">{active.name}</span>
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
