"use client";

// Master: lo que dice el sistema (Valery) contra lo que alguien contó.
//
// Rediseño del 13-10-2026 (pedido del usuario: «no tiene lógica»). El de antes
// era una tabla con cuatro filtros que mezclaban tres preguntas distintas y
// ponía «0» en Contado cuando nadie había contado. Ahora arriba hay tres
// preguntas, cada una con su número, y tocar una muestra su lista:
//
//   ¿Qué hay que contar?      con existencia y sin conteo vigente, lo que más vale primero;
//   ¿Qué falta o sobra?       lo contado que no cuadra, en unidades y en dinero;
//   ¿Qué está mal en Valery?  existencia negativa: salidas sin su entrada.
//
// Y «Todo el catálogo», que absorbe la vieja pestaña Valery. Nunca se muestra
// un 0 por un producto que nadie contó: la columna «Macedonia» (lo contado en
// los conteos de Macedonia, pedido del 14-10-2026) dice «Sin Conteo». Tampoco se suman
// unidades de productos distintos (no significa nada); los totales van en
// dinero, para quien puede ver costos. Las cuentas: lib/inventory/master-vista.ts.

import { useMemo, useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { AlertCard } from "@/components/ui/AlertCard";
import { master } from "@/lib/inventory/conteos-db";
import { filasDe, prepararMaster, resumirMaster, vistaInicial, DIAS_CONTEO_VIEJO, type FilaVista, type VistaMaster } from "@/lib/inventory/master-vista";
import { useExportable } from "@/lib/ux/exportar";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtUsd } from "@/lib/ux/format";
import { hoyISO } from "@/lib/ux/rango";

const PAGINA = 100;
const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const conSigno = (n: number) => (n > 0 ? `+${cant(n)}` : n < 0 ? `−${cant(-n)}` : "0");
const usdSigno = (n: number) => (n > 0 ? `+${fmtUsd(n)}` : n < 0 ? `−${fmtUsd(-n)}` : fmtUsd(0));
const haceTexto = (d: number) => (d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`);

const EXPLICA: Record<VistaMaster, string> = {
  contar: `Productos con existencia que nadie ha contado, o cuyo último conteo tiene más de ${DIAS_CONTEO_VIEJO} días. Arriba, los que más valen: contarlos primero cubre la mayor parte del dinero.`,
  diferencias: "Lo que se contó y no cuadra con el sistema. Arriba, lo que más pesa.",
  valery: "Valery los tiene en negativo porque salió mercancía sin que se registrara su entrada. Se corrige en Valery cargando la entrada; contarlos dice cuánto hay de verdad.",
  todo: "Todo el catálogo con la existencia del sistema y lo último que se contó en Macedonia.",
};

export function MasterInventario({
  empresa, filtro, recarga = 0, onContar,
}: { empresa: string; filtro: string; recarga?: number; onContar?: () => void }) {
  const carga = useCarga(`${empresa}:${recarga}`, () => master(empresa));
  const filas = useMemo(() => prepararMaster(carga.datos ?? [], hoyISO()), [carga.datos]);
  const r = useMemo(() => resumirMaster(filas), [filas]);
  const [elegida, setElegida] = useState<VistaMaster | null>(null);
  const [cuantas, setCuantas] = useState(PAGINA);
  const vista: VistaMaster = elegida ?? vistaInicial(r);
  const lista = useMemo(() => filasDe(filas, vista, filtro), [filas, vista, filtro]);
  const elegir = (v: VistaMaster) => { setElegida(v); setCuantas(PAGINA); };

  useExportable(() => ({
    seccion: "Master",
    titulo: "Inventario Master",
    detalle: [
      { contar: "Por contar", diferencias: "Diferencias", valery: "Revisar en Valery", todo: "Todo el catálogo" }[vista] + ` (${cant(lista.length)})`,
      ...(filtro.trim() ? [`Búsqueda: «${filtro.trim()}»`] : []),
      `${cant(r.verificados)} de ${cant(r.conExistencia)} productos con existencia verificados`,
    ],
    columnas: [
      { titulo: "Código", tipo: "codigo" }, { titulo: "Producto" }, { titulo: "Unidad" }, { titulo: "Sistema", tipo: "num" },
      { titulo: "Macedonia", tipo: "num" }, { titulo: "Contado el", tipo: "fecha" }, { titulo: "Diferencia", tipo: "dif" },
      ...(r.conCosto ? [{ titulo: "Valor en sistema", tipo: "usd" as const }, { titulo: "Diferencia $", tipo: "usd" as const }] : []),
    ],
    filas: lista.map((f) => [
      f.codigo, f.nombre, f.unidad || null, f.valery, f.contado, fechaVista(f.fechaConteo), f.diferencia,
      ...(r.conCosto ? [f.valor, f.difValor] : []),
    ]),
    nota: "Macedonia vacío = sin conteo (no es cero). Sistema en negativo: salió mercancía sin que se registrara su entrada en Valery.",
  }));

  if (carga.cargando) return <EstadoDatos cargando vacio={false}>{null}</EstadoDatos>;
  if (carga.error) return <AlertCard tone="danger" titulo="No se pudo leer el Master" mensaje={carga.error} />;

  if (r.vacio) {
    return (
      <section className="flex max-w-2xl flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted"><Icon name="inventory" size={24} /></span>
        <h2 className="text-lg font-semibold text-text">Todavía No Hay Existencia Cargada</h2>
        <p className="text-sm text-muted">
          Los {cant(r.total)} productos del catálogo están en cero porque la existencia de Valery de esta empresa no se ha cargado, y nadie ha contado
          todavía. Cuando se cargue, o al cerrar el primer conteo, aquí vas a ver qué contar y qué no cuadra.
        </p>
        {onContar && <Button icon="plus" className="sumi-pulsable" onClick={onContar}>Iniciar Conteo</Button>}
      </section>
    );
  }

  const pctVerif = r.valorTotal ? (r.valorVerificado ?? 0) / r.valorTotal : r.conExistencia ? r.verificados / r.conExistencia : 0;
  const visibles = lista.slice(0, cuantas);

  return (
    <div className="space-y-4">
      {/* Las tres preguntas */}
      <div role="tablist" aria-label="Qué mirar del inventario" className="grid gap-3 md:grid-cols-3">
        <Pregunta activa={vista === "contar"} onClick={() => elegir("contar")} titulo="¿Qué hay que contar?"
          numero={cant(r.porContar)} texto={r.porContar === 1 ? "producto por contar" : "productos por contar"}>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.max(pctVerif * 100, pctVerif > 0 ? 1.5 : 0)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {cant(r.verificados)} de {cant(r.conExistencia)} con existencia verificados
            {r.valorTotal ? ` · ${pctVerif > 0 && pctVerif < 0.001 ? "menos de 0,1" : (pctVerif * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })}% del valor` : ""}
          </p>
        </Pregunta>
        <Pregunta activa={vista === "diferencias"} onClick={() => elegir("diferencias")} titulo="¿Qué falta o sobra?"
          numero={cant(r.diferencias)} texto={r.diferencias === 1 ? "producto no cuadra" : "productos no cuadran"} tono={r.diferencias ? "warn" : undefined}>
          <p className="mt-3 text-xs text-muted">
            {r.diferencias === 0
              ? (r.verificados ? "Todo lo contado cuadra con el sistema." : "Todavía no hay conteos para comparar.")
              : r.faltante !== null
                ? `Faltan ${fmtUsd(r.faltante)} · sobran ${fmtUsd(r.sobrante ?? 0)}`
                : `Faltan ${cant(r.faltanteUnidades)} und. · sobran ${cant(r.sobranteUnidades)} und.`}
          </p>
        </Pregunta>
        <Pregunta activa={vista === "valery"} onClick={() => elegir("valery")} titulo="¿Qué está mal en Valery?"
          numero={cant(r.negativos)} texto={r.negativos === 1 ? "producto en negativo" : "productos en negativo"} tono={r.negativos ? "warn" : undefined}>
          <p className="mt-3 text-xs text-muted">{r.negativos ? "Salidas sin su entrada registrada." : "Ninguno en negativo."}</p>
        </Pregunta>
      </div>

      {/* La lista de la pregunta elegida */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Productos">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <p className="max-w-3xl text-sm text-muted">{EXPLICA[vista]}</p>
          <div className="flex flex-wrap items-center gap-2">
            {vista === "contar" && onContar && r.porContar > 0 && <Button icon="plus" className="sumi-pulsable" onClick={onContar}>Iniciar Conteo</Button>}
            <button type="button" role="tab" aria-selected={vista === "todo"} onClick={() => elegir("todo")}
              className={`min-h-10 rounded-xl border px-3 text-sm font-medium transition ${vista === "todo" ? "border-brand-strong bg-brand-soft text-brand" : "border-border text-muted hover:text-text"}`}>
              Todo el catálogo · {cant(r.total)}
            </button>
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {filtro.trim() ? `Nada coincide con «${filtro.trim()}» en esta lista.`
              : vista === "contar" ? "Todo lo que tiene existencia está contado y al día."
              : vista === "diferencias" ? (r.verificados ? "Todo lo contado cuadra con el sistema." : "Todavía no hay conteos. Cuando se cierre uno, aquí aparece lo que no cuadre.")
              : vista === "valery" ? "Ningún producto está en negativo en Valery."
              : "El catálogo está vacío."}
          </p>
        ) : (
          <>
            <div className={`hidden gap-3 border-b border-border bg-surface-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted md:grid ${columnas(vista, r.conCosto)}`}>
              <span>Producto</span><span className="text-right">Sistema</span><span>Macedonia</span>
              {ultimaCol(vista, r.conCosto) && <span className="text-right">{ultimaCol(vista, r.conCosto)}</span>}
            </div>
            <ul className="divide-y divide-border">
              {visibles.map((f) => <Fila key={f.codigo} f={f} vista={vista} conCosto={r.conCosto} />)}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-4 py-2.5 text-xs text-muted">
              <span>{cant(visibles.length)} de {cant(lista.length)}</span>
              {lista.length > cuantas && (
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => setCuantas((n) => n + PAGINA)}>
                  Ver {cant(Math.min(PAGINA, lista.length - cuantas))} más
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
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

/** La última columna depende de la pregunta: el valor para contar, la diferencia para lo demás. */
function ultimaCol(vista: VistaMaster, conCosto: boolean): string | null {
  if (vista === "contar") return conCosto ? "Valor en sistema" : null;
  if (vista === "valery") return null;
  return "Diferencia";
}
function columnas(vista: VistaMaster, conCosto: boolean) {
  return ultimaCol(vista, conCosto) ? "md:grid-cols-[minmax(0,1fr)_7rem_12rem_10rem]" : "md:grid-cols-[minmax(0,1fr)_7rem_12rem]";
}

function Fila({ f, vista, conCosto }: { f: FilaVista; vista: VistaMaster; conCosto: boolean }) {
  const ultima = ultimaCol(vista, conCosto);
  const d = f.diferencia;
  return (
    <li className={`grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-sm md:items-center ${columnas(vista, conCosto)}`}>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className="font-medium text-text [overflow-wrap:anywhere]">{f.nombre}</p>
        <p className="text-xs text-muted"><span className="font-mono">{f.codigo}</span>{f.unidad ? ` · ${f.unidad}` : ""}</p>
      </div>
      <div className="md:text-right">
        <span className="text-[11px] uppercase tracking-wide text-muted md:hidden">Sistema </span>
        <span className={`font-semibold tabular-nums ${f.valery < 0 ? "text-warn" : "text-text"}`}>{cant(f.valery)}</span>
        {f.valery < 0 && <span className="sr-only"> (negativo en Valery)</span>}
      </div>
      <div>
        <span className="text-[11px] uppercase tracking-wide text-muted md:hidden">Macedonia </span>
        {f.contado === null ? (
          // Una etiqueta, no un número: nadie lo ha contado, que no es lo mismo que cero.
          <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-border">Sin Conteo</span>
        ) : (
          <span className="tabular-nums text-text">
            {cant(f.contado)}{" "}
            <span className={f.viejo ? "text-warn" : "text-muted"} title={f.fechaConteo ? `Contado el ${fechaVista(f.fechaConteo)}` : undefined}>
              · {haceTexto(f.hace ?? 0)}{f.viejo ? " (viejo)" : ""}
            </span>
          </span>
        )}
      </div>
      {ultima && (
        <div className="col-span-2 md:col-span-1 md:text-right">
          <span className="text-[11px] uppercase tracking-wide text-muted md:hidden">{ultima} </span>
          {vista === "contar" ? (
            <span className="tabular-nums text-text">{f.valor !== null ? fmtUsd(f.valor) : "—"}</span>
          ) : d === null ? (
            <span className="text-muted">—</span>
          ) : (
            // El signo va escrito: el color solo no alcanza para quien no distingue rojo de verde.
            <span className={`font-semibold tabular-nums ${d === 0 ? "text-ok" : d < 0 ? "text-danger" : "text-warn"}`}>
              {d === 0 ? "Cuadra" : conSigno(d)}
              {d !== 0 && f.difValor !== null && <span className="ml-1 text-xs font-normal">· {usdSigno(f.difValor)}</span>}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
