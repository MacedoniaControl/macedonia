"use client";

// Inventario contra Valery (pedido del Owner, 2026-11-05: «compara y después
// cierra la brecha»). Valery es la fuente: aquí solo se mira. Cada diferencia
// dice cuánto explican los conteos de Macedonia; lo demás queda «sin explicar».
// Las cuentas: lib/inventory/comparar-valery.ts.

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { TablePager } from "@/components/ui/TablePager";
import { useTableView } from "@/lib/ux/use-table-view";
import { useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";
import { haceCuanto } from "@/lib/valery/puente";
import { pedirAlPuente } from "@/lib/valery/puente-db";
import { compararInventarioValery, type LecturaComparacion } from "@/lib/inventory/comparar-valery-db";
import type { FilaComparacion } from "@/lib/inventory/comparar-valery";

type Vista = "sin_explicar" | "distintas" | "no_en_valery" | "todas";
const VISTAS: [Vista, string][] = [["sin_explicar", "Sin explicar"], ["distintas", "Distintas"], ["no_en_valery", "No están en Valery"], ["todas", "Todas"]];
const MARGEN = 0.005;
const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
const conSigno = (n: number) => (Math.abs(n) < MARGEN ? "0" : n > 0 ? `+${cant(n)}` : `−${cant(-n)}`);

export function CompararValery({ empresa, filtro }: { empresa: string; filtro: string }) {
  const [lectura, setLectura] = useState<LecturaComparacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("sin_explicar");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    compararInventarioValery(empresa).then((l) => { if (vivo) setLectura(l); });
    return () => { vivo = false; };
  }, [empresa, recarga]);

  // Mientras el agente lee (el último pedido sigue pendiente), se pregunta cada 5 s.
  const [pedida, setPedida] = useState<number | null>(null);
  const ultimo = lectura?.ok ? lectura.ultimo : null;
  const enCamino = (ultimo !== null && (ultimo.estado === "pendiente" || ultimo.estado === "en_proceso"))
    || (pedida !== null && (ultimo === null || ultimo.id < pedida));
  const fallo = ultimo?.estado === "error" ? ultimo.error ?? "El agente no pudo leer la existencia." : null;
  useEffect(() => {
    if (!enCamino) return;
    const t = setInterval(() => setRecarga((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [enCamino]);

  async function leer() {
    setError(null);
    const r = await pedirAlPuente(empresa, "existencias");
    if (!r.ok) return setError(r.error);
    setPedida(r.id);
    setRecarga((n) => n + 1);
  }

  const comp = lectura?.ok && lectura.solicitud !== null ? lectura.comparacion : null;
  const filas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (comp?.filas ?? []).filter((f) =>
      (vista === "todas" || (vista === "distintas" && Math.abs(f.diferencia) >= MARGEN)
        || (vista === "sin_explicar" && Math.abs(f.sinExplicar) >= MARGEN) || (vista === "no_en_valery" && f.valery === null))
      && (!q || f.codigo.toLowerCase().includes(q) || f.nombre.toLowerCase().includes(q)));
  }, [comp, vista, filtro]);

  const acc = useMemo(() => ({
    codigo: (f: FilaComparacion) => f.codigo, nombre: (f: FilaComparacion) => f.nombre,
    macedonia: (f: FilaComparacion) => f.macedonia, valery: (f: FilaComparacion) => f.valery ?? -Infinity,
    diferencia: (f: FilaComparacion) => Math.abs(f.diferencia), conteos: (f: FilaComparacion) => f.conteos,
    sinExplicar: (f: FilaComparacion) => Math.abs(f.sinExplicar),
  }), []);
  const t = useTableView(filas, acc, 50);

  useExportable(() => ({
    seccion: "Inventario contra Valery",
    titulo: "Inventario: Macedonia contra Valery",
    detalle: [
      VISTAS.find(([v]) => v === vista)?.[1] ?? "",
      ...(lectura?.ok && lectura.solicitud !== null && lectura.leidoEn ? [`Valery leído el ${fechaVista(lectura.leidoEn.slice(0, 10))}`] : []),
    ],
    columnas: [
      { titulo: "Código", tipo: "codigo" }, { titulo: "Producto" }, { titulo: "Macedonia", tipo: "num" }, { titulo: "Valery", tipo: "num" },
      { titulo: "Diferencia", tipo: "dif" }, { titulo: "Conteos en Macedonia", tipo: "dif" }, { titulo: "Sin explicar", tipo: "dif" },
    ],
    filas: t.ordenadas.map((f) => [f.codigo, f.nombre, f.macedonia, f.valery, f.diferencia, f.conteos, f.sinExplicar]),
    nota: "Diferencia = Macedonia − Valery. «Conteos en Macedonia»: lo que movieron los conteos físicos desde el corte. Valery vacío: el código no está en Valery.",
  }));

  if (!lectura) return <p className="text-sm text-muted" role="status">Cargando…</p>;
  if (!lectura.ok) return <p className="text-sm text-danger" role="alert">{lectura.error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          {enCamino ? "Leyendo la existencia de Valery…"
            : lectura.solicitud !== null ? `Valery leído ${lectura.leidoEn ? haceCuanto(lectura.leidoEn) : ""}. Macedonia: el kardex de ahora.`
            : "Todavía no se ha leído la existencia de Valery."}
        </p>
        <Button onClick={leer} disabled={enCamino}>{enCamino ? "Leyendo…" : "Leer de Valery"}</Button>
      </div>
      {(error || (!enCamino && fallo)) && <p className="text-sm text-danger" role="alert">{error ?? `La última lectura falló: ${fallo}`}</p>}

      {!comp ? (
        <EmptyState icon="inventory" title="Sin lectura de Valery" message="«Leer de Valery» le pide al agente la existencia de cada producto para compararla con la de Macedonia." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Coinciden" value={comp.coinciden.toLocaleString("es-VE")} sub={`de ${comp.productos.toLocaleString("es-VE")} productos`} />
            <StatCard label="Distintas" value={comp.distintas.toLocaleString("es-VE")} sub="Macedonia no dice lo mismo que Valery" />
            <StatCard label="Por conteos" value={comp.porConteo.toLocaleString("es-VE")} sub="La diferencia es lo que ajustaron los conteos de Macedonia" />
            <StatCard label="Sin explicar" value={(comp.distintas - comp.porConteo).toLocaleString("es-VE")} sub="Hay que revisarlas o contarlas" accent />
          </div>

          <div className="sumi-tabs flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="group" aria-label="Qué mostrar">
            {VISTAS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={vista === v} onClick={() => { setVista(v); t.setPage(0); }}
                className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition ${vista === v ? "bg-brand-strong text-white" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
                {l}
              </button>
            ))}
          </div>

          {filas.length === 0 ? (
            <EmptyState icon="check" title="Nada que mostrar" message={vista === "sin_explicar" ? "Todas las diferencias las explican los conteos de Macedonia." : "Ningún producto en esta vista."} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <SortableTh label="Código" sortKey="codigo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                      <SortableTh label="Producto" sortKey="nombre" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                      <SortableTh label="Macedonia" sortKey="macedonia" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                      <SortableTh label="Valery" sortKey="valery" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                      <SortableTh label="Diferencia" sortKey="diferencia" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                      <SortableTh label="Conteos" sortKey="conteos" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                      <SortableTh label="Sin explicar" sortKey="sinExplicar" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {t.visible.map((f) => (
                      <tr key={f.codigo} className="hover:bg-surface-2">
                        <td className="py-2.5 pr-3 font-mono text-xs text-muted">{f.codigo}</td>
                        <td className="py-2.5 pr-3 text-text">{f.nombre}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-text">{cant(f.macedonia)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-text">{f.valery === null ? <span className="text-muted" title="El código no está en Valery">—</span> : cant(f.valery)}</td>
                        <td className={`py-2.5 pr-3 text-right tabular-nums ${Math.abs(f.diferencia) < MARGEN ? "text-muted" : "font-medium text-text"}`}>{conSigno(f.diferencia)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{conSigno(f.conteos)}</td>
                        <td className={`py-2.5 text-right tabular-nums ${Math.abs(f.sinExplicar) < MARGEN ? "text-muted" : "font-medium text-warn"}`}>{conSigno(f.sinExplicar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePager {...t} etiqueta="productos" />
            </>
          )}
          <p className="text-xs text-muted">
            Diferencia = Macedonia − Valery. «Conteos»: lo que movieron los conteos físicos de Macedonia desde el corte
            {lectura.solicitud !== null && lectura.corte ? ` (${fechaVista(lectura.corte)})` : ""}; si un conteo no se registró también en Valery, la diferencia es esa.
            Valery es la fuente: aquí no se cambia ningún número.
          </p>
        </>
      )}
    </div>
  );
}
