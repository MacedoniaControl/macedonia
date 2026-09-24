"use client";

// Aviso de "no tenés acceso a esa sección".
//
// El proxy manda a quien entra a una seccion sin permiso a su inicio con
// ?sinpermiso=<clave> (lib/auth/acceso.ts). Sin este aviso la persona tocaba
// un enlace y aparecia en otra pantalla sin saber por que.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { navGroups } from "@/lib/ux/nav";

const OTRAS: Record<string, string> = { products: "Productos y catálogo", sales: "Ventas externas" };

function nombreDe(clave: string): string {
  const item = navGroups.flatMap((g) => g.items).find((i) => i.href === `/admin/${clave}`);
  return item?.label ?? OTRAS[clave] ?? clave;
}

export function AvisoSinPermiso() {
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const clave = params.get("sinpermiso");
  if (!clave) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm text-text">
      <span className="mt-0.5 text-warn"><Icon name="alert" size={16} /></span>
      <p className="flex-1">
        No tienes acceso a <b>{nombreDe(clave)}</b>, así que te trajimos a tu pantalla de inicio. Si lo necesitas para tu trabajo, pídeselo al Owner.
      </p>
      <button type="button" aria-label="Cerrar aviso" onClick={() => router.replace(ruta)}
        className="-my-1.5 -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:text-text">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
