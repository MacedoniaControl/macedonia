"use client";

// "Descargar": la vista que se esta mirando, en Excel o en PDF.
//
// Reemplaza a "Exportar CSV", que bajaba siempre la lista de Valery sin
// importar la pestaña, y sin decir de que empresa ni de que dia era.

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSesion } from "@/components/auth/SesionProvider";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { useRegistroExportar } from "@/lib/ux/exportar";
import { ahoraCaracas, FILAS_PDF_AVISO, FILAS_POR_PAGINA, nombreArchivo, type TablaExport } from "@/lib/ux/tabla-export";

type Formato = "xlsx" | "pdf";

export function BotonDescargar({ empresa }: { empresa: string }) {
  const registro = useRegistroExportar();
  const sesion = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [tabla, setTabla] = useState<TablaExport | null>(null);
  const [yendo, setYendo] = useState<Formato | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emp = isEmpresaId(empresa) ? EMPRESAS[empresa] : null;

  function abrir() {
    // La tabla se arma al abrir: es la de la pestaña de este momento.
    setTabla(registro?.armar() ?? null);
    setError(null);
    setAbierto((v) => !v);
  }

  async function bajar(formato: Formato) {
    if (!tabla || !emp) return;
    setYendo(formato); setError(null);
    try {
      const { fecha, fechaHora } = ahoraCaracas();
      const meta = { empresa: emp.nombre, rif: emp.rif, generado: fechaHora, por: sesion?.nombre ?? "—" };
      const arch = await import("@/lib/ux/tabla-archivos");
      const blob = formato === "xlsx" ? await arch.tablaExcel(tabla, meta) : await arch.tablaPdf(tabla, meta);
      arch.descargarBlob(blob, nombreArchivo(tabla, emp.nombreCorto, fecha, formato));
      setAbierto(false);
    } catch (e) {
      setError(`No se pudo generar el archivo: ${(e as Error).message}`);
    } finally {
      setYendo(null);
    }
  }

  const filas = tabla?.filas.length ?? 0;
  const paginas = Math.ceil(filas / FILAS_POR_PAGINA);

  return (
    <div className="relative">
      <button type="button" onClick={abrir} aria-haspopup="menu" aria-expanded={abierto}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-sm font-medium text-text transition hover:bg-surface-2 active:scale-[0.972]">
        <Icon name="report" size={16} />
        Descargar
        <Icon name="chevronDown" size={14} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => !yendo && setAbierto(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-2 shadow-xl">
            {!tabla ? (
              <p className="px-2 py-3 text-sm text-muted">Esta vista no tiene una tabla para descargar todavía.</p>
            ) : (
              <>
                <div className="px-2 pb-2 pt-1">
                  <p className="text-sm font-semibold text-text">{tabla.titulo}</p>
                  <p className="text-xs text-muted">
                    {filas.toLocaleString("es-VE")} fila(s){tabla.detalle.length ? ` · ${tabla.detalle[0]}` : ""}
                  </p>
                </div>
                {([["xlsx", "Excel (.xlsx)", "Para filtrar, sumar y seguir trabajando"], ["pdf", "PDF", "Para imprimir o enviar"]] as const).map(([f, t, s]) => (
                  <button key={f} type="button" role="menuitem" disabled={!!yendo || filas === 0} onClick={() => bajar(f)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2 disabled:opacity-60">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${f === "xlsx" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
                      {f === "xlsx" ? "XLS" : "PDF"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{yendo === f ? "Generando…" : t}</span>
                      <span className="block text-xs text-muted">{s}</span>
                    </span>
                  </button>
                ))}
                {filas === 0 && <p className="px-2 pb-1 text-xs text-muted">No hay filas en esta vista.</p>}
                {filas > FILAS_PDF_AVISO && (
                  <p className="mx-2 mb-1 rounded-lg bg-warn/10 px-2 py-1.5 text-xs text-warn">
                    El PDF tendría unas {paginas.toLocaleString("es-VE")} páginas y puede tardar. Para tantas filas conviene Excel, o filtrar antes.
                  </p>
                )}
                {error && <p role="alert" className="mx-2 mb-1 rounded-lg bg-danger/10 px-2 py-1.5 text-xs text-danger">{error}</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
