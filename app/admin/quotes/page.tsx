"use client";

import { useRef, useEffect, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { guardarDocumento, listarDocumentos, correlativoPrevisto, type DocumentoGuardado } from "@/lib/documentos/documentos-db";
import { useCarga } from "@/lib/ux/use-carga";
import { subirArchivo, listarArchivos, urlDeArchivo } from "@/lib/documentos/archivos-db";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { SubirArchivo } from "@/components/ui/SubirArchivo";
import { fmtUsd } from "@/lib/ux/format";
import { VentasExternas } from "./VentasExternas";
import { presupuestoHtml, printDoc, type DevLinea } from "@/lib/ux/doc-templates";
import { leerConfig } from "@/lib/config/config-db";
import { NuevaCotizacion } from "./NuevaCotizacion";
import { useRol, puedeVerRegistros, puedeVerFinanzas } from "@/lib/ux/session";

type Estado = "Borrador" | "Aprobada" | "Rechazada" | "Nota de entrega";
type Cotizacion = {
  id: number; correlativo: string; razonSocial: string; rif: string; direccion: string; telefonos: string;
  fechaEmision: string; fechaVenc: string; fechaISO: string; moneda: string; nota: string;
  lineas: DevLinea[]; total: number; estado: Estado; origen: "Macedonia" | "Valery"; fileName?: string; ruta?: string;
};

const toneOf: Record<Estado, Tone> = { Borrador: "muted", Aprobada: "info", Rechazada: "danger", "Nota de entrega": "ok" };

function inPeriod(iso: string, period: string): boolean {
  const d = new Date(iso + "T00:00:00"); const n = new Date();
  if (period === "dia") return d.toDateString() === n.toDateString();
  if (period === "semana") return (n.getTime() - d.getTime()) / 86400000 <= 7 && d <= n;
  if (period === "mes") return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  return d.getFullYear() === n.getFullYear();
}

function deDocumento(d: DocumentoGuardado): Cotizacion {
  return {
    id: d.id,
    correlativo: d.correlativo,
    razonSocial: d.cliente,
    rif: d.clienteRif ?? "",
    direccion: "",
    telefonos: "",
    fechaEmision: d.fecha,
    fechaVenc: "",
    fechaISO: d.fecha,
    moneda: "Dólar",
    nota: "",
    lineas: d.lineas.map((l) => ({
      codigo: l.codigo, descripcion: l.descripcion,
      cantidad: l.cantidad, precio: l.precio, descuento: l.descuento ?? 0,
    })),
    total: d.total,
    estado: "Aprobada",
    origen: "Macedonia",
  };
}

export default function QuotesPage() {
  const empresaKey = useEmpresaActiva();
  // El registro sale de la BASE. Los PDF que se suben de Valery son archivos,
  // no registros, y siguen en el navegador porque todavía no hay dónde
  // guardarlos. Mismo criterio que en notas de entrega.
  // Los PDF de Valery salen de Storage, no de localStorage.
  const [recargaArchivos, setRecargaArchivos] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [avisoSubida, setAvisoSubida] = useState<string | null>(null);

  const cargaArchivos = useCarga(
    `${empresaKey}:${recargaArchivos}`,
    () => listarArchivos(empresaKey, ["cotizacion"]),
  );
  const subidos: Cotizacion[] = (cargaArchivos.datos ?? []).map((a) => ({
    id: a.id, correlativo: a.correlativo ?? "—", razonSocial: "(desde archivo)",
    rif: "", direccion: "", telefonos: "",
    fechaEmision: a.fecha, fechaVenc: "", fechaISO: a.fecha,
    moneda: "Dólar", nota: "", lineas: [], total: 0,
    estado: "Aprobada" as Estado, origen: "Valery" as const,
    fileName: a.nombre, ruta: a.ruta,
  }));
  const [recarga, setRecarga] = useState(0);

  const guardadas = useCarga(`${empresaKey}:${recarga}`, () => listarDocumentos(empresaKey, "cotizacion", 200));
  const cots: Cotizacion[] = [
    ...(guardadas.datos ?? []).map(deDocumento),
    ...subidos,
  ].sort((a, b) => (a.fechaISO < b.fechaISO ? 1 : a.fechaISO > b.fechaISO ? -1 : 0));
  // El número lo da la BASE, no un contador del navegador. Esto es solo la
  // previsión que se muestra antes de generar.
  const [previsto, setPrevisto] = useState("…");
  useEffect(() => {
    correlativoPrevisto(empresaKey, "cotizacion").then(setPrevisto).catch(() => setPrevisto("—"));
  }, [empresaKey]);
  // "Generar presupuesto" es el apartado principal (lo que más se usa).
  const [tab, setTab] = useState<"registro" | "gen" | "externas">("gen");
  const [period, setPeriod] = useState("mes");
  const fileRef = useRef<HTMLInputElement>(null);
  // Los registros/logs son solo del OWNER.
  const { rol } = useRol();
  const verRegistros = puedeVerRegistros(rol);
  // El panel de vendedores externos muestra comisiones: solo Owner y Administrador.
  const verExternos = puedeVerFinanzas(rol);

  const filtered = cots.filter((c) => inPeriod(c.fechaISO, period));
  const cfg = useCarga(`cfg:${empresaKey}`, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;

  function generarPDF(c: Cotizacion) {
    if (c.origen === "Valery" && c.ruta) return void abrirArchivo(c.ruta);
    printDoc(presupuestoHtml({ correlativo: c.correlativo, fechaEmision: c.fechaEmision, fechaVenc: c.fechaVenc, razonSocial: c.razonSocial, rif: c.rif, direccion: c.direccion, telefonos: c.telefonos, lineas: c.lineas, moneda: c.moneda, nota: c.nota }, empresaKey));
  }
  async function abrirArchivo(ruta: string) {
    const url = await urlDeArchivo(ruta);
    if (url) window.open(url, "_blank");
    else setAvisoSubida("No se pudo abrir el archivo.");
  }
  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    const fallos: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const r = await subirArchivo(f, "cotizacion", empresaKey);
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

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        breadcrumbs={[{ label: "Operación" }, { label: "Cotizaciones" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {verRegistros && <StatusBadge tone="brand">{cots.length} cotización(es)</StatusBadge>}
            {avisoSubida && (
              <span className="text-xs text-muted" role="status">{avisoSubida}</span>
            )}
            <SubirArchivo onArchivos={onUpload} etiqueta={subiendo ? "Subiendo…" : "Subir Archivo"}
              ayuda="Se registran por fecha y quedan disponibles para consultar." />
          </div>
        }
      />

      <div className="sumi-tabs mb-4 gap-2">
        {([
          ["gen", "Nueva Cotización"] as const,
          // Ventas externas vive aqui, no en el menu principal: es una forma de
          // cotizar/vender, no un departamento aparte.
          ...(verExternos ? ([["externas", "Vendedores Externos"]] as const) : []),
          ...(verRegistros ? ([["registro", "Registro"]] as const) : []),
        ]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${tab === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-text hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "registro" && verRegistros && (
        <SectionCard title="Registro de Presupuestos"
          action={<select className="sumi-campo w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="año">Año</option></select>}>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr className="border-b border-border">
                <th className="py-2.5 pr-3 font-medium">N°</th><th className="py-2.5 pr-3 font-medium">Razón Social</th>
                <th className="py-2.5 pr-3 font-medium">Fecha</th><th className="py-2.5 pr-3 text-right font-medium">Total</th>
                <th className="py-2.5 pr-3 font-medium">Origen</th><th className="py-2.5 pr-3 font-medium">Estado</th>
                <th className="py-2.5 font-medium">Acciones</th></tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">Sin presupuestos en este período.</td></tr>}
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{c.correlativo}</td>
                    <td className="py-2.5 pr-3 text-text">{c.razonSocial}</td>
                    <td className="py-2.5 pr-3 text-muted">{c.fechaEmision}</td>
                    <td className="py-2.5 pr-3 text-right text-text">{c.total ? fmtUsd(c.total) : "—"}</td>
                    <td className="py-2.5 pr-3"><StatusBadge tone={c.origen === "Valery" ? "navy" : "brand"}>{c.origen === "Valery" ? "Valery" : "Macedonia"}</StatusBadge></td>
                    <td className="py-2.5 pr-3"><StatusBadge tone={toneOf[c.estado]}>{c.estado}</StatusBadge></td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => generarPDF(c)} className="text-sm font-medium text-brand hover:underline">Ver / PDF</button>
                        {/* Aprobar / Rechazar / Convertir vivían aquí para el
                            origen "SumiControl", que ya nadie produce: los
                            documentos vienen de la base o de Storage. Eran
                            botones que no se dibujaban nunca. Cuando haga falta
                            un flujo de aprobación, el estado tiene que vivir en
                            la tabla `documentos`, no en el navegador. */}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {(tab === "gen" || (tab === "registro" && !verRegistros)) && <NuevaCotizacion seq={previsto} onSave={async (c) => {
        // Guardar primero, imprimir después: el número solo existe una vez que
        // la base lo reservó.
        const r = await guardarDocumento({
          tipo: "cotizacion",
          cliente: c.razonSocial,
          clienteRif: c.rif,
          clienteDireccion: c.direccion,
          vendedorExterno: c.vendedorExterno,
          lineas: c.lineas.map((l) => ({
            codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad,
            unidad: l.unidad, precio: l.precio, descuento: l.descuento,
          })),
        }, empresaKey);

        if (!r.ok) return { error: r.error };

        const conNumero = { ...c, correlativo: r.documento.correlativo };
        // Se relee de la base: empujar la fila a mano mostraría algo que quizá
        // no se guardó igual.
        setRecarga((n) => n + 1);
        setPrevisto(String(Number(r.documento.correlativo) + 1).padStart(10, "0"));
        printDoc(presupuestoHtml({ ...conNumero, lineas: c.lineasImpresas, ivaPct }, empresaKey));
        return { error: null };
      }} />}

      {tab === "externas" && verExternos && <VentasExternas />}

    </>
  );
}
