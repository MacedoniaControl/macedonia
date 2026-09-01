"use client";

// Ventas externas: las que hacen vendedores que ofrecen los productos por su
// cuenta y los venden.
//
// Se llamaba «Ventas internas», que era justo lo contrario de lo que son.
// Vive dentro de Cotizaciones porque es una forma de vender, no un departamento
// aparte: el vendedor externo cotiza igual que cualquiera.

import { SectionCard } from "@/components/ui/SectionCard";
import { useCarga } from "@/lib/ux/use-carga";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarDocumentos, type DocumentoGuardado } from "@/lib/documentos/documentos-db";
import { fmtUsd } from "@/lib/ux/format";

export function VentasExternas() {
  const empresa = useEmpresaActiva();
  const carga = useCarga(empresa, () => listarDocumentos(empresa, "cotizacion", 100));
  const docs: DocumentoGuardado[] = carga.datos ?? [];

  const total = docs.reduce((a, d) => a + d.total, 0);

  return (
    <SectionCard
      title="Ventas externas"
      description="Cotizaciones hechas por vendedores que no son del personal."
    >
      {/* Mientras `documentos.vendedor_externo` no exista, no hay forma de
          separarlas: se avisa en vez de presentar todas como externas. */}
      <p className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
        Se están mostrando todas las cotizaciones. Para separar las externas falta
        la columna <code className="font-mono">vendedor_externo</code> en la base.
      </p>
      {carga.error && <p className="text-sm text-danger">{carga.error}</p>}

      {!carga.cargando && docs.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Todavía no hay ventas externas registradas. Aparecen aquí a medida que los
          vendedores generan sus presupuestos.
        </p>
      )}

      {docs.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted">
            {docs.length} documento(s) · <strong className="text-text">{fmtUsd(total)}</strong>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">N°</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{d.correlativo}</td>
                    <td className="py-2.5 pr-3 text-muted">{d.fecha}</td>
                    <td className="py-2.5 pr-3 text-text">{d.cliente}</td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-text">
                      {fmtUsd(d.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}
