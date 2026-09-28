"use client";

import { useEffect } from "react";

import { useRef, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { guardarDocumento, listarDocumentos, correlativoPrevisto, type DocumentoGuardado } from "@/lib/documentos/documentos-db";
import { useCarga } from "@/lib/ux/use-carga";
import { subirArchivo, listarArchivos, urlDeArchivo, type TipoArchivo } from "@/lib/documentos/archivos-db";
import { SubirArchivo } from "@/components/ui/SubirArchivo";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtUsd } from "@/lib/ux/format";
import {
  notaEntregaHtml, devolucionHtml, printDoc,
  type NEDoc, type DevDoc,
} from "@/lib/ux/doc-templates";
import { useRol, puedeVerRegistros } from "@/lib/ux/session";
import { NuevaNotaEntrega } from "./NuevaNotaEntrega";
import { NuevaDevolucion } from "./NuevaDevolucion";
import { registrarCilindrosDeNota } from "@/lib/cilindros/cilindros-db";

type Tipo = "entrega" | "devolucion";
type Doc = {
  id: string; tipo: Tipo; correlativo: string; cliente: string; fecha: string; total: number;
  origen: "Macedonia" | "SumiControl" | "Valery"; fileName?: string; ruta?: string; ne?: NEDoc; dev?: DevDoc;
};



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
          ["dev", "Nueva Devolución"] as const,
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

        // Los cilindros de la nota entran al parque, como una entrega. Si esto
        // falla, la nota ya está emitida: se avisa y se registran a mano.
        let aviso: string | undefined;
        const ce = ne.cilindrosEntrega;
        if (ce.lineas.length) {
          const c = await registrarCilindrosDeNota(r.documento.id, ce.lineas, { autorizadoPor: ce.autorizadoPor, retiradoPor: ce.retiradoPor })
            .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
          aviso = c.ok
            ? (c.avisos.length ? `Cilindros registrados en el parque. ${c.avisos.join(" ")}` : undefined)
            : `La nota ${r.documento.correlativo} se emitió, pero sus cilindros no entraron al parque: ${c.error} Regístralos en Cilindros → Registrar Entrega.`;
        }
        return { error: null, aviso };
      }} seq={previstoNE} />}

      {tab === "dev" && <NuevaDevolucion onSave={async (dev) => {
        // Antes la devolucion solo se imprimia: no quedaba registro en ningun
        // lado. Una devolucion que no se guarda es mercaderia que volvio y que
        // el sistema sigue dando por vendida.
        const r = await guardarDocumento({
          tipo: "devolucion",
          cliente: dev.razonSocial,
          clienteRif: dev.rif,
          clienteDireccion: dev.direccion,
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
