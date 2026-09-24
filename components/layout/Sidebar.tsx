"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { navGroups } from "@/lib/ux/nav";
import type { Permisos } from "@/lib/auth/permisos";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { useInicio } from "@/lib/ux/inicio";

export function Sidebar({
  empresa,
  open,
  onClose,
  permisos,
  esOwner = false,
}: {
  empresa?: string | null;
  open: boolean;
  onClose: () => void;
  /** Permisos del usuario. Sin backend activo llega undefined: se muestra todo. */
  permisos?: Permisos;
  esOwner?: boolean;
}) {
  const pathname = usePathname();
  const inicio = useInicio();
  const emp = empresa && isEmpresaId(empresa) ? EMPRESAS[empresa] : null;
  // Prefija los links con la empresa activa: /admin/quotes -> /admin/<empresa>/quotes
  const scoped = (href: string) => (emp ? href.replace(/^\/admin\//, `/admin/${emp.id}/`) : href);

  // Las secciones sin permiso se OCULTAN, no se deshabilitan: mostrar una puerta
  // que no abre solo genera preguntas. Un grupo que queda sin ítems tampoco se
  // dibuja, para no dejar un encabezado "Finanzas" con nada debajo.
  //
  // Sin permisos (backend no configurado todavía) se muestra todo: la app sigue
  // usable en vez de quedar vacía.
  const gruposVisibles = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (esOwner || !permisos) return true;
        return permisos[item.href.replace("/admin/", "")] === true;
      }),
    }))
    .filter((group) => group.items.length > 0);

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
          {/* El nombre de la empresa lleva a Inicio, como en casi cualquier app. */}
          <Link href={inicio} onClick={onClose} aria-label="Ir al inicio" className="flex min-w-0 items-center gap-2.5 rounded-lg">
          {emp ? (
            <img src={emp.logo} alt="" className="h-8 w-auto max-w-[36px] object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white font-bold">M</span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-text">{emp ? emp.nombreCorto : "Macedonia"}</p>
            <p className="text-[11px] text-muted">{emp ? "Macedonia" : "Sumigases · Sudematin"}</p>
          </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* El Centro de Control es donde el Owner elige empresa. Antes era una
            flecha «‹» sin texto que a los demas los devolvia a la misma
            pantalla: para ellos no existe, su pantalla principal es Inicio. */}
        {esOwner && (
          <Link
            href="/"
            onClick={onClose}
            className="group mx-3 mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition hover:border-brand"
          >
            <span className="text-muted group-hover:text-brand"><Icon name="building" size={16} /></span>
            <span className="text-text group-hover:text-brand">Centro de Control</span>
            <span className="ml-auto text-[11px] font-normal text-muted">cambiar empresa</span>
          </Link>
        )}

        <nav className="sumi-scroll flex-1 overflow-y-auto px-3 py-4">
          {gruposVisibles.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted">
              No tienes secciones asignadas. Pídele al Owner que te dé acceso.
            </p>
          )}
          {gruposVisibles.map((group) => (
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
