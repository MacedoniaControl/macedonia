"use client";

// El reporte del Dashboard por día, semana, mes o año: ventas de Valery, lo
// que se movió en sus cuentas por cobrar y por pagar, y lo que se hizo en
// Macedonia. Cada bloque aparece solo si quien mira puede ver esa sección
// (null en el reporte = no se muestra; nunca un cero que no es cierto).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { SortableTh } from "@/components/ui/SortableTh";
import { TablePager } from "@/components/ui/TablePager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { useCarga } from "@/lib/ux/use-carga";
import { useTableView } from "@/lib/ux/use-table-view";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtBs, fmtUsd } from "@/lib/ux/format";
import { haceCuanto } from "@/lib/valery/puente";
import { horaVista } from "@/lib/valery/ventas";
import {
  claseMov, etiquetaPeriodo, moverPeriodo, rangoDe, resumirMovs,
  type Cartera, type FilaSerie, type GrupoMov, type MovValery, type Periodo,
} from "@/lib/reporte/reporte-dia";
import { actualizarReporteDesdeValery, reportePeriodo, type ReportePeriodo as Reporte } from "@/lib/reporte/reporte-dia-db";

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const chip = "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors";
const chipActivo = "border-brand-strong bg-brand-soft text-brand";
const chipQuieto = "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text";
const n = (x: number) => x.toLocaleString("es-VE");
/** Una lectura de Valery que llega a hoy se vuelve a pedir sola si tiene más de una hora. */
const VIEJA_MS = 60 * 60_000;
const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "dia", label: "Día" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mes" }, { id: "anio", label: "Año" },
];
const TITULO: Record<Periodo, string> = { dia: "Reporte del día", semana: "Reporte de la semana", mes: "Reporte del mes", anio: "Reporte del año" };

export function ReporteDia({ empresa }: { empresa: string }) {
  return <ProveedorExportar><Reporte_ empresa={empresa} /></ProveedorExportar>;
}

function Reporte_({ empresa }: { empresa: string }) {
  const hoy = hoyCaracas();
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  // Una fecha dentro del período que se mira; el período sale de ella.
  const [ref, setRef] = useState(hoy);
  const { desde, hasta } = rangoDe(periodo, ref, hoy);
  const [vuelta, setVuelta] = useState(0);
  const clave = `${empresa}:${periodo}:${desde}:${hasta}`;
  const carga = useCarga(`reporte:${clave}:${vuelta}`, () => reportePeriodo(empresa, periodo, desde, hasta));
  // Mientras se refresca, se sigue viendo lo último que llegó (no parpadea).
  const [ultimo, setUltimo] = useState<Reporte | null>(null);
  if (carga.datos && carga.datos !== ultimo) setUltimo(carga.datos);
  const r = carga.datos ?? (ultimo && ultimo.periodo === periodo && ultimo.desde === desde && ultimo.hasta === hasta ? ultimo : null);
  const [yendo, setYendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const v = r?.valery ?? null;
  // Mientras el agente trae lo pedido, se mira cada 5 s.
  useEffect(() => {
    if (!v?.enCurso) return;
    const t = setInterval(() => setVuelta((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [v?.enCurso]);

  async function leerDeValery() {
    setMsg(null); setYendo(true);
    const res = await actualizarReporteDesdeValery(empresa, desde, hasta);
    setYendo(false);
    if (!res.ok) setMsg(res.error);
    setVuelta((x) => x + 1);
  }

  // Sola, una vez por período mirado: si no hay lectura que lo cubra, o si
  // llega a hoy y la que hay tiene más de una hora. Lo pasado no cambia: con
  // una lectura basta.
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    if (!v || !v.agenteListo || !v.conectado || v.enCurso) return;
    if (pedidas.current.has(clave)) return;
    const vieja = !v.lecturaMovimientos?.terminadoEn
      || (hasta === hoy && Date.now() - Date.parse(v.lecturaMovimientos.terminadoEn) > VIEJA_MS);
    if (!vieja) return;
    pedidas.current.add(clave);
    void actualizarReporteDesdeValery(empresa, desde, hasta).then(() => setVuelta((x) => x + 1));
  }, [v, clave, empresa, desde, hasta, hoy]);

  const siguiente = moverPeriodo(periodo, ref, 1);
  const haySiguiente = rangoDe(periodo, siguiente, hoy).desde <= hoy;
  return (
    <SectionCard title={TITULO[periodo]} description={`${etiquetaPeriodo(periodo, desde, hasta)[0].toUpperCase()}${etiquetaPeriodo(periodo, desde, hasta).slice(1)}: ventas y cuentas en Valery, y lo que se hizo en Macedonia.`}>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button key={p.id} type="button" className={`${chip} ${periodo === p.id ? chipActivo : chipQuieto}`} aria-pressed={periodo === p.id}
            onClick={() => setPeriodo(p.id)}>{p.label}</button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text hover:bg-surface-2"
          aria-label="Período anterior" onClick={() => setRef(moverPeriodo(periodo, ref, -1))}>
          <span className="rotate-180" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="sr-only">Fecha dentro del período</span>
          <input type="date" className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
            value={ref > hoy ? hoy : ref} max={hoy} onChange={(e) => e.target.value && setRef(e.target.value)} />
        </label>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Período siguiente" disabled={!haySiguiente} onClick={() => setRef(siguiente)}>
          <Icon name="chevronRight" size={16} />
        </button>
        {ref !== hoy && <button type="button" className={`${chip} ${chipQuieto}`} onClick={() => setRef(hoy)}>Hoy</button>}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {v && (
          <Button variant="secondary" icon="import" cargando={yendo || v.enCurso} textoCargando="Leyendo Valery…" onClick={leerDeValery}
            disabled={!v.agenteListo}>Leer de Valery</Button>
        )}
        <BotonDescargar empresa={empresa} />
      </div>
      {v && !v.agenteListo && <p className="mb-3 text-xs text-warn">Los movimientos de CxC y CxP de Valery necesitan el agente 1.0.4: reinstálalo desde Configuración → Puente con Valery.</p>}
      {v && v.agenteListo && !v.conectado && !v.enCurso && <p className="mb-3 text-xs text-warn">El agente del servidor no responde: lo de Valery se ve como estaba en su última lectura.</p>}
      {msg && <p className="mb-3 text-xs text-danger">{msg}</p>}

      <EstadoDatos cargando={!r && carga.cargando} error={!r ? carga.error : null} vacio={false}>
        {r && <Cuerpo r={r} empresa={empresa} />}
      </EstadoDatos>
    </SectionCard>
  );
}

function Cuerpo({ r, empresa }: { r: Reporte; empresa: string }) {
  const grupos = useMemo(() => resumirMovs(r.valery?.movimientos ?? []), [r.valery?.movimientos]);
  const v = r.valery;
  const operacion = [r.notas, r.devoluciones, r.cotizaciones, r.cilindros, r.gastos, r.conteos].some((x) => x !== null);
  const ruta = (s: string) => `/admin/${empresa}/${s}`;
  if (!r.ventas && !v && !r.cobrar && !r.pagar && !operacion) {
    return <p className="text-sm text-muted">No tienes acceso a ninguna de las secciones que entran en este reporte.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {r.ventas && (
          <Bloque titulo="Ventas en Valery" icono="sales" href={ruta("revenue")}>
            <Dato etiqueta="Vendido" valor={fmtUsd(r.ventas.netoUsd)} fuerte />
            <Dato etiqueta="Facturas y notas" valor={`${n(r.ventas.ventas)} · ${n(r.ventas.clientes)} cliente(s)`} />
            <Dato etiqueta="Devoluciones" valor={fmtUsd(r.ventas.devolucionesUsd)} />
            {r.periodo === "dia" && r.ventas.primera && r.ventas.ultima && (
              <Dato etiqueta="Primera y última" valor={`${horaVista(r.ventas.primera)} – ${horaVista(r.ventas.ultima)}`} />
            )}
            {r.ventas.masVendidos.length > 0 && <p className="mt-2 text-xs text-muted">Lo más vendido: {r.ventas.masVendidos.join(" · ")}</p>}
            {r.ventas.corte && r.desde < r.ventas.corte && (
              <p className="mt-2 text-xs text-warn">Las ventas en Macedonia empiezan el {fechaVista(r.ventas.corte)} (corte de inventario): lo anterior está en Reportes.</p>
            )}
          </Bloque>
        )}
        {v && (["cxc", "cxp"] as const).map((c) => (
          <BloqueValery key={c} cartera={c} grupos={grupos[c]} hayLectura={!!v.movimientos}
            saldo={c === "cxc" ? v.saldoCxc : v.saldoCxp} href={ruta(c === "cxc" ? "receivables" : "payables")} />
        ))}
        {r.cobrar && <BloqueCuentas titulo="Cuentas por cobrar en Macedonia" icono="receivable" c={r.cobrar} pagado="Abonos cobrados" href={ruta("receivables")} />}
        {r.pagar && <BloqueCuentas titulo="Cuentas por pagar en Macedonia" icono="payable" c={r.pagar} pagado="Abonos pagados" href={ruta("payables")} />}
        {operacion && (
          <Bloque titulo="Operación en Macedonia" icono="delivery">
            {r.notas && <Dato etiqueta="Notas de entrega" valor={`${n(r.notas.n)} · ${fmtUsd(r.notas.usd)}`} />}
            {r.devoluciones && <Dato etiqueta="Devoluciones" valor={`${n(r.devoluciones.n)} · ${fmtUsd(r.devoluciones.usd)}`} />}
            {r.cotizaciones && <Dato etiqueta="Cotizaciones" valor={`${n(r.cotizaciones.n)} · ${fmtUsd(r.cotizaciones.usd)}`} />}
            {r.cilindros && <Dato etiqueta="Cilindros" valor={`${n(r.cilindros.entregados)} entregados · ${n(r.cilindros.retornados)} retornados`} />}
            {r.gastos && <Dato etiqueta="Gastos" valor={`${n(r.gastos.n)} · ${fmtUsd(r.gastos.usd)}`} />}
            {r.conteos && <Dato etiqueta="Conteos de inventario" valor={`${n(r.conteos.n)} (${n(r.conteos.cerrados)} cerrados)`} />}
          </Bloque>
        )}
      </div>
      {r.serie.length > 0 && <Desglose r={r} />}
      {v?.movimientos && v.movimientos.length > 0 && (
        <TablaMovs movs={v.movimientos} conFecha={r.periodo !== "dia"} exportar={r.serie.length === 0} periodo={etiquetaPeriodo(r.periodo, r.desde, r.hasta)} />
      )}
      {v?.lecturaMovimientos && (
        <p className="mt-3 text-xs text-muted">Movimientos de Valery leídos {haceCuanto(v.lecturaMovimientos.terminadoEn)}. Montos en bolívares como los guarda Valery; en dólares, el total en dólares que guarda Valery para cada documento.</p>
      )}
    </>
  );
}

function Bloque({ titulo, icono, href, children }: { titulo: string; icono: Parameters<typeof Icon>[0]["name"]; href?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text"><Icon name={icono} size={16} /> <span className="truncate">{titulo}</span></p>
        {href && <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-brand hover:underline">Ver</Link>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Dato({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted">{etiqueta}</span>
      <span className={`text-right tabular-nums ${fuerte ? "text-base font-semibold text-text" : "text-text"}`}>{valor}</span>
    </p>
  );
}

function BloqueValery({ cartera, grupos, hayLectura, saldo, href }: {
  cartera: Cartera; grupos: GrupoMov[]; hayLectura: boolean; href: string;
  saldo: { bs: number; documentos: number; lectura: { terminadoEn: string | null } } | null;
}) {
  return (
    <Bloque titulo={cartera === "cxc" ? "Cuentas por cobrar en Valery" : "Cuentas por pagar en Valery"} icono={cartera === "cxc" ? "receivable" : "payable"} href={href}>
      {!hayLectura ? (
        <p className="text-sm text-muted">Todavía sin lectura de este período.</p>
      ) : !grupos.length ? (
        <p className="text-sm text-muted">Sin movimientos en este período.</p>
      ) : grupos.map((g) => (
        <Dato key={g.clase} etiqueta={`${g.etiqueta} (${n(g.documentos)})`} valor={g.totalUsd !== null ? `${fmtBs(g.totalBs)} · ${fmtUsd(g.totalUsd)}` : fmtBs(g.totalBs)} />
      ))}
      {saldo && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
          Saldo en Valery hoy: <span className="tabular-nums text-text">{fmtBs(saldo.bs)}</span> en {n(saldo.documentos)} documento(s) · leído {haceCuanto(saldo.lectura.terminadoEn)}
        </p>
      )}
    </Bloque>
  );
}

function BloqueCuentas({ titulo, icono, c, pagado, href }: {
  titulo: string; icono: "receivable" | "payable"; href: string; pagado: string;
  c: { nuevas: { n: number; usd: number }; abonos: { n: number; usd: number }; liquidaciones: { n: number; usd: number } };
}) {
  return (
    <Bloque titulo={titulo} icono={icono} href={href}>
      <Dato etiqueta={`Cuentas nuevas (${n(c.nuevas.n)})`} valor={fmtUsd(c.nuevas.usd)} />
      <Dato etiqueta={`${pagado} (${n(c.abonos.n)})`} valor={fmtUsd(c.abonos.usd)} />
      <Dato etiqueta={`Liquidaciones (${n(c.liquidaciones.n)})`} valor={fmtUsd(c.liquidaciones.usd)} />
    </Bloque>
  );
}

const TONO: Record<ReturnType<typeof claseMov>, "info" | "ok" | "warn" | "muted"> = {
  documento: "info", pago: "ok", nota_credito: "warn", anticipo: "ok", retencion: "muted", otro: "muted",
};

const CARTERA: Record<Cartera, string> = { cxc: "Por cobrar", cxp: "Por pagar" };

/** Lo que baja «Descargar» en un día: los movimientos de Valery (en semana, mes o año, el desglose). */
function ExportarMovs({ movs, periodo }: { movs: MovValery[]; periodo: string }) {
  useExportable(() => ({
    modulo: "", seccion: "Movimientos Valery", titulo: `Movimientos de CxC y CxP en Valery · ${periodo}`, detalle: [periodo],
    columnas: [{ titulo: "Fecha", tipo: "fecha" }, { titulo: "Hora" }, { titulo: "Cartera" }, { titulo: "Tipo" }, { titulo: "Documento", tipo: "codigo" },
      { titulo: "Contraparte" }, { titulo: "Concepto" }, { titulo: "Total (Bs)", tipo: "num" }, { titulo: "Total (US$)", tipo: "usd" }],
    filas: movs.map((m) => [fechaVista(m.fecha), horaVista(m.hora), CARTERA[m.cartera], m.tipo, m.documento, m.contraparte, m.concepto, m.totalBs, m.totalUsd]),
    nota: "Montos en bolívares como los guarda Valery; en dólares, el total en dólares que guarda Valery para cada documento.",
  }));
  return null;
}

function TablaMovs({ movs, conFecha, exportar, periodo }: { movs: MovValery[]; conFecha: boolean; exportar: boolean; periodo: string }) {
  const acc = useMemo(() => ({
    hora: (m: MovValery) => `${m.fecha} ${m.hora ?? ""}`, cartera: (m: MovValery) => m.cartera, tipo: (m: MovValery) => m.tipo,
    contraparte: (m: MovValery) => m.contraparte, total: (m: MovValery) => m.totalBs,
  }), []);
  const t = useTableView(movs, acc, 25);
  // Un botón y no un <details>: con su borde y su relleno, el paginador no cabía en 375 px.
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="mt-4">
      <Button variant="secondary" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)}>
        {abierta ? "Ocultar" : "Ver"} los {n(movs.length)} movimientos de Valery
      </Button>
      {exportar && <ExportarMovs movs={movs} periodo={periodo} />}
      {abierta && <div className="mt-3">
        <div className="sumi-scroll max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <SortableTh label={conFecha ? "Fecha y hora" : "Hora"} sortKey="hora" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Cartera" sortKey="cartera" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Tipo" sortKey="tipo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Contraparte" sortKey="contraparte" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Total" sortKey="total" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.visible.map((m, i) => (
                <tr key={`${m.cartera}|${m.tipo}|${m.documento}|${i}`} className="align-top hover:bg-surface-2">
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-muted">
                    {conFecha && <span className="block">{fechaVista(m.fecha)}</span>}{horaVista(m.hora)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{CARTERA[m.cartera]}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    <StatusBadge tone={TONO[claseMov(m.tipo)]}>{m.tipo}</StatusBadge>
                    <span className="block font-mono text-[11px] text-muted">{m.documento}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-text">{m.contraparte || "—"}<span className="block text-xs text-muted">{m.concepto}</span></td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-text">
                    {fmtBs(m.totalBs)}
                    {m.totalUsd !== null && <span className="block text-xs text-muted">{fmtUsd(m.totalUsd)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager {...t} etiqueta="movimientos" />
      </div>}
    </div>
  );
}

// ---------------------------------------------------------------- desglose
const COLUMNAS: { clave: string; titulo: string; bs?: boolean }[] = [
  { clave: "vendido", titulo: "Vendido" },
  { clave: "facturadoCxc", titulo: "Facturado a crédito (Valery)", bs: true },
  { clave: "cobradoCxc", titulo: "Cobrado (Valery)", bs: true },
  { clave: "compradoCxp", titulo: "Comprado a crédito (Valery)", bs: true },
  { clave: "pagadoCxp", titulo: "Pagado (Valery)", bs: true },
  { clave: "abonosCobrar", titulo: "Abonos cobrados" },
  { clave: "abonosPagar", titulo: "Abonos pagados" },
  { clave: "notas", titulo: "Notas de entrega" },
  { clave: "gastos", titulo: "Gastos" },
];

/** Día por día (semana, mes) o mes por mes (año). Solo las columnas que quien mira puede ver. */
function Desglose({ r }: { r: Reporte }) {
  const cols = COLUMNAS.filter((c) => r.serie[0] && c.clave in r.serie[0].valores);
  const acc = useMemo(() => Object.fromEntries([["periodo", (f: FilaSerie) => f.clave] as const,
    ...COLUMNAS.map((c) => [c.clave, (f: FilaSerie) => f.valores[c.clave] ?? 0] as const)]), []);
  const t = useTableView(r.serie, acc, r.periodo === "anio" ? 25 : 50);
  const nombre = etiquetaPeriodo(r.periodo, r.desde, r.hasta);
  const fmt = (c: { bs?: boolean }, x: number) => (c.bs ? fmtBs(x) : fmtUsd(x));
  const total = (clave: string) => r.serie.reduce((a, f) => a + (f.valores[clave] ?? 0), 0);
  useExportable(() => ({
    modulo: "", seccion: "Reporte", titulo: `Reporte · ${nombre}`, detalle: [nombre, r.periodo === "anio" ? "Mes por mes" : "Día por día"],
    columnas: [{ titulo: r.periodo === "anio" ? "Mes" : "Día" }, ...cols.map((c) => ({ titulo: `${c.titulo} (${c.bs ? "Bs" : "US$"})`, tipo: (c.bs ? "num" : "usd") as "num" | "usd" }))],
    filas: t.ordenadas.map((f) => [f.etiqueta, ...cols.map((c) => Math.round((f.valores[c.clave] ?? 0) * 100) / 100)]),
    totales: ["Total", ...cols.map((c) => Math.round(total(c.clave) * 100) / 100)],
    nota: "Vendido: facturas y notas menos devoluciones, sin IVA, en dólares a la tasa de su día. Lo de Valery, en bolívares como lo guarda Valery. Abonos, notas y gastos: lo registrado en Macedonia.",
  }));
  if (!cols.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-semibold text-text">{r.periodo === "anio" ? "Mes por mes" : "Día por día"}</p>
      <div className="sumi-scroll max-w-full overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <SortableTh label={r.periodo === "anio" ? "Mes" : "Día"} sortKey="periodo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              {cols.map((c) => <SortableTh key={c.clave} label={c.titulo} sortKey={c.clave} align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.visible.map((f) => (
              <tr key={f.clave} className="hover:bg-surface-2">
                <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{f.etiqueta}</td>
                {cols.map((c) => (
                  <td key={c.clave} className={`whitespace-nowrap py-2.5 pr-3 text-right tabular-nums ${(f.valores[c.clave] ?? 0) === 0 ? "text-muted" : "text-text"}`}>
                    {fmt(c, f.valores[c.clave] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-medium">
              <td className="py-2.5 pr-3 text-text">Total</td>
              {cols.map((c) => <td key={c.clave} className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-text">{fmt(c, total(c.clave))}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <TablePager {...t} etiqueta={r.periodo === "anio" ? "meses" : "días"} />
    </div>
  );
}
