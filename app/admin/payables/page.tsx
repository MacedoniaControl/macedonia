"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarCuentas, abonar, type Cuenta as CuentaDb, type CuentaDetalle } from "@/lib/finanzas/cuentas-db";
import { FiltroClase } from "@/components/finanzas/FiltroClase";
import { CLASES, grupoDeClase } from "@/lib/finanzas/retencion";
import { DetalleCuenta } from "@/components/finanzas/DetalleCuenta";
import { EditarCuenta } from "@/components/finanzas/EditarCuenta";
import { Modal } from "@/components/ui/Modal";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto } from "@/lib/ux/monto";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { FormularioCuenta } from "@/components/finanzas/FormularioCuenta";
import { ImportarCartera } from "@/components/finanzas/ImportarCartera";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd, fmtUsdCentavos } from "@/lib/ux/format";
import { LiquidarNotas } from "@/components/finanzas/LiquidarNotas";
import { DetalleLiquidacion, LiquidacionesDelCliente } from "@/components/finanzas/Liquidaciones";
import { listarLiquidaciones } from "@/lib/finanzas/liquidaciones-db";
import { agruparPorCliente, buscarEnCartera, type ClienteCartera } from "@/lib/finanzas/cartera";
import { descargarEstadoCuenta } from "@/lib/finanzas/estado-cuenta-pdf";
import { proveedorPorNombre } from "@/lib/directorio/directorio-db";
import type { EmpresaId } from "@/lib/ux/empresas";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/Switch";
import { useRol, puedeVerFinanzas } from "@/lib/ux/session";
import { BotonEliminar, BotonEliminarNota, EliminarCuentasDe, InterruptorEliminar, eliminarHabilitado } from "@/components/finanzas/EliminarCuentas";
import { leerConfig } from "@/lib/config/config-db";
import { porClase, resumenDe } from "@/lib/finanzas/resumen-clases";
import { TarjetaSegmento } from "@/components/finanzas/TarjetaSegmento";
import { MarcaRevision } from "@/components/finanzas/MarcaRevision";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { fechaVista, textoCelda } from "@/lib/ux/tabla-export";
import { ariaOrden, gravedad, ordenar, siguienteOrden, type ClaveOrden, type Orden } from "@/lib/finanzas/orden-cartera";
import { SortableTh } from "@/components/ui/SortableTh";
import { CASI_CERO } from "@/lib/ux/decimales";

const estadoDe = (saldo: number, d: number): { label: string; tone: Tone } =>
  saldo <= 0 ? { label: "Pagada", tone: "ok" }
  : d < 0 ? { label: `Vencida (${-d}d)`, tone: "danger" }
  : d <= 7 ? { label: `Alerta (${d}d)`, tone: "warn" }
  : { label: "Pendiente", tone: "info" };
const inputClass = "sumi-campo";
/** El mismo proveedor escrito con espacios o mayúsculas distintas. */
const mismoProveedor = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toUpperCase() === b.trim().replace(/\s+/g, " ").toUpperCase();
const pildora = "sumi-pulsable rounded-full border border-border-strong px-2.5 py-0.5 text-xs font-medium text-text hover:bg-surface-2";
/** El orden de las cuentas de un proveedor si no se elige otro: Estado ↓. */
const ORDEN_DOCUMENTOS: Orden = { clave: "estado", dir: "desc" };
/** Una cuenta por pagar en la cartera: el saldo y el monto son NETOS (sin el IVA retenido). */
type CuentaP = CuentaDb & { d: number; montoFactura: number };

// «Descargar» baja las cuentas tal como se ven, con su filtro de clase.
export default function PayablesPage() {
  return <ProveedorExportar><CuentasPorPagar /></ProveedorExportar>;
}

function CuentasPorPagar() {
  const empresaKey = useEmpresaActiva();
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarCuentas(empresaKey, "pagar"));
  const ctas: CuentaDb[] = carga.datos ?? [];
  const [docSel, setDocSel] = useState("");
  // Texto, no numero: parseMonto decide que significa. Guardar un numero
  // obligaba a convertir en cada tecla y perdia lo que se estaba escribiendo.
  const [abono, setAbono] = useState("");
  const [msg, setMsg] = useState("");
  // El exito NO puede vivir dentro del panel: al confirmar, el panel se cierra
  // y el mensaje se iba con el. Quien abonaba no veia ninguna respuesta.
  const [exito, setExito] = useState("");
  const [exitoTitulo, setExitoTitulo] = useState("Abono Registrado");
  // Liquidar (Owner y Administrador) y Anexar, como en Cuentas por Cobrar.
  const { rol } = useRol();
  const gerencia = puedeVerFinanzas(rol);
  const [liquidar, setLiquidar] = useState<string | null>(null);
  // Al liquidar UNA nota desde su detalle o desde «Registrar abono»: esa nota y el pago.
  const [liquidarDesde, setLiquidarDesde] = useState<{ ids: number[]; pago: { fecha: string; metodo: string; referencia: string; monto?: number } } | null>(null);
  const [anexar, setAnexar] = useState<string | null>(null);
  // «Eliminar»: Owner y Administrador, mientras el Owner lo tenga habilitado (migración 38).
  const cfg = useCarga(`cfg:${empresaKey}:${recarga}`, () => leerConfig(empresaKey));
  const habilitadoEliminar = eliminarHabilitado(cfg.datos);
  const puedeEliminar = gerencia && habilitadoEliminar && !!cfg.datos;
  const [eliminar, setEliminar] = useState<string | null>(null);
  // Eliminar UNA cuenta desde su fila en la cartera.
  const [eliminarNota, setEliminarNota] = useState<CuentaDb | null>(null);
  // Que cuenta se esta mirando, y si esta en modo edicion. Son dos estados
  // distintos: se puede abrir el detalle sin editar.
  const [abierta, setAbierta] = useState<number | null>(null);
  const [editando, setEditando] = useState<CuentaDetalle | null>(null);
  const [filtroClase, setFiltroClase] = useState<string>("todas");

  async function registrarAbono(): Promise<boolean> {
    setMsg("");
    const a = parseMonto(abono);
    const c = ctas.find((x) => x.documento === docSel);
    if (!c) { setMsg("ERR:Selecciona un documento."); return false; }
    if (a === null) { setMsg("ERR:No se entiende ese monto. Ejemplo: 1.500,50"); return false; }
    if (a <= 0) { setMsg("ERR:Ingresa un abono mayor a 0."); return false; }

    // El pago que completa una nota de entrega es una liquidación (migraciones 40 y 41).
    if (c.clase === "nota_entrega" && a >= c.saldoNeto - CASI_CERO) {
      setAbono(""); setDocSel(""); setExito("");
      setLiquidarDesde({ ids: [c.id], pago: { fecha: new Date().toISOString().slice(0, 10), metodo: "", referencia: "", monto: a } });
      setLiquidar(c.contraparte);
      return true;
    }

    // La base vuelve a comprobar que el abono no supere el saldo: dos personas
    // abonando a la vez podrian pasarse si solo se validara aqui.
    const r = await abonar(c.id, a);
    if (!r.ok) { setMsg(`ERR:${r.error}`); return false; }

    setRecarga((n) => n + 1);
    setExitoTitulo("Abono Registrado");
    setExito(`Abono de ${fmtUsd(a)} aplicado a ${docSel}.`);
    setAbono("");
    setDocSel("");
    return true;
  }

    // saldo y dias los calcula la BASE, contra la fecha de hoy real.
  // Se ordena tocando la cabecera (montos de mayor a menor, vencimiento del
  // más viejo al más nuevo, estado del más grave al pagado). La descarga sale
  // en el mismo orden.
  // La cabecera ordena los proveedores; sin tocar, primero a quien más se le debe.
  const [orden, setOrden] = useState<Orden>(null);
  const conSaldo = ctas.filter((c) => filtroClase === "todas" || grupoDeClase(c.clase) === filtroClase).map((c) => ({ ...c, d: c.dias }));

  // La cartera por proveedor (como en Cuentas por Cobrar): una fila con lo que
  // se le debe y sus cuentas adentro. Todo en NETO.
  const [buscaProveedor, setBuscaProveedor] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [conPagadas, setConPagadas] = useState<Set<string>>(new Set());
  const [ordenDe, setOrdenDe] = useState<Map<string, Orden>>(new Map());
  // La cabecera de las notas dentro de una cuenta: ordena SUS notas (lo mismo que «Ordenar»).
  const COLUMNAS_NOTAS: { label: string; clave: ClaveOrden; align: "left" | "right"; cls?: string }[] = [
    { label: "Documento", clave: "nombre", align: "left", cls: "pl-8" }, { label: "Clase", clave: "documentos", align: "left" },
    { label: "Saldo", clave: "saldo", align: "right" }, { label: "Emisión", clave: "emision", align: "left" },
    { label: "Vence", clave: "vence", align: "left" }, { label: "Estado", clave: "estado", align: "left" },
  ];
  const cabeceraNotas = (contraparte: string, od: Orden) => (
    <tr className="bg-surface-2/60 text-[11px] uppercase tracking-wide text-muted">
      {COLUMNAS_NOTAS.map((col) => (
        <SortableTh key={col.clave} label={col.label} sortKey={col.clave} align={col.align} className={col.cls} compacto
          ariaSort={(k) => ariaOrden(od, k)} onSort={() => setOrdenDe((m) => new Map(m).set(contraparte, siguienteOrden(od, col.clave)))} />
      ))}
    </tr>
  );

  const filasP: CuentaP[] = conSaldo.map((c) => ({ ...c, montoFactura: c.monto, monto: c.neto, saldo: c.saldoNeto }));
  const pagadaP = (c: CuentaP) => c.estado === "liquidada" || c.saldo <= CASI_CERO;
  const emisionDe = (g: ClienteCartera<CuentaP>) => g.cuentas.filter((c) => !pagadaP(c)).map((c) => c.emitida).sort()[0] ?? null;
  const valorProveedor = (g: ClienteCartera<CuentaP>, k: ClaveOrden) =>
    k === "nombre" ? g.cliente : k === "documentos" ? g.documentos : k === "monto" ? g.monto : k === "saldo" ? g.saldo
    : k === "emision" ? emisionDe(g) : k === "vence" ? g.masVieja?.vence ?? null : g.masVieja ? gravedad(g.saldo, g.masVieja.dias) : null;
  const valorCuenta = (c: CuentaP, k: ClaveOrden) =>
    k === "nombre" ? c.documento : k === "documentos" ? CLASES.find((x) => x.id === c.clase)?.label ?? c.clase
    : k === "monto" ? c.monto : k === "saldo" ? c.saldo : k === "emision" ? c.emitida : k === "vence" ? c.vence
    : k === "estado" ? gravedad(c.saldo, c.d, c.estado === "liquidada") : null;
  const tp = buscaProveedor.trim();
  // Por nombre o por el código de una cuenta: el proveedor que la tiene se abre solo con esa cuenta.
  const grupos = agruparPorCliente(filasP);
  const busqueda = new Map(grupos.map((g) => [g.cliente, buscarEnCartera(g, buscaProveedor)] as const));
  const porCodigo = (p: string) => { const b = busqueda.get(p); return !!b && b.docs.size > 0; };
  const proveedores = ordenar(grupos.filter((g) => busqueda.get(g.cliente)?.visible), orden, valorProveedor)
    .map((g) => ({ ...g, cuentas: ordenar(g.cuentas, ordenDe.get(g.cliente) ?? ORDEN_DOCUMENTOS, valorCuenta) }));
  const alternar = (k: string) => setAbiertos((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const todosAbiertos = proveedores.length > 0 && proveedores.every((g) => abiertos.has(g.cliente));
  const nombreClase = (id: string) => CLASES.find((x) => x.id === id)?.label ?? id;
  const resumenClases = (pc: Record<string, number>) =>
    Object.entries(pc).map(([k, v]) => `${v} ${k === "nota_entrega" ? "NE" : nombreClase(k).toLowerCase()}`).join(" · ");
  // Las liquidaciones de cada proveedor y en cuál se pagó cada cuenta.
  const liq = useCarga(`liq:pagar:${empresaKey}:${recarga}`, () => listarLiquidaciones(empresaKey, "pagar", 1000));
  const liquidacionesDe = (p: string) => (liq.datos ?? []).filter((l) => mismoProveedor(l.contraparte, p));
  const vigentes = (liq.datos ?? []).filter((l) => !l.anuladaEn);
  const enLiquidacion = new Set(vigentes.flatMap((l) => l.documentos.filter((d) => d.saldada).map((d) => d.cuentaId)));
  const lqDeCuenta = new Map(vigentes.flatMap((l) => l.documentos.filter((d) => d.saldada).map((d) => [d.cuentaId, l.numero] as const)));
  // Las cuentas que están en una liquidación activa (saldadas o con el restante): no se eliminan.
  const lqActivaDe = new Map((liq.datos ?? []).filter((l) => !l.anuladaEn).flatMap((l) => l.documentos.map((d) => [d.cuentaId, l.numero] as const)));
  // La liquidación abierta para anularla (desde el aviso de «Eliminar»).
  const [anularLq, setAnularLq] = useState<string | null>(null);
  const lqParaAnular = anularLq ? (liq.datos ?? []).find((l) => l.numero === anularLq) ?? null : null;
  const [descargando, setDescargando] = useState<string | null>(null);
  async function pdfProveedor(g: ClienteCartera<CuentaP>, conPag: boolean) {
    setDescargando(g.cliente);
    try {
      const filas = g.cuentas.filter((c) => conPag || !pagadaP(c)).map((c) => {
        const pagada = pagadaP(c);
        const lq = lqDeCuenta.get(c.id);
        return {
          documento: c.documento, clase: nombreClase(c.clase), emitida: c.emitida, vence: c.vence,
          monto: c.monto, saldo: pagada ? 0 : c.saldo, estado: pagada ? (lq ? `Pagada · ${lq}` : "Pagada") : estadoDe(c.saldo, c.d).label,
        };
      });
      const ficha = await proveedorPorNombre(g.cliente).catch(() => null);
      await descargarEstadoCuenta({
        empresa: empresaKey as EmpresaId, tipo: "pagar",
        emitido: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date()),
        cliente: { nombre: g.cliente, rif: ficha?.rif, telefonos: ficha?.telefonos, direccion: ficha?.direccion },
        filas, conPagadas: conPag,
      });
    } catch (e) {
      setExitoTitulo("No se pudo generar el PDF"); setExito(e instanceof Error ? e.message : "Error al generar el PDF.");
    } finally { setDescargando(null); }
  }
  const thOrden = (label: string, clave: ClaveOrden, align: "left" | "right" = "left") => (
    <SortableTh label={label} sortKey={clave} align={align} ariaSort={(k) => ariaOrden(orden, k)} onSort={() => setOrden((o) => siguienteOrden(o, clave))} />
  );

  // Cuantas hay de cada clase, para no ofrecer un filtro que deja la tabla
  // vacia: un filtro con cero resultados parece que el sistema perdio datos.
  // Se cuenta por GRUPO, no por clase: la pestaña «Nota de entrega» tiene que
  // decir cuantas cuentas va a mostrar, y muestra tambien las de debito.
  const conteoClase = ctas.reduce<Record<string, number>>(
    (a, c) => { const g = grupoDeClase(c.clase); return { ...a, [g]: (a[g] ?? 0) + 1 }; }, {});

  // Funcion que devuelve JSX, no componente: un componente definido adentro de
  // otro es un tipo nuevo en cada render, React lo remonta y el input pierde
  // el foco a cada tecla.
  const panelAbono = (cerrar: () => void) => (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">Registrar abono</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Documento</span>
        <select className={inputClass} value={docSel} onChange={(e) => setDocSel(e.target.value)}>
          <option value="">Elige un documento…</option>
          {conSaldo.filter((c) => c.saldoNeto > 0).map((c) => (
            <option key={c.documento} value={c.documento}>
              {c.documento} · {c.contraparte} · saldo {fmtUsd(c.saldoNeto)}
            </option>
          ))}
        </select>
      </label>
      <CampoMonto etiqueta="Abono" valor={abono} onChange={setAbono} />
      {msg && (
        <p role="alert" className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
          {msg.replace("ERR:", "")}
        </p>
      )}
      <div className="flex gap-2">
        {/* Se confirma porque mueve dinero y no se deshace, y porque el panel
            se cierra con un toque afuera: es facil pulsar de mas. El resumen
            repite el documento y el monto, que es lo unico que hay que
            verificar antes de que quede asentado. */}
        <ConfirmDialog
          title="¿Registrar el abono?"
          message={`${fmtUsd(parseMonto(abono) ?? 0)} a ${docSel || "(sin documento)"}. Queda asentado y no se puede deshacer.`}
          confirmLabel="Sí, registrar"
          onConfirm={async () => { if (await registrarAbono()) cerrar(); }}
          trigger={(abrir) => (
            <Button icon="cash" className="flex-1"
              onClick={() => {
                // Se valida antes de abrir: confirmar y recien ahi enterarse de
                // que falta el documento es peor que no confirmar.
                setMsg("");
                if (!docSel) return setMsg("ERR:Selecciona un documento.");
                const a = parseMonto(abono);
                if (a === null) return setMsg("ERR:No se entiende ese monto. Ejemplo: 1.500,50");
                if (a <= 0) return setMsg("ERR:Ingresa un abono mayor a 0.");
                abrir();
              }}>Registrar abono</Button>
          )}
        />
        <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
      </div>
    </div>
  );
  // Todo en NETO. La retencion no se le paga al proveedor -se le entera al
  // SENIAT-, asi que la deuda con el es el total menos lo retenido. Greeg pidio
  // que el panel muestre esa cifra, que es la que hay que mover.
  const total = conSaldo.reduce((a, c) => a + c.saldoNeto, 0);

  // «A Pagar» es el neto: la factura menos el IVA retenido, que va al SENIAT.
  useExportable(() => ({
    modulo: "",
    seccion: "Cuentas por Pagar",
    titulo: "Cuentas por Pagar",
    detalle: [
      filtroClase === "todas" ? "Todas las clases" : `Clase: ${CLASES.find((x) => x.id === filtroClase)?.label ?? filtroClase}`,
      `Total a pagar ${textoCelda(total, "usd")}`,
    ],
    columnas: [
      { titulo: "Proveedor" }, { titulo: "Documento", tipo: "codigo" }, { titulo: "Clase" }, { titulo: "Total Factura", tipo: "usd" },
      { titulo: "IVA Retenido", tipo: "usd" }, { titulo: "A Pagar", tipo: "usd" }, { titulo: "Abonado", tipo: "usd" },
      { titulo: "Saldo", tipo: "usd" }, { titulo: "Vence", tipo: "fecha" }, { titulo: "Estado" },
    ],
    filas: conSaldo.map((c) => [
      c.contraparte, c.documento, CLASES.find((x) => x.id === c.clase)?.label ?? null, c.monto, c.ivaRetenido ?? null,
      c.neto, c.abonado, c.saldoNeto, c.vence, c.estado === "liquidada" ? "Liquidada" : estadoDe(c.saldoNeto, c.d).label,
    ]),
    totales: [
      `Total · ${conSaldo.length} cuenta(s)`, "", "", conSaldo.reduce((a, c) => a + c.monto, 0),
      conSaldo.reduce((a, c) => a + (c.ivaRetenido ?? 0), 0), conSaldo.reduce((a, c) => a + c.neto, 0),
      conSaldo.reduce((a, c) => a + c.abonado, 0), total, "", "",
    ],
    nota: "Montos en USD. A Pagar es el total de la factura menos el IVA retenido.",
  }));
  // Cuentas cuyo desglose no es el 16% plano: facturas con renglones exentos.
  // Greeg pidio que se le avise, porque si se recalculan con el IVA automatico
  // sube la retencion, y eso es plata que se entera al SENIAT.
  const aRevisar = conSaldo.filter((c) => c.revision.atipico);
  // En unas el exento viene como columna aparte y se puede sumar; en otras
  // quedo metido dentro de la base y solo se nota por la tasa. Se cuentan
  // aparte para no dar a entender que el monto cubre todas.
  const conExento = aRevisar.filter((c) => c.revision.atipico && c.revision.motivo === "exento");
  const exento = conExento.reduce(
    (a, c) => a + (c.revision.atipico && c.revision.motivo === "exento" ? c.revision.exento : 0), 0);
  const vencido = conSaldo.filter((c) => c.saldoNeto > 0 && c.d < 0).reduce((a, c) => a + c.saldoNeto, 0);
  const alerta = conSaldo.filter((c) => c.saldoNeto > 0 && c.d >= 0 && c.d <= 7).reduce((a, c) => a + c.saldoNeto, 0);
  const nVenc = conSaldo.filter((c) => c.saldoNeto > 0 && c.d < 0).length;
  // Segmentado por clase (Facturas, Notas de Entrega…) y el consolidado, sobre TODAS las cuentas.
  const segmentos = porClase(ctas);
  const todo = resumenDe(ctas);
  const COLOR: Record<string, string> = { factura: "bg-brand", nota_entrega: "bg-info", ajuste: "bg-warn" };
  const colorDe = (id: string) => COLOR[id] ?? "bg-muted";
  const nombreFiltro = filtroClase === "todas" ? "Consolidado: todas las clases" : segmentos.find((x) => x.id === filtroClase)?.nombre ?? CLASES.find((x) => x.id === filtroClase)?.label ?? filtroClase;

  return (
    <>
      <PageHeader
        title="Cuentas por Pagar"
        breadcrumbs={[{ label: "Finanzas" }, { label: "Cuentas por Pagar" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PildoraPanel etiqueta="Nueva cuenta" icono="plus">
              {(cerrar) => (
                <FormularioCuenta tipo="pagar" empresa={empresaKey}
                  onCreada={() => setRecarga((n) => n + 1)} onCerrar={cerrar} />
              )}
            </PildoraPanel>
            <ImportarCartera tipo="pagar" empresa={empresaKey} onImportada={() => setRecarga((n) => n + 1)} />
            <PildoraPanel etiqueta="Registrar abono" icono="cash">
              {(cerrar) => panelAbono(cerrar)}
            </PildoraPanel>
            {gerencia && (
              <Button variant="secondary" icon="check" onClick={() => { setExito(""); setLiquidar(""); }}>Liquidar cuentas</Button>
            )}
            {rol === "owner" && cfg.datos && (
              <InterruptorEliminar empresa={empresaKey} habilitado={habilitadoEliminar}
                onCambio={(t) => { setExitoTitulo("Ajuste Guardado"); setExito(t); setRecarga((n) => n + 1); }} />
            )}
            <BotonDescargar empresa={empresaKey} />
          </div>
        }
      />
      {exito && (
        <div className="mb-4">
          <AlertCard tone="ok" titulo={exitoTitulo} mensaje={exito} />
        </div>
      )}
      <SectionCard title="Resumen" description={nombreFiltro}>
        <FiltroClase conteo={conteoClase} total={ctas.length} etiquetaTodas="Consolidado"
          valor={filtroClase} onCambio={setFiltroClase} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total a Pagar" value={fmtUsd(total)} accent />
          <StatCard label="Vencido" value={fmtUsd(vencido)} />
          <StatCard label="Alerta (≤7d)" value={fmtUsd(alerta)} />
          <StatCard label="Cuentas Vencidas" value={String(nVenc)} />
        </div>

        {/* Cada clase en su recuadro y el consolidado. Tocar uno filtra esa clase. */}
        {segmentos.length > 1 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Por clase</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {segmentos.map((g) => (
                <TarjetaSegmento key={g.id} nombre={g.nombre} activa={filtroClase === g.id}
                  sub={`${g.proveedores} proveedor(es) · ${g.cuentas} cuenta(s)`}
                  total={fmtUsd(g.total)} parte={g.parte} barras={[{ parte: g.parte, color: colorDe(g.id) }]}
                  datos={[{ label: "Vencido", valor: fmtUsd(g.vencido), peligro: true }, { label: "Alerta (≤7d)", valor: fmtUsd(g.alerta) }, { label: "Vencidas", valor: String(g.vencidas) }]}
                  onClick={() => setFiltroClase(filtroClase === g.id ? "todas" : g.id)} />
              ))}
              <TarjetaSegmento nombre="Consolidado" activa={filtroClase === "todas"}
                sub={`${segmentos.length} clases · ${todo.proveedores} proveedor(es) · ${todo.cuentas} cuenta(s)`}
                total={fmtUsd(todo.total)} parte={100} barras={segmentos.map((g) => ({ parte: g.parte, color: colorDe(g.id) }))}
                datos={[{ label: "Vencido", valor: fmtUsd(todo.vencido), peligro: true }, { label: "Alerta (≤7d)", valor: fmtUsd(todo.alerta) }, { label: "Vencidas", valor: String(todo.vencidas) }]}
                onClick={() => setFiltroClase("todas")} />
            </div>
          </div>
        )}
      </SectionCard>
      {nVenc > 0 && (
        <div className="mt-4">
          <AlertCard tone="danger" titulo="Pagos Vencidos" mensaje={`${nVenc} cuenta(s) vencida(s) por ${fmtUsd(vencido)}.`} />
        </div>
      )}
      {aRevisar.length > 0 && (
        <div className="mt-4">
          <AlertCard
            tone="warn"
            titulo="Facturas que no están gravadas al 16%"
            mensaje={
              `${aRevisar.length} cuenta(s) llevan renglones exentos. ` +
              (conExento.length
                ? `En ${conExento.length} son ${fmtUsd(exento)} sin IVA; ` +
                  `en las otras ${aRevisar.length - conExento.length} lo exento viene sumado dentro de la base. `
                : "") +
              "Están marcadas en la tabla. Si las editas, carga la base y el IVA a mano: " +
              "el 16% automático los gravaría de más y subiría la retención."
            }
          />
        </div>
      )}
      <div className="mt-6">
        <SectionCard title="Cuentas" description="Generadas automáticamente al recibir compras.">
          <EstadoDatos
            cargando={carga.cargando}
            error={carga.error}
            vacio={conSaldo.length === 0}
            tituloVacio="Sin Cuentas por Pagar"
            mensajeVacio={
              // Con un filtro puesto la tabla puede estar vacia AUNQUE haya
              // cuentas. Decir "no hay deudas" seria mentir: hay, pero no de
              // esa clase.
              filtroClase === "todas"
                ? "No hay deudas cargadas. Usa «Nueva cuenta» o importa la cartera."
                : `No hay ninguna cuenta de esa clase. Hay ${ctas.length} en total: toca «Todas».`
            }
          >
            {/* El mismo buscador que la cartera de Cuentas por Cobrar. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input type="search" className="sumi-campo sumi-campo--auto min-w-[12rem] flex-1 sm:max-w-sm" placeholder="Buscar proveedor o documento (FCM-80460)"
                aria-label="Buscar proveedor o documento por su código" value={buscaProveedor} onChange={(e) => setBuscaProveedor(e.target.value)} />
              <Button variant="ghost" onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(proveedores.map((g) => g.cliente)))}>
                {todosAbiertos ? "Contraer todos" : "Desplegar todos"}
              </Button>
              <span className="text-xs text-muted">{proveedores.length} proveedor(es)</span>
            </div>
            {tp && proveedores.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">No hay proveedores ni documentos con «{tp}».</p>
            )}
            <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  {thOrden("Proveedor", "nombre")}
                  {thOrden("Documentos", "documentos")}
                  {thOrden("Saldo", "saldo", "right")}
                  {thOrden("Emisión", "emision")}
                  {thOrden("Vence", "vence")}
                  {thOrden("Estado", "estado")}
                </tr>
              </thead>
              {proveedores.map((g) => {
                const abierto = abiertos.has(g.cliente) || porCodigo(g.cliente);
                const eg = g.masVieja ? estadoDe(g.saldo, g.masVieja.dias) : { label: "Pagada", tone: "ok" as Tone };
                const nv = g.cuentas.filter((c) => !pagadaP(c) && c.d < 0).length;
                const todoP = conPagadas.has(g.cliente);
                const od = ordenDe.get(g.cliente) ?? ORDEN_DOCUMENTOS;
                const OPCIONES: { id: string; label: string; orden: NonNullable<Orden> }[] = [
                  { id: "estado-asc", label: "Estado ↑", orden: { clave: "estado", dir: "asc" } },
                  { id: "estado-desc", label: "Estado ↓", orden: { clave: "estado", dir: "desc" } },
                  { id: "emision", label: "Emisión", orden: { clave: "emision", dir: "desc" } },
                  { id: "vence", label: "Vence", orden: { clave: "vence", dir: "asc" } },
                  { id: "saldo", label: "Saldo", orden: { clave: "saldo", dir: "desc" } },
                ];
                const actual = OPCIONES.find((o) => o.orden.clave === od?.clave && o.orden.dir === od?.dir)?.id ?? "";
                const e0 = emisionDe(g);
                return (
                  <tbody key={g.cliente} className="border-b border-border">
                    <tr onClick={() => alternar(g.cliente)} tabIndex={0} aria-expanded={abierto}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); alternar(g.cliente); } }}
                      className="cursor-pointer bg-surface hover:bg-surface-2">
                      <td className="py-3 pr-3">
                        <span className="flex items-center gap-2">
                          <span className={`text-muted transition ${abierto ? "rotate-90" : ""}`} aria-hidden><Icon name="chevronRight" size={14} /></span>
                          <b className="font-semibold text-text">{g.cliente}</b>
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted">{g.documentos} · {resumenClases(g.porClase)}</td>
                      <td className="py-3 pr-3 text-right font-semibold tabular-nums text-text">
                        {fmtUsd(g.saldo)}
                        {g.vencido > 0 && g.vencido < g.saldo && <span className="block text-[11px] font-normal text-danger">vencido {fmtUsd(g.vencido)}</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted">{e0 ? `desde ${fechaVista(e0)}` : "—"}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted">{g.masVieja ? `desde ${fechaVista(g.masVieja.vence)}` : "—"}</td>
                      <td className="py-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={eg.tone}>
                            {eg.label}
                            {nv > 0 && (
                              <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold leading-4 text-white"
                                title={`${nv} cuenta(s) vencida(s)`} aria-label={`${nv} cuenta(s) vencida(s)`}>{nv}</span>
                            )}
                          </StatusBadge>
                          {gerencia && g.cuentas.some((c) => c.estado === "abierta" && c.saldo > CASI_CERO) && (
                            <button type="button" className={pildora} title={`Liquidar cuentas de ${g.cliente}`}
                              onClick={(ev) => { ev.stopPropagation(); setExito(""); setLiquidar(g.cliente); }}>Liquidar</button>
                          )}
                          <button type="button" className={pildora} title={`Anexar una cuenta a la deuda con ${g.cliente}`}
                            onClick={(ev) => { ev.stopPropagation(); setExito(""); setAnexar(g.cliente); }}>Anexar</button>
                          {puedeEliminar && (
                            <BotonEliminar titulo={`Eliminar cuentas de ${g.cliente}`}
                              onClick={(ev) => { ev.stopPropagation(); setExito(""); setEliminar(g.cliente); }} />
                          )}
                        </span>
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="bg-surface-2/60">
                        <td colSpan={6} className="px-3 py-2 pl-8">
                          <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                            <span className="flex flex-wrap items-center gap-2">
                              <Switch checked={todoP} label={`Ver también las pagadas y las liquidaciones de ${g.cliente}`}
                                onChange={(v) => setConPagadas((x) => { const n = new Set(x); if (v) n.add(g.cliente); else n.delete(g.cliente); return n; })} />
                              Pagadas
                            </span>
                            <span className="flex items-center gap-1.5">
                              <label className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ${actual ? "border-brand/40 bg-brand/10 text-brand" : "border-border text-muted"}`}>
                                <span>Ordenar</span>
                                <select value={actual} aria-label={`Ordenar las cuentas de ${g.cliente}`}
                                  className="cursor-pointer bg-transparent font-medium text-text outline-none"
                                  onChange={(ev) => { const o = OPCIONES.find((x) => x.id === ev.target.value); if (o) setOrdenDe((m) => new Map(m).set(g.cliente, o.orden)); }}>
                                  {!actual && <option value="" disabled>—</option>}
                                  {OPCIONES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                              </label>
                              <button type="button" disabled={descargando === g.cliente}
                                title={todoP ? `Estado de cuenta con ${g.cliente}, con las pagadas` : `Estado de cuenta con ${g.cliente}: lo pendiente`}
                                className="sumi-pulsable inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 font-medium text-text hover:bg-surface disabled:opacity-60"
                                onClick={() => pdfProveedor(g, todoP)}>
                                <Icon name="report" size={13} /> {descargando === g.cliente ? "Generando…" : "Descargar PDF"}
                              </button>
                            </span>
                          </span>
                        </td>
                      </tr>
                    )}
                    {abierto && cabeceraNotas(g.cliente, od)}
                    {abierto && g.cuentas.filter((c) => porCodigo(g.cliente)
                      ? busqueda.get(g.cliente)!.docs.has(c.id) // buscando por código: las que coinciden, pagadas o no
                      : !pagadaP(c) || (todoP && !enLiquidacion.has(c.id))).map((c) => {
                      const e = estadoDe(c.saldo, c.d);
                      return (
                        <tr key={c.id} onClick={() => setAbierta(c.id)} tabIndex={0}
                          onKeyDown={(ev) => { if (ev.key === "Enter") setAbierta(c.id); }}
                          className="cursor-pointer bg-surface-2/60 text-xs hover:bg-surface-2">
                          <td className="py-2 pl-8 pr-3 font-mono text-muted">{c.documento}<MarcaRevision revision={c.revision} /></td>
                          <td className="py-2 pr-3 text-muted">{nombreClase(c.clase)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-text">
                            {fmtUsd(c.saldo)}
                            {Math.abs(c.monto - c.saldo) > CASI_CERO && <span className="block text-[10px] text-muted">de {fmtUsd(c.monto)}</span>}
                            {/* Con retención, el total de la factura es otro: a la vista para conciliar con el papel. */}
                            {c.ivaRetenido ? <span className="block text-[10px] text-muted">factura {fmtUsd(c.montoFactura)}</span> : null}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-3 text-muted">{fechaVista(c.emitida)}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-muted">{fechaVista(c.vence)}</td>
                          <td className="py-2">
                            {/* Liquidada gana sobre vencida: una cuenta cerrada ya no se debe. */}
                            <span className="flex items-center gap-2">
                              {pagadaP(c) ? <StatusBadge tone="ok">Pagada</StatusBadge> : <StatusBadge tone={e.tone}>{e.label}</StatusBadge>}
                              {puedeEliminar && (
                                <BotonEliminarNota titulo={`Eliminar ${c.documento}`}
                                  onClick={(ev) => { ev.stopPropagation(); setExito(""); setEliminarNota(ctas.find((x) => x.id === c.id) ?? null); }} />
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {abierto && todoP && liquidacionesDe(g.cliente).length > 0 && (
                      <tr className="bg-surface-2/60">
                        <td colSpan={6} className="px-3 pb-3 pl-8 pt-1">
                          <LiquidacionesDelCliente lista={liquidacionesDe(g.cliente)} gerencia={gerencia}
                            onCambio={() => setRecarga((n) => n + 1)} onAbrirCuenta={setAbierta} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
          </EstadoDatos>
        </SectionCard>
      </div>


      {liquidar !== null && (
        <Modal titulo="Liquidar Cuentas" onCerrar={() => { setLiquidar(null); setLiquidarDesde(null); }}>
          <LiquidarNotas tipo="pagar" empresa={empresaKey} cuentas={ctas} clienteInicial={liquidar || undefined}
            idsIniciales={liquidarDesde?.ids} pagoInicial={liquidarDesde?.pago}
            onHecho={(t) => { setExitoTitulo("Cuentas Liquidadas"); setExito(t); setRecarga((n) => n + 1); }}
            onCerrar={() => { setLiquidar(null); setLiquidarDesde(null); }} />
        </Modal>
      )}

      {lqParaAnular && (
        <Modal titulo="Anular Liquidación" onCerrar={() => setAnularLq(null)}>
          <DetalleLiquidacion l={lqParaAnular} gerencia={gerencia}
            onCambio={() => { setAnularLq(null); setRecarga((n) => n + 1); }} />
        </Modal>
      )}
      {eliminarNota && (
        <Modal titulo="Eliminar Cuenta" onCerrar={() => setEliminarNota(null)}>
          <EliminarCuentasDe empresa={empresaKey} enLiquidacion={lqActivaDe}
            onAnularLiquidacion={(n) => { setEliminar(null); setEliminarNota(null); setAnularLq(n); }} contraparte={eliminarNota.contraparte} cuentas={[{ ...eliminarNota, saldo: eliminarNota.saldoNeto }]}
            onHecho={(t) => { setExitoTitulo("Cuenta Eliminada"); setExito(t); setRecarga((n) => n + 1); }} onCerrar={() => setEliminarNota(null)} />
        </Modal>
      )}
      {eliminar !== null && (
        <Modal titulo="Eliminar Cuentas" onCerrar={() => setEliminar(null)}>
          <EliminarCuentasDe empresa={empresaKey} enLiquidacion={lqActivaDe}
            onAnularLiquidacion={(n) => { setEliminar(null); setEliminarNota(null); setAnularLq(n); }} contraparte={eliminar}
            cuentas={ctas.filter((c) => mismoProveedor(c.contraparte, eliminar)).map((c) => ({ ...c, saldo: c.saldoNeto }))}
            onHecho={(t) => { setExitoTitulo("Cuentas Eliminadas"); setExito(t); setRecarga((n) => n + 1); }} onCerrar={() => setEliminar(null)} />
        </Modal>
      )}

      {anexar !== null && (() => {
        // Todas las cuentas del proveedor, no solo las del filtro de clase.
        const suyas = ctas.filter((c) => mismoProveedor(c.contraparte, anexar));
        const deuda = suyas.filter((c) => c.estado === "abierta").reduce((a, c) => a + c.saldoNeto, 0);
        return (
          <Modal titulo="Anexar a la Deuda" onCerrar={() => setAnexar(null)}>
            <FormularioCuenta tipo="pagar" empresa={empresaKey}
              anexo={{ contraparte: anexar, deuda, documentos: suyas.map((c) => c.documento) }}
              onCreada={(c) => {
                if (c) { setExitoTitulo("Cuenta Anexada"); setExito(`${c.documento} anexada a ${anexar} por ${fmtUsdCentavos(c.monto)}. La deuda queda en ${fmtUsdCentavos(deuda + c.monto)}.`); }
                setRecarga((n) => n + 1);
              }}
              onCerrar={() => setAnexar(null)} />
          </Modal>
        );
      })()}

      {abierta !== null && (
        <Modal titulo="Cuenta por Pagar" onCerrar={() => { setAbierta(null); setEditando(null); }}>
          {editando ? (
            <EditarCuenta
              cuenta={editando}
              onGuardada={() => { setEditando(null); setRecarga((n) => n + 1); }}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <DetalleCuenta
              cuentaId={abierta}
              empresa={empresaKey}
              onCambio={() => setRecarga((n) => n + 1)}
              onEditar={(d) => setEditando(d)}
              onLiquidar={(d, pago) => { setAbierta(null); setExito(""); setLiquidarDesde({ ids: [d.id], pago }); setLiquidar(d.contraparte); }}
            />
          )}
        </Modal>
      )}
    </>
  );
}
