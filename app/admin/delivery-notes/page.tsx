"use client";

import { useEffect } from "react";

import { useRef, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { guardarDocumento, listarDocumentos, correlativoPrevisto, type DocumentoGuardado } from "@/lib/documentos/documentos-db";
import { useCarga } from "@/lib/ux/use-carga";
import { subirArchivo, listarArchivos, urlDeArchivo, type TipoArchivo } from "@/lib/documentos/archivos-db";
import { SubirArchivo } from "@/components/ui/SubirArchivo";
import { leerConfig } from "@/lib/config/config-db";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { InputMonto } from "@/components/ui/InputMonto";
import { fmtUsd } from "@/lib/ux/format";
import {
  notaEntregaHtml, devolucionHtml, printDoc,
  type NEDoc, type DevDoc, type DevLinea,
} from "@/lib/ux/doc-templates";
import { useRol, puedeVerRegistros } from "@/lib/ux/session";
import { NuevaNotaEntrega } from "./NuevaNotaEntrega";

type Tipo = "entrega" | "devolucion";
type Doc = {
  id: string; tipo: Tipo; correlativo: string; cliente: string; fecha: string; total: number;
  origen: "Macedonia" | "SumiControl" | "Valery"; fileName?: string; ruta?: string; ne?: NEDoc; dev?: DevDoc;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);
const inputClass = "sumi-campo";
const label = "mb-1 block text-xs font-medium text-muted";


function deDocumento(d: DocumentoGuardado): Doc {
  return {
    id: String(d.id),
    tipo: d.tipo === "devolucion" ? "devolucion" : "entrega",
    correlativo: d.correlativo,
    cliente: d.cliente,
    fecha: d.fecha,
    total: d.total,
    origen: "Macedonia",
  };
}

function inPeriod(fecha: string, period: string): boolean {
  const d = new Date(fecha + "T00:00:00");
  const n = new Date();
  if (period === "dia") return d.toDateString() === n.toDateString();
  if (period === "semana") return (n.getTime() - d.getTime()) / 86400000 <= 7 && d <= n;
  if (period === "mes") return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  return d.getFullYear() === n.getFullYear();
}

export default function DeliveryNotesPage() {
  const empresaKey = useEmpresaActiva();
  // Los PDF que se suben de Valery son archivos, no registros: se quedan en el
  // navegador porque no hay donde guardarlos todavia. Todo lo que GENERA
  // Macedonia sale de la base, que es la unica copia que ven los demas.
  // Los PDF de Valery salen de Storage. Antes vivían en localStorage: se perdían
  // al limpiar el navegador y solo los veía quien los había subido.
  const [recargaArchivos, setRecargaArchivos] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [avisoSubida, setAvisoSubida] = useState<string | null>(null);

  const cargaArchivos = useCarga(
    `${empresaKey}:${recargaArchivos}`,
    () => listarArchivos(empresaKey, ["nota_entrega", "devolucion"]),
  );
  const subidos: Doc[] = (cargaArchivos.datos ?? []).map((a) => ({
    id: `a${a.id}`,
    tipo: a.tipo === "devolucion" ? "devolucion" : "entrega",
    correlativo: a.correlativo ?? "—",
    cliente: "(desde archivo)",
    fecha: a.fecha,
    total: 0,
    origen: "Valery" as const,
    fileName: a.nombre,
    ruta: a.ruta,
  }));
  const [recarga, setRecarga] = useState(0);

  const guardados = useCarga(`${empresaKey}:${recarga}`, async () => {
    const [nes, devs] = await Promise.all([
      listarDocumentos(empresaKey, "nota_entrega", 200),
      listarDocumentos(empresaKey, "devolucion", 200),
    ]);
    return [...nes, ...devs].map(deDocumento);
  });

  const docs: Doc[] = [...(guardados.datos ?? []), ...subidos]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  // El correlativo lo da la BASE, no un contador del navegador: dos vendedores
  // generando a la vez sacarían el mismo número. Esto es solo la PREVISIÓN que
  // se muestra antes de generar; el número real llega al guardar.
  const [previstoNE, setPrevistoNE] = useState("…");
  const [previstoDev, setPrevistoDev] = useState("…");
  useEffect(() => {
    correlativoPrevisto(empresaKey, "nota_entrega").then(setPrevistoNE).catch(() => setPrevistoNE("—"));
    correlativoPrevisto(empresaKey, "devolucion").then(setPrevistoDev).catch(() => setPrevistoDev("—"));
  }, [empresaKey]);
  // "Generar nota de entrega" es el apartado principal; el Registro va de último y es solo OWNER.
  const [tab, setTab] = useState<"registro" | "ne" | "dev">("ne");
  const { rol } = useRol();
  const verRegistros = puedeVerRegistros(rol);
  const [period, setPeriod] = useState("mes");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = docs.filter((d) => inPeriod(d.fecha, period));

  function verDoc(d: Doc) {
    if (d.origen === "Valery" && d.ruta) return void abrirArchivo(d.ruta);
    if (d.ne) return printDoc(notaEntregaHtml(d.ne, empresaKey));
    if (d.dev) return printDoc(devolucionHtml(d.dev, empresaKey));
    alert("Este documento de Valery no tiene archivo adjunto.");
  }

  // Los PDF van a Supabase Storage, no al navegador. El tipo se deduce del
  // nombre del archivo, que es como los exporta Valery.
  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    const fallos: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const nombre = f.name.toUpperCase();
        const tipo = /NC|CREDITO|DEVOL/.test(nombre) ? "devolucion" : "nota_entrega";
        const r = await subirArchivo(f, tipo as TipoArchivo, empresaKey);
        if (!r.ok) fallos.push(`${f.name}: ${r.error}`);
      }
      setRecargaArchivos((n) => n + 1);
      setAvisoSubida(
        fallos.length
          ? `${files.length - fallos.length} de ${files.length} · ${fallos[0]}`
          : `${files.length} archivo(s) guardados.`,
      );
    } finally {
      setSubiendo(false);
    }
  }

  // Abre el PDF con un enlace temporal: el bucket es privado porque son
  // documentos comerciales con nombres de clientes y montos.
  async function abrirArchivo(ruta: string) {
    const url = await urlDeArchivo(ruta);
    if (url) window.open(url, "_blank");
    else setAvisoSubida("No se pudo abrir el archivo.");
  }

  return (
    <>
      <PageHeader
        title="Notas de Entrega y Devoluciones"
        breadcrumbs={[{ label: "Operación" }, { label: "Notas de Entrega" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {verRegistros && <StatusBadge tone="brand">{docs.length} documento(s)</StatusBadge>}
            {avisoSubida && (
              <span className="text-xs text-muted" role="status">{avisoSubida}</span>
            )}
            <SubirArchivo onArchivos={onUpload} etiqueta={subiendo ? "Subiendo…" : "Subir archivo"}
              ayuda="Notas de entrega y notas de crédito (devoluciones) exportadas de Valery." />
          </div>
        }
      />

      {/* Tabs */}
      <div className="sumi-tabs mb-4 gap-2">
        {([
          ["ne", "Nueva Nota de Entrega"] as const,
          ["dev", "Generar Devolución"] as const,
          ...(verRegistros ? ([["registro", "Registro"]] as const) : []),
        ]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${tab === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-text hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "registro" && verRegistros && (
        <SectionCard title="Registro de Documentos"
          action={
            <select className="sumi-campo w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="año">Año</option>
            </select>
          }>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr className="border-b border-border">
                <th className="py-2.5 pr-3 font-medium">Tipo</th><th className="py-2.5 pr-3 font-medium">N°</th>
                <th className="py-2.5 pr-3 font-medium">Cliente</th><th className="py-2.5 pr-3 font-medium">Fecha</th>
                <th className="py-2.5 pr-3 text-right font-medium">Total</th><th className="py-2.5 pr-3 font-medium">Origen</th>
                <th className="py-2.5 font-medium">Acción</th></tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">Sin documentos en este período.</td></tr>}
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3"><StatusBadge tone={d.tipo === "entrega" ? "ok" : "warn"}>{d.tipo === "entrega" ? "Nota entrega" : "Devolución"}</StatusBadge></td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{d.correlativo}</td>
                    <td className="py-2.5 pr-3 text-text">{d.cliente}</td>
                    <td className="py-2.5 pr-3 text-muted">{d.fecha}</td>
                    <td className="py-2.5 pr-3 text-right text-text">{d.total ? fmtUsd(d.total) : "—"}</td>
                    <td className="py-2.5 pr-3"><StatusBadge tone={d.origen === "Valery" ? "navy" : "brand"}>{d.origen === "Valery" ? "Valery" : "Macedonia"}</StatusBadge></td>
                    <td className="py-2.5"><button type="button" onClick={() => verDoc(d)} className="text-sm font-medium text-brand hover:underline">Ver / PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {(tab === "ne" || (tab === "registro" && !verRegistros)) && <NuevaNotaEntrega onSave={async (ne) => {
        // Se guarda PRIMERO y se imprime DESPUÉS. El orden importa: hasta que la
        // base no entrega el número, no hay número que imprimir. Antes se
        // imprimía una previsión que podía no ser la que quedara guardada.
        const r = await guardarDocumento({
          tipo: "nota_entrega",
          cliente: ne.cliente,
          clienteRif: ne.rif,
          clienteDireccion: ne.direccion,
          lineas: ne.lineas.map((l) => ({
            codigo: l.codigo ?? "", descripcion: l.descripcion,
            cantidad: l.cantidad, unidad: l.unidad,
            precio: l.precio, descuento: l.descuento ?? 0,
          })),
        }, empresaKey);

        if (!r.ok) return { error: r.error };

        // Se imprime `lineasImpresas`: en bolívares, los precios ya convertidos.
        const conNumero = { ...ne, lineas: ne.lineasImpresas, correlativo: r.documento.correlativo };
        // No se agrega a mano a la lista: se relee de la base. Empujar la fila
        // aquí dejaria la pantalla mostrando algo que quiza no se guardo igual.
        setRecarga((n) => n + 1);
        setPrevistoNE(String(Number(r.documento.correlativo) + 1).padStart(10, "0"));
        printDoc(notaEntregaHtml(conNumero, empresaKey));
        return { error: null };
      }} seq={previstoNE} />}

      {tab === "dev" && <GenerarDev onSave={async (dev) => {
        // Antes la devolucion solo se imprimia: no quedaba registro en ningun
        // lado. Una devolucion que no se guarda es mercaderia que volvio y que
        // el sistema sigue dando por vendida.
        const r = await guardarDocumento({
          tipo: "devolucion",
          cliente: dev.razonSocial,
          clienteRif: dev.rif,
          lineas: dev.lineas.map((l) => ({
            codigo: l.codigo ?? "", descripcion: l.descripcion,
            cantidad: l.cantidad, unidad: l.unidad,
            precio: l.precio, descuento: l.descuento ?? 0,
          })),
        }, empresaKey);

        if (!r.ok) return { error: r.error };

        const conNumero = { ...dev, correlativo: r.documento.correlativo };
        setRecarga((n) => n + 1);
        setPrevistoDev(String(Number(r.documento.correlativo) + 1).padStart(10, "0"));
        printDoc(devolucionHtml(conNumero, empresaKey));
        return { error: null };
      }} seq={previstoDev} />}

    </>
  );
}


// ---- Generar Devolución (Nota de Crédito) ----
function GenerarDev({ onSave, seq }: { onSave: (d: DevDoc) => Promise<{ error: string | null }>; seq: string }) {
  const empresaDev = useEmpresaActiva();
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({ razonSocial: "", rif: "", direccion: "", telefonos: "", referencia: "", nota: "", formaPago: "" });
  const [lineas, setLineas] = useState<DevLinea[]>([]);
  const [ln, setLn] = useState<DevLinea>({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0 });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const sub = lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  // El IVA sale de la configuracion de la empresa, no de un 16 escrito aquí:
  // si cambia la alicuota, cambiarla en un solo lugar y no buscarla por el codigo.
  const cfgDev = useCarga(empresaDev, () => leerConfig(empresaDev));
  const ivaPctDev = Number(cfgDev.datos?.iva_pct) || 16;
  const total = sub * (1 + ivaPctDev / 100);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Datos de la Devolución (Nota de Crédito)" description={`N° ${seq}`}>
        <div className="space-y-3">
          <div><label className={label}>Razón social</label><input className={inputClass} value={f.razonSocial} onChange={set("razonSocial")} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={label}>RIF</label><input className={inputClass} value={f.rif} onChange={set("rif")} /></div>
            <div><label className={label}>Teléfonos</label><input className={inputClass} value={f.telefonos} onChange={set("telefonos")} /></div>
          </div>
          <div><label className={label}>Dirección</label><input className={inputClass} value={f.direccion} onChange={set("direccion")} /></div>
          <div><label className={label}>Referencia (Nota de entrega, ej. NET-0000008216)</label><input className={inputClass} value={f.referencia} onChange={set("referencia")} /></div>
          <div><label className={label}>Nota</label><input className={inputClass} value={f.nota} onChange={set("nota")} /></div>
          <div><label className={label}>Forma de pago</label><input className={inputClass} value={f.formaPago} onChange={set("formaPago")} /></div>
        </div>
      </SectionCard>

      <SectionCard title="Productos Devueltos">
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Código</label><input className={inputClass} value={ln.codigo} onChange={(e) => setLn({ ...ln, codigo: e.target.value })} /></div>
          <div><label className={label}>Cantidad</label><input type="number" min={1} className={inputClass} value={ln.cantidad} onChange={(e) => setLn({ ...ln, cantidad: Number(e.target.value) })} /></div>
          <div className="col-span-2"><label className={label}>Descripción</label><input className={inputClass} value={ln.descripcion} onChange={(e) => setLn({ ...ln, descripcion: e.target.value })} /></div>
          <div><label className={label}>Precio unit.</label><InputMonto className={inputClass} valor={ln.precio} onChange={(n) => setLn({ ...ln, precio: n })} /></div>
          <div><label className={label}>Descuento %</label><input type="number" min={0} max={100} className={inputClass} value={ln.descuento} onChange={(e) => setLn({ ...ln, descuento: Number(e.target.value) })} /></div>
        </div>
        <Button variant="secondary" icon="plus" className="mt-2" onClick={() => { if (ln.descripcion && ln.precio > 0) { setLineas([...lineas, ln]); setLn({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0 }); } }}>Agregar línea</Button>
        {lineas.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
            {lineas.map((l, i) => <li key={i} className="flex justify-between"><span className="truncate text-text">{l.cantidad} × {l.descripcion}</span><span className="text-muted">{fmtUsd(l.cantidad * l.precio * (1 - l.descuento / 100))}</span></li>)}
            <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total operación (IVA {ivaPctDev}% incl.)</span><span>{fmtUsd(total)}</span></li>
          </ul>
        )}
        {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        <Button icon="quote" className="mt-3 w-full" disabled={guardando} onClick={async () => {
          setMsg("");
          if (!f.razonSocial.trim()) return setMsg("La razón social es obligatoria.");
          if (lineas.length === 0) return setMsg("Agrega al menos un producto devuelto.");
          if (guardando) return;                    // doble clic: no emitir dos veces
          setGuardando(true);
          try {
            // Se ESPERA el resultado. Antes no se esperaba, asi que un fallo al
            // guardar pasaba desapercibido y el PDF salia igual.
            const r = await onSave({ ...f, correlativo: seq, fechaEmision: hoyISO(), fechaVenc: hoyISO(), lineas });
            if (r.error) setMsg(r.error);
            else { setLineas([]); setF({ razonSocial: "", rif: "", direccion: "", telefonos: "", referencia: "", nota: "", formaPago: "" }); }
          } finally {
            setGuardando(false);
          }
        }} cargando={guardando} textoCargando="Guardando…">Generar y guardar (PDF)</Button>
      </SectionCard>
    </div>
  );
}
