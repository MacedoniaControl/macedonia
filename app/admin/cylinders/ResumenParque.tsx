"use client";

// Parque: cuantos cilindros son y donde estan.
//
// Es el resumen que la hoja "TOTAL GENERAL" del Excel queria dar y nunca dio:
// tenia los rotulos correctos y ni un numero, porque su unica formula apuntaba
// a una celda borrada. Aca los numeros salen de los movimientos, asi que el
// resumen se mantiene solo.

import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { saldos } from "@/lib/cilindros/cilindros-db";
import { resumirParque, type Parque } from "@/lib/cilindros/parque";

const n = (v: number) => v.toLocaleString("es-VE");

export function ResumenParque({ empresa, recarga }: { empresa: string; recarga: number }) {
  const carga = useCarga(`${empresa}:${recarga}`, () => saldos(empresa));
  return (
    <VistaParque
      parque={resumirParque(carga.datos ?? [])}
      cargando={carga.cargando}
      error={carga.error}
    />
  );
}

/** La vista, separada de la carga para poder verla con datos fijos. */
export function VistaParque({
  parque: p, cargando, error,
}: { parque: Parque; cargando: boolean; error?: string | null }) {
  const mayor = Math.max(1, ...p.porGas.map((g) => g.total));

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Parque total" value={n(p.total)} sub="cilindros de la empresa" accent />
        <StatCard label="En planta" value={n(p.enPlanta)} sub="llenos + vacios" />
        <StatCard label="Prestados" value={n(p.afuera)} sub="hay que recuperarlos" />
        <StatCard label="Gases" value={n(p.porGas.length)} sub="con parque" />
      </div>

      <SectionCard
        title="Donde esta el parque"
        description="Sale de los movimientos registrados, no de un conteo guardado."
      >
        <EstadoDatos
          cargando={cargando}
          error={error}
          vacio={p.sinDatos}
          mensajeVacio="Todavia no hay movimientos de cilindros. Da de alta el parque para empezar."
        >
          {/* En el telefono la tabla obligaba a arrastrar de lado para llegar
              al Total, que es justo el numero que se viene a buscar. Ahi va
              apilada; la tabla queda para pantallas donde entra completa. */}
          <ul className="grid gap-2 sm:hidden">
            {p.ubicaciones.map((u) => (
              <li key={u.id} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{u.descripcion}</p>
                  {u.llenos !== null && u.vacios !== null && (
                    <p className="text-xs tabular-nums text-muted">
                      {n(u.llenos)} llenos · {n(u.vacios)} vacios
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-base font-semibold tabular-nums text-text">{n(u.total)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 pt-1">
              <span className="text-sm font-semibold text-text">Parque completo</span>
              <span className="text-base font-semibold tabular-nums text-text">{n(p.total)}</span>
            </li>
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Descripcion</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Llenos</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Vacios</th>
                  <th scope="col" className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {p.ubicaciones.map((u) => (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium text-text">{u.descripcion}</td>
                    {[u.llenos, u.vacios].map((v, i) => (
                      <td key={i} className="py-2.5 pr-3 text-right tabular-nums text-text">
                        {/* Guion cuando el estado no distingue lleno de vacio.
                            Un cero ahi afirmaria algo que el dato no dice. */}
                        {v === null ? (
                          <span className="text-muted" title="El dato no distingue llenos de vacios">—</span>
                        ) : (
                          n(v)
                        )}
                      </td>
                    ))}
                    <td className="py-2.5 text-right font-semibold tabular-nums text-text">{n(u.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-2.5 pr-3 font-semibold text-text">Parque completo</td>
                  <td colSpan={2} />
                  <td className="py-2.5 text-right font-semibold tabular-nums text-text">{n(p.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </EstadoDatos>
      </SectionCard>

      <SectionCard title="Parque por gas" description="De mayor a menor.">
        <EstadoDatos
          cargando={cargando}
          error={error}
          vacio={p.porGas.length === 0}
          mensajeVacio="Ningun gas tiene cilindros registrados."
        >
          <ul className="grid gap-2.5">
            {p.porGas.map((g) => (
              <li key={g.gas} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-text">{g.gas}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-text">{n(g.total)}</span>
                </div>
                {/* La barra es decorativa: el numero ya esta escrito al lado.
                    El ancho es un estilo en linea porque Tailwind no puede ver
                    una clase armada en tiempo de ejecucion. */}
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(g.total / mayor) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </EstadoDatos>
      </SectionCard>
    </div>
  );
}
