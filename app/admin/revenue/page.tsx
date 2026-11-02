"use client";

// Ventas (Finanzas): lo que Valery facturó, sin IVA y en dólares a la tasa de su día.
//
// Se alimenta del kardex, adonde las ventas llegan solas por el Puente Valery
// (cada hora, o al pulsar «Actualizar ahora») o subiendo el Excel en
// Inventario. Las reglas para contarlas están en lib/valery/ventas.ts.
// Hubo un /admin/sales con datos inventados que se borró (cc154aa); este no
// muestra nada que no venga de Valery.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/Switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { TablePager } from "@/components/ui/TablePager";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { useTableView } from "@/lib/ux/use-table-view";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtUsd } from "@/lib/ux/format";
import type { EmpresaId } from "@/lib/ux/empresas";
import { conectado, haceCuanto, vaciaSospechosa } from "@/lib/valery/puente";
import { resumirVentas, type CliVenta, type DocVenta, type ProdVenta, type ResumenVentas } from "@/lib/valery/ventas";
import { actualizarVentasAhora, cambiarVentasAuto, estadoVentas, ventasDelPeriodo, type EstadoVentas } from "@/lib/valery/ventas-db";

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const masDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

type PeriodoId = "hoy" | "ayer" | "7d" | "mes" | "mes-pasado" | "otro";
const PERIODOS: { id: Exclude<PeriodoId, "otro">; label: string; rango: (hoy: string) => { desde: string; hasta: string } }[] = [
  { id: "hoy", label: "Hoy", rango: (h) => ({ desde: h, hasta: h }) },
  { id: "ayer", label: "Ayer", rango: (h) => ({ desde: masDias(h, -1), hasta: masDias(h, -1) }) },
  { id: "7d", label: "7 días", rango: (h) => ({ desde: masDias(h, -6), hasta: h }) },
  { id: "mes", label: "Este mes", rango: (h) => ({ desde: `${h.slice(0, 7)}-01`, hasta: h }) },
  { id: "mes-pasado", label: "Mes pasado", rango: (h) => { const fin = masDias(`${h.slice(0, 7)}-01`, -1); return { desde: `${fin.slice(0, 7)}-01`, hasta: fin }; } },
];

const chip = "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors";
const chipActivo = "border-brand-strong bg-brand-soft text-brand";
const chipQuieto = "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text";
const campo = "h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text";

type Vista = "documentos" | "productos" | "clientes";
const TIPO: Record<DocVenta["tipo"], { t: string; tone: Tone }> = {
  FAC: { t: "Factura", tone: "info" },
  NET: { t: "Nota", tone: "muted" },
  DEV: { t: "Devolución", tone: "warn" },
};

export default function RevenuePage() {
  return <ProveedorExportar><Ventas /></ProveedorExportar>;
}

function Ventas() {
  const pathname = usePathname();
  const empresa = (pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/)?.[1] ?? "sumigases") as EmpresaId;

  const [periodo, setPeriodo] = useState<PeriodoId>("mes");
  const [otro, setOtro] = useState(() => PERIODOS[3].rango(hoyCaracas()));
  const { desde, hasta } = periodo === "otro" ? otro : PERIODOS.find((p) => p.id === periodo)!.rango(hoyCaracas());
  const [vista, setVista] = useState<Vista>("documentos");
  const [buscar, setBuscar] = useState("");

  // El estado del puente se mira seguido mientras se traen ventas, y cada
  // minuto si no: así la pantalla se entera sola de la actualización de la hora.
  // Lo último leído queda a la vista hasta que llega lo nuevo: sin parpadeo.
  const [vuelta, setVuelta] = useState(0);
  const [leido, setLeido] = useState<{ empresa: string; datos: EstadoVentas } | null>(null);
  useEffect(() => {
    let vigente = true;
    estadoVentas(empresa).then((d) => { if (vigente) setLeido({ empresa, datos: d }); }).catch(() => { /* se reintenta en la próxima vuelta */ });
    return () => { vigente = false; };
  }, [empresa, vuelta]);
  const estado = leido?.empresa === empresa ? leido.datos : null;
  const enCamino = estado?.ultima?.estado === "pendiente" || estado?.ultima?.estado === "en_proceso";
  useEffect(() => {
    const t = setInterval(() => setVuelta((n) => n + 1), enCamino ? 4000 : 60000);
    return () => clearInterval(t);
  }, [enCamino]);

  // Las ventas se vuelven a leer cuando entra una actualización nueva.
  // Las de antes siguen a la vista mientras tanto; al cambiar el período, no.
  const marca = estado?.ultimaBuena?.id ?? 0;
  const clave = `${empresa}:${desde}:${hasta}`;
  const [reintento, setReintento] = useState(0);
  const [ventas, setVentas] = useState<{ clave: string; resumen: ResumenVentas | null; error: string | null } | null>(null);
  useEffect(() => {
    let vigente = true;
    ventasDelPeriodo(empresa, desde, hasta)
      .then((m) => { if (vigente) setVentas({ clave, resumen: resumirVentas(m, empresa), error: null }); })
      .catch((e) => { if (vigente) setVentas((v) => ({ clave, resumen: v?.clave === clave ? v.resumen : null, error: (e as Error).message })); });
    return () => { vigente = false; };
    // `clave` ya lleva la empresa y las fechas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, marca, reintento]);
  const resumen = ventas?.clave === clave ? ventas.resumen : null;
  const errorVentas = ventas?.clave === clave ? ventas.error : null;

  const q = buscar.trim().toLowerCase();
  const docs = useMemo(() => (resumen?.documentos ?? [])
    .filter((d) => !q || d.documento.includes(q) || d.cliente.toLowerCase().includes(q))
    .sort((a, b) => (b.fecha + b.documento).localeCompare(a.fecha + a.documento)), [resumen, q]);
  const prods = useMemo(() => (resumen?.productos ?? [])
    .filter((p) => !q || p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
    .sort((a, b) => b.totalUsd - a.totalUsd), [resumen, q]);
  const clis = useMemo(() => (resumen?.porCliente ?? [])
    .filter((c) => !q || c.cliente.toLowerCase().includes(q))
    .sort((a, b) => b.totalUsd - a.totalUsd), [resumen, q]);

  const periodoTexto = desde === hasta ? fechaVista(desde)! : `${fechaVista(desde)} al ${fechaVista(hasta)}`;
  const antesDelCorte = !!estado?.corte && desde < estado.corte;

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Lo facturado en Valery, sin IVA y en dólares a la tasa de su día."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Ventas" }]}
        actions={<BotonDescargar empresa={empresa} />}
        filters={
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            <div className="sumi-scroll flex min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}
                  className={`${chip} ${periodo === p.id ? chipActivo : chipQuieto}`}>{p.label}</button>
              ))}
              <button type="button" aria-pressed={periodo === "otro"} onClick={() => { setOtro({ desde, hasta }); setPeriodo("otro"); }}
                className={`${chip} ${periodo === "otro" ? chipActivo : chipQuieto}`}>Otras fechas</button>
            </div>
            {periodo === "otro" && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-muted">Desde
                  <input type="date" className={`${campo} mt-1 block`} value={otro.desde} max={otro.hasta}
                    onChange={(e) => e.target.value && setOtro((o) => ({ ...o, desde: e.target.value }))} />
                </label>
                <label className="text-xs font-medium text-muted">Hasta
                  <input type="date" className={`${campo} mt-1 block`} value={otro.hasta} min={otro.desde}
                    onChange={(e) => e.target.value && setOtro((o) => ({ ...o, hasta: e.target.value }))} />
                </label>
              </div>
            )}
          </div>
        }
      />

      <EstadoPuente empresa={empresa} estado={estado} onCambio={() => setVuelta((n) => n + 1)} />

      {errorVentas && !resumen ? (
        <EmptyState icon="alert" title="No se pudieron leer las ventas" message={errorVentas}
          actions={<Button variant="secondary" onClick={() => setReintento((n) => n + 1)}>Reintentar</Button>} />
      ) : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Vendido" accent value={resumen ? fmtUsd(resumen.netoUsd) : "—"} sub="Facturas y notas, menos devoluciones" />
            <StatCard label="Ventas" value={resumen ? resumen.ventas.toLocaleString("es-VE") : "—"}
              sub={resumen ? `${resumen.clientes.toLocaleString("es-VE")} cliente(s)` : undefined} />
            <StatCard label="Ticket promedio" value={resumen ? (resumen.ventas ? fmtUsd(resumen.brutoUsd / resumen.ventas) : "—") : "—"} sub="Por factura o nota" />
            <StatCard label="Devoluciones" value={resumen ? fmtUsd(resumen.devolucionesUsd) : "—"}
              sub={resumen ? `${resumen.documentos.filter((d) => d.tipo === "DEV").length} documento(s)` : undefined} />
          </div>
          <NotaDelResumen resumen={resumen} periodo={periodoTexto} corte={antesDelCorte ? estado!.corte : null} />

          <SectionCard
            title={vista === "documentos" ? "Documentos" : vista === "productos" ? "Por producto" : "Por cliente"}
            description={periodoTexto}
            action={
              <div className="flex rounded-xl border border-border p-0.5" role="group" aria-label="Ver">
                {(["documentos", "productos", "clientes"] as Vista[]).map((v) => (
                  <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
                    className={`min-h-11 rounded-lg px-3 text-sm font-medium capitalize ${vista === v ? "bg-brand-soft text-brand" : "text-muted hover:text-text"}`}>{v}</button>
                ))}
              </div>
            }
          >
            <label className="sr-only" htmlFor="v-buscar">Buscar</label>
            <input id="v-buscar" type="search" className={`${campo} mb-3 w-full sm:max-w-xs`}
              placeholder={vista === "documentos" ? "Buscar documento o cliente…" : vista === "productos" ? "Buscar código o producto…" : "Buscar cliente…"}
              value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            {!resumen ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => <span key={i} className="sumi-skeleton block h-9 w-full" />)}
              </div>
            ) : vista === "documentos" ? (
              <TablaDocumentos filas={docs} periodo={periodoTexto} resumen={resumen} />
            ) : vista === "productos" ? (
              <TablaProductos filas={prods} periodo={periodoTexto} />
            ) : (
              <TablaClientes filas={clis} periodo={periodoTexto} />
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- de dónde vienen
function EstadoPuente({ empresa, estado, onCambio }: { empresa: EmpresaId; estado: EstadoVentas | null; onCambio: () => void }) {
  const [yendo, setYendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!estado) return <span className="sumi-skeleton mb-4 block h-16 w-full rounded-xl" />;

  const u = estado.ultima;
  const enCamino = u?.estado === "pendiente" || u?.estado === "en_proceso";
  const vivo = conectado(estado.agente?.ultimoContacto ?? null);
  const buena = estado.ultimaBuena;

  let tono: "ok" | "warn" | "muted" = "muted";
  let texto: string;
  if (!estado.agente) {
    texto = "El Puente Valery no está instalado en esta empresa: las ventas solo entran subiendo el Excel en Inventario.";
  } else if (!estado.corte) {
    tono = "warn";
    texto = "Esta empresa todavía no tiene corte de inventario: el puente no puede aplicar sus ventas.";
  } else if (enCamino) {
    texto = u!.estado === "pendiente" && !vivo ? "Actualización pedida: el agente la toma cuando vuelva a conectarse." : "Trayendo las ventas de Valery…";
  } else if (u?.estado === "error") {
    tono = "warn";
    texto = `La última actualización falló (${haceCuanto(u.terminadoEn ?? u.creadoEn)}): ${(u.error ?? "sin detalle").replace(/\.$/, "")}. Las ventas de antes siguen como estaban.`;
  } else if (buena && vaciaSospechosa(buena.desde, buena.hasta, buena.renglones)) {
    tono = "warn";
    texto = `Valery no entregó ninguna venta del ${fechaVista(buena.desde)} al ${fechaVista(buena.hasta)} (${haceCuanto(buena.aplicadoEn)}). Lo más probable es que el agente esté leyendo otra base: revisa la línea «Base» en Configuración → Puente con Valery y, si no es la que se usa, reinstálalo.`;
  } else if (buena) {
    tono = "ok";
    texto = `Actualizado desde Valery ${haceCuanto(buena.aplicadoEn)}${buena.nuevos ? ` · ${buena.nuevos} renglón(es) nuevo(s)` : " · sin ventas nuevas"}.`;
  } else {
    texto = "Todavía no se ha traído nada automáticamente.";
  }
  const sinAgente = !!estado.agente && !vivo && !enCamino;
  // Un agente que lee una base vieja trae «cero ventas» y parece que todo va bien.
  const ultimaBase = estado.agente?.ultimaVentaBase ?? null;
  const baseVieja = !!ultimaBase && ultimaBase < masDias(hoyCaracas(), -30);

  async function actualizar() {
    setMsg(null); setYendo(true);
    const r = await actualizarVentasAhora(empresa);
    setYendo(false);
    if (!r.ok) setMsg(r.error);
    onCambio();
  }
  async function cambiar(auto: boolean) {
    setMsg(null);
    const r = await cambiarVentasAuto(empresa, auto);
    if (!r.ok) setMsg(r.error);
    onCambio();
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`flex min-w-0 items-start gap-2 text-sm ${tono === "warn" ? "text-warn" : "text-text"}`} role="status">
          <span className={`mt-0.5 shrink-0 ${tono === "ok" ? "text-ok" : tono === "warn" ? "text-warn" : "text-muted"}`}>
            <Icon name={tono === "warn" ? "alert" : enCamino ? "import" : "check"} size={16} />
          </span>
          <span className="min-w-0">{texto}</span>
        </p>
        {estado.gerencia && estado.agente && estado.corte && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Switch checked={estado.auto} onChange={cambiar} label="Traer las ventas de Valery automáticamente" />
              {estado.auto ? `Automático cada ${estado.cadaMin === 60 ? "hora" : `${estado.cadaMin} min`}` : "Automático apagado"}
            </span>
            <Button variant="secondary" icon="import" cargando={yendo || enCamino} textoCargando="Actualizando…" onClick={actualizar}>Actualizar ahora</Button>
          </div>
        )}
      </div>
      {!enCamino && buena && buena.productosNuevos.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Se agregaron al catálogo {buena.productosNuevos.length} producto(s) nuevo(s) de Valery: {buena.productosNuevos.slice(0, 8).join(", ")}{buena.productosNuevos.length > 8 ? "…" : ""}.
          Quedaron sin precio ni costo: cárgalos en Inventario → Productos.
        </p>
      )}
      {baseVieja && (
        <p className="mt-2 text-xs text-warn">
          El agente está leyendo una base de Valery cuya última venta es del {fechaVista(ultimaBase)}{estado.agente?.base ? ` (${estado.agente.base})` : ""}: no parece la que se usa hoy.
          Reinstálalo desde Configuración → Puente con Valery para que busque la base en uso.
        </p>
      )}
      {sinAgente && <p className="mt-2 text-xs text-warn">El agente del servidor no responde desde {haceCuanto(estado.agente!.ultimoContacto)}: las ventas se actualizan cuando vuelva.</p>}
      {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
    </div>
  );
}

function NotaDelResumen({ resumen, periodo, corte }: { resumen: ResumenVentas | null; periodo: string; corte: string | null }) {
  if (!resumen) return <div className="mb-4" />;
  const partes = [
    ...(resumen.entreEmpresas.renglones ? [`${fmtUsd(resumen.entreEmpresas.totalUsd)} vendidos a la otra empresa del grupo (${resumen.entreEmpresas.documentos} documento(s))`] : []),
    ...(resumen.consumoPropio.renglones ? [`${fmtUsd(resumen.consumoPropio.totalUsd)} de consumo interno (${resumen.consumoPropio.documentos} documento(s))`] : []),
    ...(resumen.sinMonto ? [`${resumen.sinMonto} renglón(es) sin monto en dólares`] : []),
  ];
  return (
    <div className="mb-4 space-y-1 text-xs text-muted">
      {partes.length > 0 && <p>No se cuentan como venta: {partes.join(" · ")}.</p>}
      {corte && <p className="text-warn">Las ventas en Macedonia empiezan el {fechaVista(corte)} (corte de inventario): antes de esa fecha no hay nada aquí. El histórico está en Reportes.</p>}
      {!resumen.documentos.length && !corte && <p>Sin ventas registradas del {periodo}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- tablas
const r2 = (n: number) => Math.round(n * 100) / 100;

function Vacio() {
  return <EmptyState icon="sales" title="Sin ventas" message="No hay ventas que mostrar con este período y esta búsqueda." />;
}

function TablaDocumentos({ filas, periodo, resumen }: { filas: DocVenta[]; periodo: string; resumen: ResumenVentas }) {
  const acc = useMemo(() => ({
    fecha: (d: DocVenta) => d.fecha, tipo: (d: DocVenta) => d.tipo, documento: (d: DocVenta) => d.documento,
    cliente: (d: DocVenta) => d.cliente, renglones: (d: DocVenta) => d.renglones, total: (d: DocVenta) => d.totalUsd,
  }), []);
  const t = useTableView(filas, acc, 25);
  useExportable(() => ({
    modulo: "", seccion: "Ventas", titulo: "Ventas · Documentos",
    detalle: [`Período ${periodo}`, "Sin IVA, en dólares a la tasa de su día. La devolución resta."],
    columnas: [{ titulo: "Fecha", tipo: "fecha" }, { titulo: "Tipo" }, { titulo: "Documento", tipo: "codigo" }, { titulo: "Cliente" }, { titulo: "Renglones", tipo: "num" }, { titulo: "Total (USD)", tipo: "usd" }],
    filas: t.ordenadas.map((d) => [fechaVista(d.fecha), TIPO[d.tipo].t, d.documento, d.cliente, d.renglones, r2(d.totalUsd)]),
    totales: ["", "", "", `${t.ordenadas.length} documento(s)`, "", r2(t.ordenadas.reduce((a, d) => a + d.totalUsd, 0))],
    nota: resumen.entreEmpresas.renglones || resumen.consumoPropio.renglones ? "No incluye lo vendido a la otra empresa del grupo ni el consumo interno." : undefined,
  }));
  if (!filas.length) return <Vacio />;
  return (
    <>
      <div className="sumi-scroll max-w-full overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <SortableTh label="Fecha" sortKey="fecha" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Tipo" sortKey="tipo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Documento" sortKey="documento" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Cliente" sortKey="cliente" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Renglones" sortKey="renglones" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Total" sortKey="total" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.visible.map((d) => (
              <tr key={d.clave} className="hover:bg-surface-2">
                <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-muted">{fechaVista(d.fecha)}</td>
                <td className="py-2.5 pr-3"><StatusBadge tone={TIPO[d.tipo].tone}>{TIPO[d.tipo].t}</StatusBadge></td>
                <td className="py-2.5 pr-3 font-mono text-xs text-muted">{d.documento}</td>
                <td className="py-2.5 pr-3 text-text">{d.cliente || "—"}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{d.renglones}</td>
                <td className={`py-2.5 text-right font-medium tabular-nums ${d.totalUsd < 0 ? "text-warn" : "text-text"}`}>{fmtUsd(d.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager {...t} etiqueta="documentos" />
    </>
  );
}

function TablaProductos({ filas, periodo }: { filas: ProdVenta[]; periodo: string }) {
  const acc = useMemo(() => ({
    codigo: (p: ProdVenta) => p.codigo, nombre: (p: ProdVenta) => p.nombre, cantidad: (p: ProdVenta) => p.cantidad,
    documentos: (p: ProdVenta) => p.documentos, total: (p: ProdVenta) => p.totalUsd,
  }), []);
  const t = useTableView(filas, acc, 25);
  useExportable(() => ({
    modulo: "", seccion: "Ventas por producto", titulo: "Ventas · Por producto",
    detalle: [`Período ${periodo}`, "Cantidad y total netos de devoluciones. Sin IVA, en dólares a la tasa de su día."],
    columnas: [{ titulo: "Código", tipo: "codigo" }, { titulo: "Producto" }, { titulo: "Cantidad", tipo: "num" }, { titulo: "Documentos", tipo: "num" }, { titulo: "Total (USD)", tipo: "usd" }],
    filas: t.ordenadas.map((p) => [p.codigo, p.nombre, r2(p.cantidad), p.documentos, r2(p.totalUsd)]),
    totales: ["", `${t.ordenadas.length} producto(s)`, "", "", r2(t.ordenadas.reduce((a, p) => a + p.totalUsd, 0))],
  }));
  if (!filas.length) return <Vacio />;
  return (
    <>
      <div className="sumi-scroll max-w-full overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <SortableTh label="Código" sortKey="codigo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Producto" sortKey="nombre" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Cantidad" sortKey="cantidad" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Documentos" sortKey="documentos" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Total" sortKey="total" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.visible.map((p) => (
              <tr key={p.codigo} className="hover:bg-surface-2">
                <td className="py-2.5 pr-3 font-mono text-xs text-muted">{p.codigo}</td>
                <td className="py-2.5 pr-3 text-text">{p.nombre}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-text">{r2(p.cantidad).toLocaleString("es-VE")}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{p.documentos}</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-text">{fmtUsd(p.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager {...t} etiqueta="productos" />
    </>
  );
}

function TablaClientes({ filas, periodo }: { filas: CliVenta[]; periodo: string }) {
  const acc = useMemo(() => ({
    cliente: (c: CliVenta) => c.cliente, documentos: (c: CliVenta) => c.documentos, ultima: (c: CliVenta) => c.ultima, total: (c: CliVenta) => c.totalUsd,
  }), []);
  const t = useTableView(filas, acc, 25);
  useExportable(() => ({
    modulo: "", seccion: "Ventas por cliente", titulo: "Ventas · Por cliente",
    detalle: [`Período ${periodo}`, "Total neto de devoluciones. Sin IVA, en dólares a la tasa de su día."],
    columnas: [{ titulo: "Cliente" }, { titulo: "Documentos", tipo: "num" }, { titulo: "Última compra", tipo: "fecha" }, { titulo: "Total (USD)", tipo: "usd" }],
    filas: t.ordenadas.map((c) => [c.cliente, c.documentos, fechaVista(c.ultima), r2(c.totalUsd)]),
    totales: [`${t.ordenadas.length} cliente(s)`, "", "", r2(t.ordenadas.reduce((a, c) => a + c.totalUsd, 0))],
  }));
  if (!filas.length) return <Vacio />;
  return (
    <>
      <div className="sumi-scroll max-w-full overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <SortableTh label="Cliente" sortKey="cliente" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Documentos" sortKey="documentos" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Última compra" sortKey="ultima" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Total" sortKey="total" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.visible.map((c) => (
              <tr key={c.cliente} className="hover:bg-surface-2">
                <td className="py-2.5 pr-3 text-text">{c.cliente}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{c.documentos}</td>
                <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-muted">{fechaVista(c.ultima)}</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-text">{fmtUsd(c.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager {...t} etiqueta="clientes" />
    </>
  );
}
