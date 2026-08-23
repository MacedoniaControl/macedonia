"use client";

// Inventario Master, simplificado a DOS cifras (decisión de Greeg, 2026-08-22).
//
// Antes eran tres —V de Valery, S de Macedonia, M de maestro— porque no había
// un kardex que distinguiera lo que movió mercancía de verdad de lo que solo
// cuadraba papeles. Ahora el kardex lo distingue con `afecta_inventario_real`, y
// con dos cifras alcanza:
//
//   FÍSICO REAL   lo que hay en el almacén. Solo movimientos que movieron algo.
//   FISCAL        lo que dicen los papeles. Incluye las regularizaciones.
//
// Y la diferencia entre ambas NO es un error: es exactamente la mercancía que
// salió antes de existir fiscalmente, que es el problema que este sistema
// existe para hacer visible.

import { useMemo } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { existencias, type Existencia } from "@/lib/inventory/movimientos-db";

type Fila = Existencia & { diferencia: number };

export function MasterInventario({ empresa, filtro }: { empresa: string; filtro: string }) {
  const carga = useCarga(empresa, () => existencias(empresa));
  const datos: Existencia[] = carga.datos ?? [];
  const error = carga.error;
  const listo = !carga.cargando;

  const filas: Fila[] = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return datos
      .map((d) => ({ ...d, diferencia: d.existencia - d.existenciaFisica }))
      .filter((d) => !t || d.codigo.toLowerCase().includes(t))
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.codigo.localeCompare(b.codigo));
  }, [datos, filtro]);

  const totFisico = filas.reduce((a, f) => a + f.existenciaFisica, 0);
  const totFiscal = filas.reduce((a, f) => a + f.existencia, 0);
  const porRegularizar = filas.filter((f) => f.diferencia !== 0);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Físico real</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-text">{totFisico.toLocaleString("es-VE")}</p>
          <p className="mt-0.5 text-xs text-muted">unidades en almacén</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Fiscal</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-text">{totFiscal.toLocaleString("es-VE")}</p>
          <p className="mt-0.5 text-xs text-muted">según los papeles</p>
        </div>
        <div className={`rounded-2xl border p-4 ${porRegularizar.length ? "border-warn/40 bg-warn/5" : "border-border bg-surface"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Por regularizar</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${porRegularizar.length ? "text-warn" : "text-text"}`}>
            {porRegularizar.length}
          </p>
          <p className="mt-0.5 text-xs text-muted">códigos con diferencia</p>
        </div>
      </div>

      <SectionCard
        title="Físico real contra fiscal"
        description="La diferencia no es un error: es mercancía que salió antes de existir en los papeles."
      >
        {error && <p className="text-sm text-danger">{error}</p>}

        {!error && listo && filas.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Todavía no hay movimientos registrados. La existencia se construye a medida que se
            registran entradas y salidas.
          </p>
        )}

        {filas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 text-right font-medium">Físico real</th>
                  <th className="py-2 pr-3 text-right font-medium">Fiscal</th>
                  <th className="py-2 pr-3 text-right font-medium">Diferencia</th>
                  <th className="py-2 font-medium">Situación</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 100).map((f) => (
                  <tr key={f.codigo} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-mono text-xs text-text">{f.codigo}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text">{f.existenciaFisica}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{f.existencia}</td>
                    <td className={`py-2.5 pr-3 text-right font-medium tabular-nums ${f.diferencia === 0 ? "text-muted" : "text-warn"}`}>
                      {f.diferencia === 0 ? "—" : f.diferencia > 0 ? `+${f.diferencia}` : f.diferencia}
                    </td>
                    <td className="py-2.5">
                      {f.diferencia === 0 ? (
                        <StatusBadge tone="ok">Cuadra</StatusBadge>
                      ) : f.diferencia < 0 ? (
                        <StatusBadge tone="warn">Salió sin factura</StatusBadge>
                      ) : (
                        <StatusBadge tone="info">Factura sin salida</StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > 100 && (
              <p className="pt-3 text-xs text-muted">
                Mostrando los 100 con mayor diferencia, de {filas.length.toLocaleString("es-VE")}.
                Usa el buscador para acotar.
              </p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
