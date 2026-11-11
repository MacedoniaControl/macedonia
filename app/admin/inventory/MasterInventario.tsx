"use client";

// Master: el inventario de Macedonia, con Valery al lado.
//
// Pedido del usuario (11-11-2026): el Master y «Contra Valery» eran dos
// pestañas que contaban la misma historia por separado. Ahora es una sola, con
// tres preguntas arriba (cada una con su número; tocarla muestra su lista) y
// una sola tabla debajo: existencia de Macedonia, lo que dice Valery, la
// diferencia y el último conteo. Las cuentas: lib/inventory/master-vista.ts.
//
// Valery (leerlo y verlo) es de Owner y Administrador, como todo lo del Puente.
// Nunca se muestra un 0 por un producto que nadie contó: dice «Sin conteo».

import { useEffect, useMemo, useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { AlertCard } from "@/components/ui/AlertCard";
import { TablePager } from "@/components/ui/TablePager";
import { master } from "@/lib/inventory/conteos-db";
import { compararInventarioValery, type LecturaComparacion } from "@/lib/inventory/comparar-valery-db";
import { pedirAlPuente } from "@/lib/valery/puente-db";
import { haceCuanto } from "@/lib/valery/puente";
import { filasDe, prepararMaster, resumirMaster, vistaInicial, DIAS_CONTEO_VIEJO, type FilaVista, type VistaMaster } from "@/lib/inventory/master-vista";
import { useTableView } from "@/lib/ux/use-table-view";
import { useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtUsd } from "@/lib/ux/format";
import { hoyISO } from "@/lib/ux/rango";

const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
const conSigno = (n: number) => (Math.abs(n) < 0.005 ? "0" : n > 0 ? `+${cant(n)}` : `−${cant(-n)}`);
const haceTexto = (d: number) => (d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`);

const NOMBRE_VISTA: Record<VistaMaster, string> = {
  contar: "Por contar", valery: "No cuadra con Valery", negativo: "En negativo", todo: "Todo el catálogo",
};
const EXPLICA: Record<VistaMaster, string> = {
  contar: `Con existencia y sin un conteo de los últimos ${DIAS_CONTEO_VIEJO} días. Arriba, lo que más vale: contarlo primero cubre la mayor parte del dinero.`,
  valery: "La existencia de Macedonia contra la última lectura de Valery. Arriba, lo que nada explica; al final, lo que ajustaron los conteos de Macedonia y Valery no tiene.",
  negativo: "Salió mercancía sin que se registrara su entrada. Falta cargar una entrada (en Valery llega sola) o contar cuánto hay de verdad.",
  todo: "Todo el catálogo: la existencia de Macedonia, lo que dice Valery y el último conteo.",
};

type Columna = { clave: string; titulo: string; derecha?: boolean };

export function MasterInventario({
  empresa, filtro, recarga = 0, onContar, gerencia = false,
}: { empresa: string; filtro: string; recarga?: number; onContar?: () => void; gerencia?: boolean }) {
  const carga = useCarga(`${empresa}:${recarga}`, () => master(empresa));

  // Valery: la última lectura del agente (solo gerencia). Mientras se lee, se pregunta cada 5 s.
  const [lectura, setLectura] = useState<LecturaComparacion | null>(null);
  const [recargaValery, setRecargaValery] = useState(0);
  const [pedida, setPedida] = useState<number | null>(null);
  const [errorValery, setErrorValery] = useState<string | null>(null);
  useEffect(() => {
    if (!gerencia) return;
    let vivo = true;
    compararInventarioValery(empresa).then((l) => { if (vivo) setLectura(l); });
    return () => { vivo = false; };
  }, [empresa, gerencia, recarga, recargaValery]);
  const ultimo = lectura?.ok ? lectura.ultimo : null;
  const leyendo = (ultimo !== null && (ultimo.estado === "pendiente" || ultimo.estado === "en_proceso"))
    || (pedida !== null && (ultimo === null || ultimo.id < pedida));
  useEffect(() => {
    if (!leyendo) return;
    const t = setInterval(() => setRecargaValery((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [leyendo]);
  async function leerValery() {
    setErrorValery(null);
    const r = await pedirAlPuente(empresa, "existencias");
    if (!r.ok) return setErrorValery(r.error);
    setPedida(r.id);
    setRecargaValery((n) => n + 1);
  }
  const comparacion = lectura?.ok && lectura.solicitud !== null ? lectura.comparacion : null;
  const falloValery = !leyendo && ultimo?.estado === "error" ? ultimo.error ?? "El agente no pudo leer la existencia." : null;

  const filas = useMemo(() => prepararMaster(carga.datos ?? [], hoyISO(), comparacion), [carga.datos, comparacion]);
  const r = useMemo(() => resumirMaster(filas), [filas]);
  const [elegida, setElegida] = useState<VistaMaster | null>(null);
  const vista: VistaMaster = elegida ?? vistaInicial(r);
  const lista = useMemo(() => filasDe(filas, vista, filtro), [filas, vista, filtro]);

  const columnas: Columna[] = [
    { clave: "producto", titulo: "Producto" },
    { clave: "existencia", titulo: "Existencia", derecha: true },
    ...(r.conValery ? [{ clave: "valery", titulo: "Valery", derecha: true }, { clave: "diferencia", titulo: "Diferencia", derecha: true }] : []),
    { clave: "conteo", titulo: "Último conteo" },
    ...(r.conCosto ? [{ clave: "valor", titulo: "Valor", derecha: true }] : []),
  ];
  const acc = useMemo(() => ({
    producto: (f: FilaVista) => f.nombre,
    existencia: (f: FilaVista) => f.existencia,
    valery: (f: FilaVista) => f.enValery ?? -Infinity,
    diferencia: (f: FilaVista) => Math.abs(f.difValery ?? 0),
    conteo: (f: FilaVista) => (f.hace === null ? Infinity : f.hace),
    valor: (f: FilaVista) => f.valor ?? -Infinity,
  }), []);
  const t = useTableView(lista, acc, 50);
  const elegir = (v: VistaMaster) => { setElegida(v); t.setPage(0); };

  useExportable(() => ({
    seccion: "Master",
    titulo: "Inventario Master",
    detalle: [
      `${NOMBRE_VISTA[vista]} (${cant(lista.length)})`,
      ...(filtro.trim() ? [`Búsqueda: «${filtro.trim()}»`] : []),
      `${cant(r.verificados)} de ${cant(r.conExistencia)} productos con existencia contados en los últimos ${DIAS_CONTEO_VIEJO} días`,
      ...(lectura?.ok && lectura.solicitud !== null && lectura.leidoEn ? [`Valery leído el ${fechaVista(lectura.leidoEn.slice(0, 10))}`] : []),
    ],
    columnas: [
      { titulo: "Código", tipo: "codigo" }, { titulo: "Producto" }, { titulo: "Unidad" }, { titulo: "Existencia", tipo: "num" },
      ...(r.conValery ? [{ titulo: "Valery", tipo: "num" as const }, { titulo: "Diferencia", tipo: "dif" as const }, { titulo: "Explicada por conteo" }] : []),
      { titulo: "Contado", tipo: "num" }, { titulo: "Contado el", tipo: "fecha" },
      ...(r.conCosto ? [{ titulo: "Valor", tipo: "usd" as const }] : []),
    ],
    filas: t.ordenadas.map((f) => [
      f.codigo, f.nombre, f.unidad || null, f.existencia,
      ...(r.conValery ? [f.enValery, f.difValery, f.porConteo ? "Sí" : null] : []),
      f.contado, fechaVista(f.fechaConteo),
      ...(r.conCosto ? [f.valor] : []),
    ]),
    nota: "Existencia: la de Macedonia. Diferencia = Macedonia − Valery; Valery vacío = el código no está en Valery. Contado vacío = sin conteo (no es cero).",
  }));

  if (carga.cargando) return <EstadoDatos cargando vacio={false}>{null}</EstadoDatos>;
  if (carga.error) return <AlertCard tone="danger" titulo="No se pudo leer el Master" mensaje={carga.error} />;

  if (r.vacio) {
    return (
      <section className="flex max-w-2xl flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted"><Icon name="inventory" size={24} /></span>
        <h2 className="text-lg font-semibold text-text">Todavía No Hay Existencia Cargada</h2>
        <p className="text-sm text-muted">
          Los {cant(r.total)} productos del catálogo están en cero: la existencia de esta empresa no se ha cargado y nadie ha contado todavía.
          Al cerrar el primer conteo, aquí vas a ver qué contar.
        </p>
        {onContar && <Button icon="plus" className="sumi-pulsable" onClick={onContar}>Iniciar Conteo</Button>}
      </section>
    );
  }

  const pctVerif = r.valorTotal ? (r.valorVerificado ?? 0) / r.valorTotal : r.conExistencia ? r.verificados / r.conExistencia : 0;
  const sinExplicar = r.distintas - r.porConteo;
  const grid = gridDe(columnas.length);

  return (
    <div className="space-y-4">
      {/* De dónde sale cada número, y los dos botones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          Existencia de Macedonia: la de ahora.
          {gerencia && (leyendo ? " Leyendo la existencia de Valery…"
            : lectura?.ok && lectura.solicitud !== null ? ` Valery leído ${lectura.leidoEn ? haceCuanto(lectura.leidoEn) : ""}.`
            : " Sin lectura de Valery todavía.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {gerencia && <Button variant="secondary" icon="import" onClick={leerValery} disabled={leyendo}>{leyendo ? "Leyendo…" : "Leer de Valery"}</Button>}
          {onContar && <Button icon="plus" className="sumi-pulsable" onClick={onContar}>Iniciar Conteo</Button>}
        </div>
      </div>
      {(errorValery || falloValery) && <p className="text-sm text-danger" role="alert">{errorValery ?? `La última lectura de Valery falló: ${falloValery}`}</p>}

      {/* Las tres preguntas */}
      <div role="tablist" aria-label="Qué mirar del inventario" className={`grid gap-3 ${gerencia ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <Pregunta activa={vista === "contar"} onClick={() => elegir("contar")} titulo="¿Qué hay que contar?"
          numero={cant(r.porContar)} texto={r.porContar === 1 ? "producto por contar" : "productos por contar"}>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.max(pctVerif * 100, pctVerif > 0 ? 1.5 : 0)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {cant(r.verificados)} de {cant(r.conExistencia)} con existencia, contados
            {r.valorTotal ? ` · ${pctVerif > 0 && pctVerif < 0.001 ? "menos de 0,1" : (pctVerif * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })}% del valor` : ""}
          </p>
        </Pregunta>
        {gerencia && (
          <Pregunta activa={vista === "valery"} onClick={() => elegir("valery")} titulo="¿Qué no cuadra con Valery?"
            numero={r.conValery ? cant(sinExplicar) : "—"} texto={!r.conValery ? "sin lectura de Valery" : sinExplicar === 1 ? "producto sin explicar" : "productos sin explicar"}
            tono={sinExplicar ? "warn" : undefined}>
            <p className="mt-3 text-xs text-muted">
              {!r.conValery ? "«Leer de Valery» trae su existencia para comparar."
                : r.distintas === 0 ? "Macedonia y Valery dicen lo mismo."
                : r.porConteo ? `Y ${cant(r.porConteo)} más que ajustaron los conteos de Macedonia.` : "Ninguna la explican los conteos."}
            </p>
          </Pregunta>
        )}
        <Pregunta activa={vista === "negativo"} onClick={() => elegir("negativo")} titulo="¿Qué está en negativo?"
          numero={cant(r.negativos)} texto={r.negativos === 1 ? "producto" : "productos"} tono={r.negativos ? "warn" : undefined}>
          <p className="mt-3 text-xs text-muted">{r.negativos ? "Salió sin que se registrara su entrada." : "Ninguno en negativo."}</p>
        </Pregunta>
      </div>

      {/* La lista de la pregunta elegida */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label={NOMBRE_VISTA[vista]}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <p className="max-w-3xl text-sm text-muted">{EXPLICA[vista]}</p>
          <button type="button" role="tab" aria-selected={vista === "todo"} onClick={() => elegir("todo")}
            className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition ${vista === "todo" ? "border-brand-strong bg-brand-soft text-brand" : "border-border text-muted hover:text-text"}`}>
            Todo el catálogo · {cant(r.total)}
          </button>
        </div>

        {lista.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {filtro.trim() ? `Nada coincide con «${filtro.trim()}» en esta lista.`
              : vista === "contar" ? "Todo lo que tiene existencia está contado y al día."
              : vista === "valery" ? (r.conValery ? "Macedonia y Valery dicen lo mismo." : "Todavía no se ha leído Valery: «Leer de Valery».")
              : vista === "negativo" ? "Ningún producto está en negativo."
              : "El catálogo está vacío."}
          </p>
        ) : (
          <>
            {/* Ordenar: la cabecera en pantalla ancha; un selector en el teléfono. */}
            <div className={`hidden gap-3 border-b border-border bg-surface-2 px-4 py-1.5 md:grid ${grid}`}>
              {columnas.map((c) => (
                <button key={c.clave} type="button" onClick={() => t.toggleSort(c.clave)} aria-label={`Ordenar por ${c.titulo}`}
                  className={`flex min-h-9 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-text ${c.derecha ? "justify-end" : ""}`}>
                  {c.titulo}
                  <span aria-hidden className="text-[10px]">{t.sortKey === c.clave ? (t.dir === "asc" ? "▲" : "▼") : ""}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 md:hidden">
              <label htmlFor="master-orden" className="text-xs text-muted">Ordenar</label>
              <select id="master-orden" className="sumi-campo sumi-campo--auto" value={t.sortKey ? `${t.sortKey}:${t.dir}` : ""}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":");
                  t.ordenar(k || null, d === "desc" ? "desc" : "asc");
                }}>
                <option value="">Lo que más urge</option>
                {columnas.flatMap((c) => [
                  <option key={`${c.clave}:asc`} value={`${c.clave}:asc`}>{c.titulo} ↑</option>,
                  <option key={`${c.clave}:desc`} value={`${c.clave}:desc`}>{c.titulo} ↓</option>,
                ])}
              </select>
            </div>
            <ul className="divide-y divide-border">
              {t.visible.map((f) => <Fila key={f.codigo} f={f} grid={grid} conValery={r.conValery} conCosto={r.conCosto} />)}
            </ul>
            <div className="border-t border-border px-4 py-2">
              <TablePager {...t} etiqueta="productos" />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Las columnas en pantalla ancha: el producto se lleva el espacio que sobre. */
function gridDe(n: number): string {
  return {
    3: "md:grid-cols-[minmax(0,1fr)_7rem_11rem]",
    4: "md:grid-cols-[minmax(0,1fr)_7rem_11rem_7rem]",
    5: "md:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_11rem]",
    6: "md:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_11rem_7rem]",
  }[n] ?? "md:grid-cols-[minmax(0,1fr)_7rem_11rem]";
}

function Pregunta({ activa, onClick, titulo, numero, texto, tono, children }: {
  activa: boolean; onClick: () => void; titulo: string; numero: string; texto: string; tono?: "warn"; children?: React.ReactNode;
}) {
  return (
    <button type="button" role="tab" aria-selected={activa} onClick={onClick}
      className={`sumi-pulsable rounded-2xl border-2 bg-surface p-4 text-left transition ${activa ? "border-brand" : "border-border hover:border-border-strong"}`}>
      <span className="block text-sm font-medium text-muted">{titulo}</span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className={`text-3xl font-semibold tabular-nums ${tono === "warn" ? "text-warn" : "text-text"}`}>{numero}</span>
        <span className="text-sm text-muted">{texto}</span>
      </span>
      {children}
    </button>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-wide text-muted md:hidden">{children} </span>;
}

function Fila({ f, grid, conValery, conCosto }: { f: FilaVista; grid: string; conValery: boolean; conCosto: boolean }) {
  const d = f.difValery;
  return (
    <li className={`grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-sm md:items-center ${grid}`}>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className="font-medium text-text [overflow-wrap:anywhere]">{f.nombre}</p>
        <p className="text-xs text-muted"><span className="font-mono">{f.codigo}</span>{f.unidad ? ` · ${f.unidad}` : ""}</p>
      </div>
      <div className="md:text-right">
        <Etiqueta>Existencia</Etiqueta>
        <span className={`font-semibold tabular-nums ${f.existencia < 0 ? "text-warn" : "text-text"}`}>{cant(f.existencia)}</span>
      </div>
      {conValery && (
        <>
          <div className="md:text-right">
            <Etiqueta>Valery</Etiqueta>
            {f.enValery === null
              ? <span className="text-xs text-muted" title="Valery no tiene este código">No está</span>
              : <span className="tabular-nums text-text">{cant(f.enValery)}</span>}
          </div>
          <div className="md:text-right">
            <Etiqueta>Diferencia</Etiqueta>
            {d === null || Math.abs(d) < 0.005 ? (
              <span className="text-muted">{d === null ? "—" : "Cuadra"}</span>
            ) : (
              // El signo va escrito: el color solo no alcanza para quien no distingue colores.
              <span className={`font-semibold tabular-nums ${f.porConteo ? "text-muted" : "text-warn"}`}>
                {conSigno(d)}
                {f.porConteo && <span className="ml-1 text-xs font-normal">· por conteo</span>}
              </span>
            )}
          </div>
        </>
      )}
      <div className={conValery ? "col-span-2 md:col-span-1" : ""}>
        <Etiqueta>Último conteo</Etiqueta>
        {f.contado === null ? (
          // Una etiqueta, no un número: nadie lo ha contado, que no es lo mismo que cero.
          <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-border">Sin conteo</span>
        ) : (
          <span className="tabular-nums text-text">
            {cant(f.contado)}{" "}
            <span className={f.viejo ? "text-warn" : "text-muted"} title={f.fechaConteo ? `Contado el ${fechaVista(f.fechaConteo)}` : undefined}>
              · {haceTexto(f.hace ?? 0)}{f.viejo ? " (viejo)" : ""}
            </span>
          </span>
        )}
      </div>
      {conCosto && (
        <div className="md:text-right">
          <Etiqueta>Valor</Etiqueta>
          <span className="tabular-nums text-text">{f.valor !== null ? fmtUsd(f.valor) : "—"}</span>
        </div>
      )}
    </li>
  );
}
