"use client";

// Master: lo que dice el papel contra lo que alguien contó.
//
// Antes comparaba `existencia` contra `existencia_fisica`, y las DOS salían del
// kardex. Con eso el Master no podía detectar lo que se fue sin registrarse —
// que es exactamente la razón por la que este producto existe (ver PRODUCT.md).
//
// Ahora una columna es Valery y la otra es un conteo humano, con su fecha.
// Sin fecha el número engaña: un conteo de hace tres meses no dice nada de hoy.

import { useMemo, useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { master, type FilaMaster } from "@/lib/inventory/conteos-db";

const dias = (iso: string) =>
  Math.round((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);

export function MasterInventario({
  empresa, filtro, recarga = 0,
}: { empresa: string; filtro: string; recarga?: number }) {
  const carga = useCarga(`${empresa}:${recarga}`, () => master(empresa));
  const filas: FilaMaster[] = carga.datos ?? [];
  const [soloDiferencias, setSoloDiferencias] = useState(true);

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return filas
      .filter((f) => !t || f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t))
      // Por defecto solo lo que NO cuadra: con 4.303 productos, la lista
      // completa esconde justo lo que hay que mirar.
      .filter((f) => !soloDiferencias || (f.diferencia !== null && f.diferencia !== 0))
      .sort((a, b) => Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0));
  }, [filas, filtro, soloDiferencias]);

  const contados = filas.filter((f) => f.contado !== null).length;
  const conDiferencia = filas.filter((f) => f.diferencia !== null && f.diferencia !== 0).length;

  return (
    <SectionCard
      title="Master"
      description="Lo que dice Valery contra lo que alguien contó en el galpón."
      action={
        contados > 0
          ? <StatusBadge tone={conDiferencia > 0 ? "warn" : "ok"}>
              {conDiferencia > 0 ? `${conDiferencia} no cuadran` : "todo cuadra"}
            </StatusBadge>
          : undefined
      }
    >
      {carga.error && <p className="text-sm text-danger">{carga.error}</p>}

      {!carga.cargando && contados === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-text">Todavía nadie contó nada.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            El Master compara lo que dice Valery contra lo que hay de verdad en el
            galpón. Hasta que alguien cuente, solo hay una de las dos mitades.
          </p>
          <p className="mt-3 text-sm text-muted">
            {/* Sin indicación de dirección: en el teléfono la píldora queda a la
                izquierda, y decir «a la derecha» manda a mirar donde no está. */}
            Usá el botón <strong>Cargar conteo</strong>, arriba de esta tarjeta.
          </p>
        </div>
      )}

      {contados > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {contados.toLocaleString("es-VE")} de {filas.length.toLocaleString("es-VE")} productos contados
            </p>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={soloDiferencias}
                onChange={(e) => setSoloDiferencias(e.target.checked)}
                className="h-5 w-5 rounded border-border-strong"
              />
              Solo los que no cuadran
            </label>
          </div>

          {visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {soloDiferencias ? "Todo lo contado cuadra con Valery." : "Nada coincide con la búsqueda."}
            </p>
          ) : (
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2.5 pr-3 font-medium">Código</th>
                    <th className="py-2.5 pr-3 font-medium">Producto</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Valery</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Contado</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Diferencia</th>
                    <th className="py-2.5 font-medium">Contado el</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibles.slice(0, 300).map((f) => {
                    const d = f.diferencia;
                    const viejo = f.fechaConteo ? dias(f.fechaConteo) : 0;
                    return (
                      <tr key={f.codigo} className="hover:bg-surface-2">
                        <td className="py-2.5 pr-3 font-mono text-xs text-muted">{f.codigo}</td>
                        <td className="py-2.5 pr-3 text-text">{f.nombre}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{f.valery}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-text">
                          {f.contado ?? <span className="text-muted">sin contar</span>}
                        </td>
                        <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                          d === null ? "text-muted" : d === 0 ? "text-ok" : d < 0 ? "text-danger" : "text-warn"
                        }`}>
                          {/* El signo se escribe: el color solo no alcanza para
                              quien no distingue rojo de verde. */}
                          {d === null ? "—" : d > 0 ? `+${d}` : d}
                        </td>
                        <td className="py-2.5 text-xs text-muted">
                          {f.fechaConteo ?? "—"}
                          {f.fechaConteo && viejo > 30 && (
                            <span className="ml-1.5 text-warn">· hace {viejo} días</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibles.length > 300 && (
                <p className="py-2 text-center text-xs text-muted">
                  Mostrando 300 de {visibles.length}. Buscá para acotar.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
