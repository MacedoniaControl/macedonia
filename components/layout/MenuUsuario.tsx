"use client";

// Quién soy y cómo salgo.
//
// Antes era un <div> con "GV / Greeg V. / Owner" escrito a mano: no respondía
// al clic y le mostraba el nombre del dueño a cualquiera que entrara. Y no
// había ninguna forma de cerrar sesión en toda la app -la acción `salir()`
// existía desde hacía tiempo y nadie la llamaba-.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSesion } from "@/components/auth/SesionProvider";
import { inicialesDe } from "@/lib/auth/identidad";
import { ROLES } from "@/lib/ux/session";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { salir } from "@/app/login/actions";

export function MenuUsuario() {
  const u = useSesion();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera o con Escape: un menú que tapa la pantalla y
  // no se va con Escape deja al teclado sin salida.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  // Sin sesión resuelta no se dibuja un chip vacío ni uno inventado.
  if (!u) return null;

  const rol = ROLES.find((r) => r.id === u.rol)?.label ?? u.rol;
  const empresa = u.empresaId && isEmpresaId(u.empresaId) ? EMPRESAS[u.empresaId].nombreCorto : null;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Sesión de ${u.nombre}`}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5 transition-colors hover:border-brand focus-visible:border-brand focus-visible:outline-none"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy text-xs font-semibold text-white">
          {inicialesDe(u.nombre)}
        </span>
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block truncate text-xs font-medium text-text">{u.nombre}</span>
          <span className="block text-[10px] text-muted">{rol}</span>
        </span>
        <span className={`hidden text-muted transition-transform duration-200 md:block ${abierto ? "rotate-180" : ""}`}>
          <Icon name="chevronDown" size={14} />
        </span>
      </button>

      {abierto && (
        <div
          role="menu"
          className="sumi-entra absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-text">{u.nombre}</p>
            <p className="truncate text-xs text-muted">{u.usuario}</p>
            <p className="mt-1.5 text-xs text-muted">
              {rol}
              {empresa ? ` · ${empresa}` : " · las dos empresas"}
            </p>
          </div>

          {/* `salir()` es una acción de servidor: borra la sesión en Supabase y
              redirige. No alcanza con limpiar el navegador, porque el token de
              refresco vive del lado del servidor. */}
          <form action={salir}>
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm text-text transition-colors hover:bg-surface-2"
            >
              <span className="text-muted"><Icon name="logout" size={16} /></span>
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
