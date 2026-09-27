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
import { useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";

// Cuatro filtros con su cantidad, para que siempre se vea qué hay. Antes era
// una casilla «Solo los que no cuadran» marcada de fábrica: con un solo
// producto contado y cuadrando, la tabla quedaba vacía y la etiqueta decía
// «todo cuadra» aunque faltaran 2.207 por contar y 49 estuvieran en negativo.
type Filtro = "nocuadran" | "negativo" | "sincontar" | "todos";
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "nocuadran", label: "No cuadran" },
  { id: "negativo", label: "En negativo" },
  { id: "sincontar", label: "Sin contar" },
  { id: "todos", label: "Todos" },
];

const dias = (iso: string) =>
  Math.round((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);

export function MasterInventario({
  empresa, filtro, recarga = 0,
}: { empresa: string; filtro: string; recarga?: number }) {
  const carga = useCarga(`${empresa}:${recarga}`, () => master(empresa));
  const filas: FilaMaster[] = carga.datos ?? [];
  const [elegido, setElegido] = useState<Filtro | null>(null);

  const contados = filas.filter((f) => f.contado !== null).length;
  const conDiferencia = filas.filter((f) => f.diferencia !== null && f.diferencia !== 0).length;
  const sinEntrada = filas.filter((f) => f.valery < 0).length;
  const cuantos: Record<Filtro, number> = {
    nocuadran: conDiferencia, negativo: sinEntrada, sincontar: filas.length - contados, todos: filas.length,
  };
  // Sin elegir: lo que no cuadra; si no hay, lo que está en negativo (lo que
  // más urge contar); si tampoco, todo.
  const vista: Filtro = elegido ?? (conDiferencia > 0 ? "nocuadran" : sinEntrada > 0 ? "negativo" : "todos");

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    const entra: Record<Filtro, (f: FilaMaster) => boolean> = {
      nocuadran: (f) => f.diferencia !== null && f.diferencia !== 0,
      negativo: (f) => f.valery < 0,
      sincontar: (f) => f.contado === null,
      todos: () => true,
    };
    const orden: Record<Filtro, (a: FilaMaster, b: FilaMaster) => number> = {
      nocuadran: (a, b) => Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0),
      negativo: (a, b) => a.valery - b.valery,
      sincontar: (a, b) => a.codigo.localeCompare(b.codigo),
      todos: (a, b) => Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0) || a.codigo.localeCompare(b.codigo),
    };
    return filas
      .filter((f) => !t || f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t))
      .filter(entra[vista])
      .sort(orden[vista]);
  }, [filas, filtro, vista]);

  const consolidado = useMemo(
    () => filas.reduce(
      (a, f) => ({ valery: a.valery + f.valery, contado: a.contado + (f.contado ?? 0) }),
      { valery: 0, contado: 0 },
    ),
    [filas],
  );
  const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 2 });

  // Lo mismo que la tabla, pero TODAS las filas del filtro (la pantalla corta
  // en 300). El consolidado es el de todo el catalogo, como abajo.
  useExportable(() => ({
    seccion: "Master",
    titulo: "Inventario Master",
    detalle: [
      `Filtro: ${FILTROS.find((x) => x.id === vista)?.label} (${num(visibles.length)})`,
      ...(filtro.trim() ? [`Búsqueda: «${filtro.trim()}»`] : []),
      vista === "negativo" ? "Ordenado del más negativo al menos" : vista === "sincontar" ? "Ordenado por código" : "Ordenado por diferencia, de mayor a menor",
      `${contados.toLocaleString("es-VE")} de ${filas.length.toLocaleString("es-VE")} productos contados`,
    ],
    columnas: [
      { titulo: "Código", tipo: "codigo" }, { titulo: "Producto" }, { titulo: "Valery", tipo: "num" },
      { titulo: "Contado", tipo: "num" }, { titulo: "Diferencia", tipo: "dif" }, { titulo: "Estado" }, { titulo: "Contado el", tipo: "fecha" },
    ],
    filas: visibles.map((f) => [
      f.codigo, f.nombre, f.valery, f.contado, f.diferencia, estadoMaster(f), fechaVista(f.fechaConteo),
    ]),
    totales: [
      "", `Consolidado · ${num(filas.length)} productos`, consolidado.valery, consolidado.contado,
      contados === 0 ? null : consolidado.contado - consolidado.valery, `${num(contados)} contados`, "",
    ],
    nota: "El consolidado suma todo el catálogo, no solo las filas de este filtro. Valery en negativo: salió mercancía sin que se registrara su entrada.",
  }));

  return (
    <SectionCard
      title="Master"
      action={
        !carga.cargando && (
          <StatusBadge tone={contados === 0 ? "muted" : conDiferencia > 0 ? "warn" : "ok"}>
            {contados === 0
              ? "Sin conteos"
              : `${num(contados)} de ${num(filas.length)} contados · ${conDiferencia > 0 ? `${num(conDiferencia)} no cuadran` : "cuadra"}`}
          </StatusBadge>
        )
      }
    >
      {carga.error && <p className="text-sm text-danger">{carga.error}</p>}

      {!carga.cargando && (
        <>
          <div role="tablist" aria-label="Qué mostrar" className="sumi-scroll -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FILTROS.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={vista === x.id} onClick={() => setElegido(x.id)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition ${
                  vista === x.id ? "bg-brand-strong text-white" : "border border-border text-muted hover:text-text"}`}>
                {x.label}
                <span className={`rounded-md px-1.5 text-xs tabular-nums ${vista === x.id ? "bg-white/20" : "bg-surface-2"}`}>{num(cuantos[x.id])}</span>
              </button>
            ))}
          </div>

          {vista === "negativo" && visibles.length > 0 && (
            <p className="mb-3 text-xs text-muted">
              Salió mercancía sin que se registrara su entrada, por eso Valery los marca en negativo. Al contarlos, la existencia se corrige.
            </p>
          )}

          {visibles.length === 0 ? (
            <div className="space-y-3 py-8 text-center text-sm text-muted">
              <p>
                {filtro.trim()
                  ? "Nada coincide con la búsqueda en este filtro."
                  : vista === "nocuadran"
                    ? (contados === 0 ? "Todavía no se contó ningún producto." : `Todo lo contado cuadra con Valery (${num(contados)} producto${contados === 1 ? "" : "s"}).`)
                    : vista === "negativo" ? "Ningún producto está en negativo."
                    : vista === "sincontar" ? "Ya se contaron todos los productos."
                    : "No hay productos en el catálogo."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {vista !== "negativo" && sinEntrada > 0 && (
                  <button type="button" onClick={() => setElegido("negativo")}
                    className="min-h-10 rounded-xl border border-border px-3 text-sm font-medium text-text hover:bg-surface-2">
                    Ver en negativo ({num(sinEntrada)})
                  </button>
                )}
                {vista !== "todos" && (
                  <button type="button" onClick={() => setElegido("todos")}
                    className="min-h-10 rounded-xl border border-border px-3 text-sm font-medium text-text hover:bg-surface-2">
                    Ver todos ({num(filas.length)})
                  </button>
                )}
              </div>
            </div>
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
                    <th className="whitespace-nowrap py-2.5 font-medium">Contado el</th>
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
                            <span title="Salió mercancía sin que se registrara su entrada" className="whitespace-nowrap">
                              <StatusBadge tone="warn">Sin entrada</StatusBadge>
                            </span>
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
                  Mostrando 300 de {visibles.length}. Busca para acotar.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** El estado de una fila, con las mismas palabras que la pantalla. */
function estadoMaster(f: FilaMaster): string {
  if (f.valery < 0) return "Sin entrada registrada";
  if (f.contado === null) return "Sin contar";
  return f.diferencia === 0 ? "Cuadra" : "No cuadra";
}
