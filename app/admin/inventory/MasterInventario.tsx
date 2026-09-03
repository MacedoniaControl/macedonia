"use client";

// Master: lo que dice el papel contra lo que alguien contó.
//
// Antes comparaba `existencia` contra `existencia_fisica`, y las DOS salían del
// kardex. Con eso el Master no podía detectar lo que se fue sin registrarse —
// que es exactamente la razón por la que este producto existe (ver PRODUCT.md).
//
// Ahora una columna es Valery y la otra es un conteo humano, con su fecha.
// Sin fecha el número engaña: un conteo de hace tres meses no dice nada de hoy.
//
// Mientras nadie cuente, el Master YA muestra el lado de Valery con el manual
// en cero. Antes escondía la tabla entera hasta el primer conteo, y esconder la
// mitad que sí existe no la vuelve más cierta: la vuelve invisible.
//
// La existencia de Valery viene del kardex de ventas 2023-2026. Las compras no
// traen detalle por producto, así que no hay entradas que las compensen y todo
// producto vendido queda en negativo. Ese número es cierto -salió esa cantidad
// sin que se registrara su ingreso- pero un negativo suelto se lee como un
// error del sistema, así que va rotulado.

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

  const contados = filas.filter((f) => f.contado !== null).length;
  const conDiferencia = filas.filter((f) => f.diferencia !== null && f.diferencia !== 0).length;
  const sinEntrada = filas.filter((f) => f.valery < 0).length;

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return filas
      .filter((f) => !t || f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t))
      // Por defecto solo lo que NO cuadra: con 4.303 productos, la lista
      // completa esconde justo lo que hay que mirar.
      // Con cero conteos no hay diferencias que aislar, y el filtro dejaria la
      // tabla vacia justo cuando lo unico que hay para ver es Valery.
      .filter((f) => !soloDiferencias || contados === 0 || (f.diferencia !== null && f.diferencia !== 0))
      .sort((a, b) => Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0));
  }, [filas, filtro, soloDiferencias, contados]);

  const consolidado = useMemo(
    () => filas.reduce(
      (a, f) => ({ valery: a.valery + f.valery, contado: a.contado + (f.contado ?? 0) }),
      { valery: 0, contado: 0 },
    ),
    [filas],
  );
  const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 2 });

  return (
    <SectionCard
      title="Master"
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
        <p className="mb-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Nadie ha contado todavía, así que la columna <strong>Contado</strong> va
          en cero y no hay diferencias que calcular. Lo que ves es el lado de
          Valery. Cargá un conteo con el botón <strong>Cargar conteo</strong>.
        </p>
      )}

      {sinEntrada > 0 && (
        <p className="mb-3 rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-xs text-warn">
          {num(sinEntrada)} productos salieron sin que se registrara su entrada: el
          kardex trae las ventas 2023-2026, pero las compras de Valery no traen
          detalle por producto. Por eso Valery marca negativo. Contá el producto y
          el número queda corregido.
        </p>
      )}

      {!carga.cargando && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {contados.toLocaleString("es-VE")} de {filas.length.toLocaleString("es-VE")} productos contados
            </p>
            <label className={`flex min-h-11 items-center gap-2 text-sm ${contados === 0 ? "text-muted/50" : "text-muted"}`}>
              <input
                type="checkbox"
                checked={soloDiferencias}
                disabled={contados === 0}
                onChange={(e) => setSoloDiferencias(e.target.checked)}
                className="h-5 w-5 rounded border-border-strong"
              />
              Solo los que no cuadran
            </label>
          </div>

          {visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {soloDiferencias && contados > 0 ? "Todo lo contado cuadra con Valery." : "Nada coincide con la búsqueda."}
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
                    <th className="py-2.5 pr-3 font-medium">Estado</th>
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
                          {f.contado ?? <span className="text-muted">0</span>}
                        </td>
                        <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                          d === null ? "text-muted" : d === 0 ? "text-ok" : d < 0 ? "text-danger" : "text-warn"
                        }`}>
                          {/* El signo se escribe: el color solo no alcanza para
                              quien no distingue rojo de verde. */}
                          {d === null ? "—" : d > 0 ? `+${d}` : d}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">
                          {/* Un negativo suelto se lee como error del sistema.
                              Rotulado dice lo que de verdad pasó. */}
                          {f.valery < 0 ? (
                            <StatusBadge tone="warn">Despacho sin entrada registrada</StatusBadge>
                          ) : f.contado === null ? (
                            <span className="text-muted">Sin contar</span>
                          ) : (
                            <StatusBadge tone={f.diferencia === 0 ? "ok" : "warn"}>
                              {f.diferencia === 0 ? "Cuadra" : "No cuadra"}
                            </StatusBadge>
                          )}
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
                {/* Consolidado de las dos mitades. Suma TODO el catalogo, no solo
                    lo visible: un total que cambia con el filtro no es un total. */}
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2.5 pr-3 font-semibold text-text" colSpan={2}>
                      Consolidado · {num(filas.length)} productos
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-text">{num(consolidado.valery)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-text">{num(consolidado.contado)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-text">
                      {contados === 0 ? <span className="text-muted">—</span> : num(consolidado.contado - consolidado.valery)}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted" colSpan={2}>
                      {num(contados)} de {num(filas.length)} contados
                    </td>
                  </tr>
                </tfoot>
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
