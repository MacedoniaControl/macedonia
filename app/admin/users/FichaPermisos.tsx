"use client";

// Ficha de permisos de una persona: los módulos agrupados como el menú, más las
// capacidades transversales separadas al final.
//
// El guardado es optimista y REVIERTE si el servidor rechaza: nunca debe quedar
// la pantalla diciendo ON mientras la base dice OFF.

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { navGroups } from "@/lib/ux/nav";
import { CLAVES_ESPECIALES, type Permisos } from "@/lib/auth/permisos";
import { alternarPermiso, type UsuarioFila } from "./actions";

/** Nombre legible de cada capacidad transversal. Lo lee el Owner, no el sistema. */
const ETIQUETA_ESPECIAL: Record<string, { titulo: string; ayuda: string }> = {
  ver_registros: {
    titulo: "Ver registros y logs",
    ayuda: "El historial de documentos y la auditoría. Por defecto es solo tuyo.",
  },
  ver_costos: {
    titulo: "Ver costos de compra",
    ayuda: "Cuánto pagas por cada producto, y con eso el margen real.",
  },
  otra_empresa: {
    titulo: "Acceder a la otra empresa",
    ayuda: "Entra al panel de la otra empresa con estos mismos permisos.",
  },
};

export function FichaPermisos({ usuario }: { usuario: UsuarioFila }) {
  const [permisos, setPermisos] = useState<Permisos>(usuario.permisos);
  const [aviso, setAviso] = useState<string | null>(null);

  const esOwner = usuario.rol === "owner";

  async function alternar(clave: string, valor: boolean) {
    setAviso(null);
    setPermisos((p) => ({ ...p, [clave]: valor })); // optimista
    const r = await alternarPermiso(usuario.id, clave, valor);
    if (r.error) {
      setPermisos((p) => ({ ...p, [clave]: !valor })); // revertir
      setAviso(r.error);
    }
  }

  const encendido = (clave: string) => esOwner || permisos[clave] === true;

  return (
    <div className="border-t border-border bg-surface-2/40 px-4 py-3">
      {esOwner && (
        <p className="mb-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-text">
          El Owner tiene acceso total. Es irrevocable por diseño: aunque se apaguen
          todos los interruptores, sigue entrando a todo.
        </p>
      )}

      {navGroups.map((grupo) => (
        <div key={grupo.title} className="mb-3">
          <p className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {grupo.title}
          </p>
          <ul>
            {grupo.items.map((item) => {
              const clave = item.href.replace("/admin/", "");
              return (
                <li key={clave} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-sm text-text">{item.label}</span>
                  <Switch
                    checked={encendido(clave)}
                    disabled={esOwner}
                    onChange={(v) => alternar(clave, v)}
                    label={`${item.label} para ${usuario.nombre}`}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-warn">
          Permisos especiales
        </p>
        <ul>
          {CLAVES_ESPECIALES.map((clave) => {
            const e = ETIQUETA_ESPECIAL[clave];
            return (
              <li key={clave} className="flex items-start justify-between gap-3 py-0.5">
                <span className="min-w-0">
                  <span className="block text-sm text-text">{e.titulo}</span>
                  <span className="block text-xs text-muted">{e.ayuda}</span>
                </span>
                <Switch
                  checked={encendido(clave)}
                  disabled={esOwner}
                  onChange={(v) => alternar(clave, v)}
                  label={`${e.titulo} para ${usuario.nombre}`}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {aviso && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {aviso}
        </p>
      )}
    </div>
  );
}
