"use client";

// Proveedores, dentro de Compras.
//
// Vive acá y no en el menú principal por la misma razón que los clientes viven
// dentro de las notas de entrega: se cargan cuando hacen falta, en el momento en
// que hacen falta, no como un trámite aparte que alguien tiene que acordarse de
// hacer antes.

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { buscarProveedores, type Proveedor } from "@/lib/directorio/directorio-db";
import { FormularioProveedor } from "@/components/directorio/FormularioProveedor";

export function PanelProveedores() {
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Partial<Proveedor> | null>(null);
  const [recarga, setRecarga] = useState(0);

  // Con menos de 2 letras no se consulta: mostrar los 500 proveedores de golpe
  // no ayuda a nadie y castiga la conexión.
  const carga = useCarga(
    `${q.trim().length >= 2 ? q.trim() : ""}:${recarga}`,
    () => (q.trim().length >= 2 ? buscarProveedores(q, 25) : Promise.resolve([])),
  );
  const lista: Proveedor[] = carga.datos ?? [];

  return (
    <SectionCard
      title="Proveedores"
      description="Busca por nombre o RIF. El RIF es el código: no hay otro número que recordar."
    >
      <div className="mb-3 flex gap-2">
        <label className="relative flex flex-1 items-center">
          <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proveedor por nombre o RIF…"
            aria-label="Buscar proveedor"
            className="h-12 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-3 text-base text-text
                       outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </label>
        <button
          type="button"
          onClick={() => setEditando({})}
          className="flex h-12 flex-none items-center gap-1.5 rounded-full border border-brand-strong px-4
                     text-sm font-medium text-brand transition hover:bg-brand/10"
        >
          <Icon name="plus" size={16} />
          Nuevo proveedor
        </button>
      </div>

      {carga.error && <p className="text-sm text-danger">{carga.error}</p>}

      {q.trim().length < 2 && (
        <p className="py-6 text-center text-sm text-muted">
          Escribe al menos 2 letras para buscar, o crea uno nuevo.
        </p>
      )}

      {q.trim().length >= 2 && !carga.cargando && lista.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Ningún proveedor coincide. Usa «Nuevo proveedor».
        </p>
      )}

      {lista.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">RIF</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium">Contacto</th>
                <th className="py-2 pr-3 text-right font-medium">Días créd.</th>
                <th className="py-2 pr-3 text-right font-medium">% Ret.</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.rif} className="border-b border-border/60">
                  <td className="py-2.5 pr-3 font-mono text-xs text-text">{p.rif}</td>
                  <td className="py-2.5 pr-3 text-text">
                    {p.nombre}
                    {!p.nacional && <span className="ml-1.5 text-xs text-muted">· extranjero</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-muted">{p.contacto ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{p.diasCredito}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">
                    {p.pctRetencion > 0 ? `${p.pctRetencion}%` : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      className="min-h-11 rounded-lg px-2 text-sm text-muted hover:text-brand"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormularioProveedor
          inicial={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); setRecarga((n) => n + 1); }}
        />
      )}
    </SectionCard>
  );
}
