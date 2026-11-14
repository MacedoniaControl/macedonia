"use client";

// «Cómo se mueve»: los insights del Master (pedido del usuario, 14-11-2026:
// «que el inventario no solo sea para verificar existencia»).
//
// Nueve tarjetas, cada una una pregunta con su número, una frase y los tres
// primeros; «Ver los N» abre la lista entera con orden y páginas. Las cuentas
// están en lib/inventory/insights.ts. Se puede ocultar (queda recordado).

import { useMemo, useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { insightsInventario } from "@/lib/inventory/insights-db";
import { DIAS_DE_MAS, DIAS_SANO, DIAS_SE_ACABA, type Insights, type ItemInsight } from "@/lib/inventory/insights";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtUsd } from "@/lib/ux/format";
import { Modal } from "@/components/ui/Modal";
import { SortableTh } from "@/components/ui/SortableTh";
import { TablePager } from "@/components/ui/TablePager";
import { useTableView } from "@/lib/ux/use-table-view";

const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const pct = (p: number | null) => (p === null ? "—" : `${(p * 100).toLocaleString("es-VE", { maximumFractionDigits: p < 0.1 ? 1 : 0 })} %`);
const usd0 = (n: number) => fmtUsd(Math.round(n));
const dias = (n: number) => `${cant(n)} ${n === 1 ? "día" : "días"}`;

type Clave = "masVendido" | "rotacion" | "seAcaba" | "agotado" | "dormido" | "deMas" | "pareto" | "sube" | "baja" | "devoluciones";
type Col = { clave: string; titulo: string; num?: boolean; valor: (i: ItemInsight) => string | number; ver: (i: ItemInsight) => string };

export function InsightsInventario({ empresa, recarga = 0 }: { empresa: string; recarga?: number }) {
  const [abierto, setAbierto] = usePersistedState(`master:insights:${empresa}`, true);
  const carga = useCarga(`insights:${empresa}:${recarga}`, () => insightsInventario(empresa));
  const [lista, setLista] = useState<{ clave: Clave; titulo: string } | null>(null);
  const r = carga.datos && carga.datos.ok ? carga.datos.insights : null;
  const error = carga.datos && !carga.datos.ok ? carga.datos.error : carga.error;

  return (
    <section aria-labelledby="insights-titulo" className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h2 id="insights-titulo" className="text-base font-semibold text-text">Cómo se mueve</h2>
          <p className="text-xs text-muted">
            {r ? `Ventas de Valery del ${fechaVista(r.desde)} al ${fechaVista(r.hoy)} (${r.diasVentana} días)${r.diasVentana < 30 ? `: el inventario sigue a Valery desde el ${fechaVista(r.inicioDatos)}` : ""}. ${r.conMontos ? "En dólares, sin IVA." : "En unidades."}`
              : "Lo que más se vende, lo que rota, lo que se acaba y lo que no se mueve."}
          </p>
        </div>
        <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-controls="insights-cuerpo"
          className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium text-muted transition hover:text-text">
          {abierto ? "Ocultar" : "Mostrar"}
        </button>
      </header>

      {abierto && (
        <div id="insights-cuerpo" className="border-t border-border p-4">
          {carga.cargando && !r ? (
            <p className="py-6 text-center text-sm text-muted" role="status">Calculando…</p>
          ) : error ? (
            <p className="text-sm text-danger" role="alert">{error}</p>
          ) : r ? (
            <Tarjetas r={r} abrir={(clave, titulo) => setLista({ clave, titulo })} />
          ) : null}
        </div>
      )}

      {lista && r && <Lista r={r} clave={lista.clave} titulo={lista.titulo} onCerrar={() => setLista(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------- las tarjetas

function Tarjetas({ r, abrir }: { r: Insights; abrir: (c: Clave, t: string) => void }) {
  const vendido = (i: ItemInsight) => (r.conMontos ? usd0(i.ventaUsd ?? 0) : `${cant(i.unidades)} ${i.unidad}`.trim());
  const total = r.conMontos ? usd0(r.totalVendido) : cant(r.totalVendido);
  const rotan = r.rotacion.filter((i) => (i.rotacion ?? 0) >= 1).length;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Tarjeta titulo="¿Qué es lo que más se vende?" numero={total} texto={r.conMontos ? "vendidos" : "unidades vendidas"}
        frase={r.productosConVenta ? `En ${cant(r.productosConVenta)} productos distintos.` : "Ninguna venta en estos días."}
        items={r.masVendido} detalle={(i) => `${vendido(i)} · ${pct(i.parte)}`} abrir={() => abrir("masVendido", "Lo que más se vende")} />

      <Tarjeta titulo="¿Qué rota más?" numero={cant(rotan)} texto={rotan === 1 ? "producto rota" : "productos rotan"}
        frase={`Salió más de lo que hay hoy en ${r.diasVentana} días: se repone seguido.`}
        items={r.rotacion} detalle={(i) => `${cant(i.rotacion ?? 0)} veces`} abrir={() => abrir("rotacion", "Lo que más rota")} />

      <Tarjeta titulo="¿Qué se acaba pronto?" numero={cant(r.seAcaba.length)} texto={r.seAcaba.length === 1 ? "producto" : "productos"} tono={r.seAcaba.length ? "warn" : undefined}
        frase={r.seAcaba.length ? `Al ritmo de venta les quedan menos de ${DIAS_SE_ACABA} días: hay que pedir.` : `Nada se acaba en los próximos ${DIAS_SE_ACABA} días.`}
        items={r.seAcaba} detalle={(i) => `${dias(i.cobertura ?? 0)} · quedan ${cant(i.existencia)}`} abrir={() => abrir("seAcaba", "Se acaba pronto")} />

      <Tarjeta titulo="¿Qué se pide y no hay?" numero={cant(r.agotado.length)} texto={r.agotado.length === 1 ? "producto agotado" : "productos agotados"} tono={r.agotado.length ? "danger" : undefined}
        frase={r.agotado.length ? `Sin existencia, y salieron ${r.conMontos ? usd0(r.agotadoVendido) : `${cant(r.agotadoVendido)} unidades`} en estos días. Falta su entrada o reponer.` : "Todo lo que se vende tiene existencia."}
        items={r.agotado} detalle={(i) => `salieron ${cant(i.salidas)} · hay ${cant(i.existencia)}`} abrir={() => abrir("agotado", "Se pide y no hay")} />

      <Tarjeta titulo="¿Qué no se vende?" numero={cant(r.dormido.length)} texto={r.dormido.length === 1 ? "producto dormido" : "productos dormidos"}
        frase={`Con existencia y sin una sola venta desde el ${fechaVista(r.inicioDatos)}${r.dormidoValor !== null ? `: ${usd0(r.dormidoValor)} parados, a costo.` : "."}`}
        items={r.dormido} detalle={(i) => (i.valor !== null ? `${usd0(i.valor)} · ${cant(i.existencia)}` : `hay ${cant(i.existencia)}`)} abrir={() => abrir("dormido", "Lo que no se vende")} />

      <Tarjeta titulo="¿De qué hay de más?" numero={cant(r.deMas.length)} texto={r.deMas.length === 1 ? "producto" : "productos"}
        frase={r.deMas.length ? `Más de ${DIAS_DE_MAS} días de inventario al ritmo de venta${r.deMasSobra !== null ? `: ${usd0(r.deMasSobra)} sobre ${DIAS_SANO} días de venta, a costo` : ""}.` : `Nada pasa de ${DIAS_DE_MAS} días de inventario.`}
        items={r.deMas} detalle={(i) => dias(i.cobertura ?? 0)} abrir={() => abrir("deMas", "Hay de más")} />

      <Tarjeta titulo="¿Dónde está la venta?" numero={`${cant(r.pareto.length)} de ${cant(r.productosConVenta)}`} texto="productos"
        frase={r.pareto.length ? "hacen el 80 % de lo vendido: que nunca falten." : "Sin ventas para medirlo."}
        items={r.pareto} detalle={(i) => pct(i.parte)} abrir={() => abrir("pareto", "Los que hacen el 80 % de la venta")} />

      <article className="flex min-w-0 flex-col rounded-xl border border-border bg-surface-2/40 p-4">
        <h3 className="text-sm font-medium text-muted">¿Qué sube y qué baja?</h3>
        {!r.conTendencia ? (
          <p className="mt-2 text-sm text-muted">Hace falta un mes de ventas en el inventario para comparar dos quincenas. Hay {cant(r.diasConDatos)} días.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">Últimos 15 días contra los 15 anteriores.</p>
            <MiniLista titulo="Sube" items={r.sube} detalle={(i) => signo(i.cambio ?? 0, r.conMontos)} tono="ok" />
            <MiniLista titulo="Baja" items={r.baja} detalle={(i) => signo(i.cambio ?? 0, r.conMontos)} tono="warn" />
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              <VerTodos n={r.sube.length} onClick={() => abrir("sube", "Lo que sube")} etiqueta="Ver lo que sube" />
              <VerTodos n={r.baja.length} onClick={() => abrir("baja", "Lo que baja")} etiqueta="Ver lo que baja" />
            </div>
          </>
        )}
      </article>

      <Tarjeta titulo="¿Qué se devuelve?" numero={r.conMontos ? usd0(r.totalDevuelto) : cant(r.totalDevuelto)} texto={r.conMontos ? "devueltos" : "unidades devueltas"}
        frase={r.devoluciones.length ? `En ${cant(r.devoluciones.length)} productos: lo devuelto y de cuánto se vendió en estos días (una devolución puede ser de una venta anterior).` : "Nada se devolvió en estos días."}
        items={r.devoluciones} detalle={(i) => (r.conMontos ? `${usd0(i.devueltoUsd ?? 0)} · ${cant(i.devueltas)} de ${cant(i.brutas)}` : `${cant(i.devueltas)} de ${cant(i.brutas)}`)} abrir={() => abrir("devoluciones", "Lo que se devuelve")} />
    </div>
  );
}

const signo = (n: number, usd: boolean) => `${n > 0 ? "+" : "−"}${usd ? usd0(Math.abs(n)) : cant(Math.abs(n))}`;

function Tarjeta({ titulo, numero, texto, frase, items, detalle, abrir, tono }: {
  titulo: string; numero: string; texto: string; frase: string; items: ItemInsight[];
  detalle: (i: ItemInsight) => string; abrir: () => void; tono?: "warn" | "danger";
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-surface-2/40 p-4">
      <h3 className="text-sm font-medium text-muted">{titulo}</h3>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-2xl font-semibold tabular-nums ${tono === "danger" ? "text-danger" : tono === "warn" ? "text-warn" : "text-text"}`}>{numero}</span>
        <span className="text-sm text-muted">{texto}</span>
      </p>
      <p className="mt-1 text-xs text-muted">{frase}</p>
      {items.length > 0 && (
        <ol className="mt-3 space-y-1.5 text-sm">
          {items.slice(0, 3).map((i) => (
            <li key={i.codigo} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-text" title={`${i.nombre} · ${i.codigo}`}>{i.nombre}</span>
              <span className="shrink-0 tabular-nums text-muted">{detalle(i)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-auto pt-3"><VerTodos n={items.length} onClick={abrir} /></div>
    </article>
  );
}

function MiniLista({ titulo, items, detalle, tono }: { titulo: string; items: ItemInsight[]; detalle: (i: ItemInsight) => string; tono: "ok" | "warn" }) {
  return (
    <div className="mt-3">
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${tono === "ok" ? "text-ok" : "text-warn"}`}>{titulo}</p>
      {items.length === 0 ? <p className="text-sm text-muted">Nada.</p> : (
        <ol className="mt-1 space-y-1.5 text-sm">
          {items.slice(0, 3).map((i) => (
            <li key={i.codigo} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-text" title={`${i.nombre} · ${i.codigo}`}>{i.nombre}</span>
              <span className="shrink-0 tabular-nums text-muted">{detalle(i)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function VerTodos({ n, onClick, etiqueta }: { n: number; onClick: () => void; etiqueta?: string }) {
  if (n === 0) return null;
  return (
    <button type="button" onClick={onClick}
      className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand">
      {etiqueta ?? (n <= 3 ? "Ver detalle" : `Ver los ${n.toLocaleString("es-VE")}`)}
    </button>
  );
}

// ---------------------------------------------------------------- la lista entera

function Lista({ r, clave, titulo, onCerrar }: { r: Insights; clave: Clave; titulo: string; onCerrar: () => void }) {
  const filas = r[clave];
  const columnas: Col[] = useMemo(() => {
    const vend: Col = r.conMontos
      ? { clave: "venta", titulo: "Vendido", num: true, valor: (i) => i.ventaUsd ?? 0, ver: (i) => usd0(i.ventaUsd ?? 0) }
      : { clave: "venta", titulo: "Vendido", num: true, valor: (i) => i.unidades, ver: (i) => cant(i.unidades) };
    const base: Col[] = [
      { clave: "producto", titulo: "Producto", valor: (i) => i.nombre, ver: (i) => i.nombre },
      { clave: "existencia", titulo: "Hay", num: true, valor: (i) => i.existencia, ver: (i) => cant(i.existencia) },
    ];
    const salidas: Col = { clave: "salidas", titulo: "Salió", num: true, valor: (i) => i.salidas, ver: (i) => cant(i.salidas) };
    const cobertura: Col = { clave: "cobertura", titulo: "Días de inventario", num: true, valor: (i) => i.cobertura ?? Infinity, ver: (i) => (i.cobertura === null ? "—" : cant(i.cobertura)) };
    const ultima: Col = { clave: "ultima", titulo: "Última venta", valor: (i) => i.ultimaVenta ?? "", ver: (i) => (i.ultimaVenta ? fechaVista(i.ultimaVenta) ?? "—" : "Ninguna") };
    const valor: Col[] = r.conCosto ? [{ clave: "valor", titulo: "Valor a costo", num: true, valor: (i) => i.valor ?? -1, ver: (i) => (i.valor === null ? "—" : usd0(i.valor)) }] : [];
    const parte: Col = { clave: "parte", titulo: "Parte", num: true, valor: (i) => i.parte ?? 0, ver: (i) => pct(i.parte) };
    switch (clave) {
      case "masVendido": case "pareto": return [...base, vend, parte, salidas, cobertura];
      case "rotacion": return [...base, salidas, { clave: "rotacion", titulo: "Rotación", num: true, valor: (i) => i.rotacion ?? 0, ver: (i) => `${cant(i.rotacion ?? 0)} veces` }, cobertura];
      case "seAcaba": return [...base, salidas, cobertura, vend];
      case "agotado": return [...base, salidas, vend, ultima];
      case "dormido": return [...base, ...valor, ultima];
      case "deMas": return [...base, salidas, cobertura, ...(r.conCosto ? [{ clave: "sobra", titulo: `Sobre ${DIAS_SANO} días`, num: true, valor: (i: ItemInsight) => i.sobra ?? -1, ver: (i: ItemInsight) => (i.sobra === null ? "—" : usd0(i.sobra)) }] : []), ...valor];
      case "sube": case "baja": return [...base, vend, { clave: "cambio", titulo: "Cambio", num: true, valor: (i) => i.cambio ?? 0, ver: (i) => signo(i.cambio ?? 0, r.conMontos) }];
      case "devoluciones": return [...base,
        { clave: "brutas", titulo: "Vendido (antes de devolver)", num: true, valor: (i) => i.brutas, ver: (i) => cant(i.brutas) },
        { clave: "devueltas", titulo: "Devuelto", num: true, valor: (i) => i.devueltas, ver: (i) => cant(i.devueltas) },
        ...(r.conMontos ? [{ clave: "devueltoUsd", titulo: "Devuelto US$", num: true, valor: (i: ItemInsight) => i.devueltoUsd ?? 0, ver: (i: ItemInsight) => usd0(i.devueltoUsd ?? 0) }] : [])];
    }
  }, [clave, r.conMontos, r.conCosto]);
  const accesos = useMemo(() => Object.fromEntries(columnas.map((c) => [c.clave, c.valor])), [columnas]);
  const t = useTableView(filas, accesos, 25);

  return (
    <Modal titulo={`${titulo} · ${filas.length.toLocaleString("es-VE")}`} onCerrar={onCerrar} ancho="max-w-4xl">
      <div className="sumi-scroll max-h-[60vh] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
            <tr>{columnas.map((c) => <SortableTh key={c.clave} label={c.titulo} sortKey={c.clave} align={c.num ? "right" : "left"} ariaSort={t.ariaSort} onSort={t.toggleSort} compacto />)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.visible.map((i) => (
              <tr key={i.codigo}>
                {columnas.map((c) => (
                  <td key={c.clave} className={`px-3 py-2 ${c.num ? "text-right tabular-nums" : ""}`}>
                    {c.clave === "producto" ? (
                      <>
                        <span className="block text-text [overflow-wrap:anywhere]">{i.nombre}</span>
                        <span className="block font-mono text-xs text-muted">{i.codigo}{i.unidad ? ` · ${i.unidad}` : ""}</span>
                      </>
                    ) : c.ver(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager desde={t.desde} hasta={t.hasta} total={t.total} page={t.page} pages={t.pages} size={t.size} setPage={t.setPage} setSize={t.setSize} etiqueta="productos" />
    </Modal>
  );
}
