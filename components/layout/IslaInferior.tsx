"use client";

// Isla de navegación inferior, solo en móvil.
//
// El menú lateral es de escritorio: en el teléfono la única entrada era el
// cajón, y había que abrirlo para llegar a cualquier lado. Según PRODUCT.md
// dos de las cuatro escenas de uso son con el teléfono en la mano —galpón y
// calle— así que la navegación principal no puede vivir detrás de un gesto.
//
// CINCO PASTILLAS COMO MÁXIMO. A 320px son 54px cada una; con seis, una
// etiqueta de dos palabras deja de entrar.
//
// El orden lo dicta PRODUCT.md, no el menú de escritorio: Inventario y
// Cilindros son las DOS razones por las que el producto existe, y en el
// lateral Cilindros era el octavo ítem de dieciséis.

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useRol } from "@/lib/ux/session";
import { puedeVer, type Permisos } from "@/lib/auth/permisos";

type Pastilla = { clave: string; href: string; etiqueta: string; icono: IconName };

const PASTILLAS: Pastilla[] = [
  { clave: "inventory",      href: "/admin/inventory",      etiqueta: "Inventario", icono: "inventory" },
  { clave: "cylinders",      href: "/admin/cylinders",      etiqueta: "Cilindros",  icono: "cylinder" },
  { clave: "delivery-notes", href: "/admin/delivery-notes", etiqueta: "Notas",      icono: "delivery" },
  { clave: "quotes",         href: "/admin/quotes",         etiqueta: "Cotizar",    icono: "quote" },
];

export function IslaInferior({ empresa, onMas, permisos }: { empresa: string | null; onMas: () => void; permisos?: Permisos }) {
  const ruta = usePathname();
  const { rol } = useRol();

  // Quien no puede entrar a una sección no la ve: una pastilla que lleva a un
  // "no tienes permiso" gasta uno de los cinco lugares.
  // Siempre DENTRO de la empresa que se esta mirando: con /admin/inventory a
  // secas, el tecnico de Sudematin caia en el inventario de Sumigases.
  const visibles = PASTILLAS
    .filter((p) => !permisos || puedeVer(permisos, rol, p.clave))
    .map((p) => ({ ...p, href: empresa ? p.href.replace(/^\/admin\//, `/admin/${empresa}/`) : p.href }));

  // Con el teclado abierto la isla estorba: tapa lo que se esta escribiendo.
  // Se marca en <html> y el CSS la esconde (y baja la barra del conteo).
  useEffect(() => {
    const html = document.documentElement;
    const escribe = (el: Element | null) =>
      el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable) ||
      (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"].includes(el.type));
    const entra = (e: FocusEvent) => { if (escribe(e.target as Element)) html.dataset.teclado = "1"; };
    // Pasar de una casilla a la siguiente no debe hacer saltar la isla.
    const sale = () => setTimeout(() => { if (!escribe(document.activeElement)) delete html.dataset.teclado; }, 0);
    document.addEventListener("focusin", entra);
    document.addEventListener("focusout", sale);
    return () => {
      document.removeEventListener("focusin", entra);
      document.removeEventListener("focusout", sale);
      delete html.dataset.teclado;
    };
  }, []);

  return (
    <nav
      className="sumi-isla pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Secciones"
    >
      {/* pointer-events auto solo en la píldora: el hueco de los lados deja
          pasar el toque al contenido de abajo. */}
      <div className="pointer-events-auto m-3 flex items-stretch gap-1 rounded-full border border-border bg-surface p-1 shadow-xl">
        {visibles.map((p) => {
          const activa = ruta === p.href || ruta.startsWith(`${p.href}/`);
          return (
            <Link
              key={p.clave}
              href={p.href}
              aria-current={activa ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1
                          rounded-full px-0.5 py-2 text-center transition
                          ${activa
                            ? "bg-brand-strong font-semibold text-white"
                            : "text-muted active:bg-surface-2"}`}
            >
              <Icon name={p.icono} size={18} />
              {/* 11px es el suelo para texto funcional; con 10px no se lee. La
                  elipsis evita que una etiqueta larga desarme el reparto. */}
              <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.6875rem] tracking-[0.02em]">
                {p.etiqueta}
              </span>
            </Link>
          );
        })}

        {/* Lo que no entra en las cinco vive aquí, no se pierde. */}
        <button
          type="button"
          onClick={onMas}
          aria-label="Ver todas las secciones"
          className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1
                     rounded-full px-0.5 py-2 text-center text-muted transition active:bg-surface-2"
        >
          <Icon name="menu" size={18} />
          <span className="text-[0.6875rem] tracking-[0.02em]">Más</span>
        </button>
      </div>
    </nav>
  );
}
