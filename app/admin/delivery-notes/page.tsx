"use client";

import { useEffect } from "react";

import { useRef, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { vendedoresDe } from "@/lib/auth/vendedores";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { guardarDocumento, listarDocumentos, correlativoPrevisto, type DocumentoGuardado } from "@/lib/documentos/documentos-db";
import { useCarga } from "@/lib/ux/use-carga";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import { SubirArchivo } from "@/components/ui/SubirArchivo";
import { SelectorCliente } from "@/components/directorio/SelectorCliente";
import { leerConfig } from "@/lib/config/config-db";
import type { Cliente } from "@/lib/directorio/directorio-db";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fmtUsd } from "@/lib/ux/format";
import { TIPOS_PRECIO, DIVISAS, UNIDADES } from "@/lib/ux/catalogos";
import {
  notaEntregaHtml, devolucionHtml, printDoc, neTotals,
  type NEDoc, type DevDoc, type NELinea, type DevLinea, type NECil,
} from "@/lib/ux/doc-templates";
import { ScanBar } from "@/components/inventory/ScanBar";
import { escanear, mensajeDeEscaneo } from "@/lib/inventory/escanear";
import { beep } from "@/lib/inventory/scan-feedback";
import { useRol, puedeVerRegistros } from "@/lib/ux/session";

type Tipo = "entrega" | "devolucion";
type Doc = {
  id: string; tipo: Tipo; correlativo: string; cliente: string; fecha: string; total: number;
  origen: "Macedonia" | "SumiControl" | "Valery"; fileName?: string; dataUrl?: string; ne?: NEDoc; dev?: DevDoc;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);
const GASES = ["OXIGENO", "ACETILENO", "ARGON", "NITROGENO"];
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
  const [subidos, setSubidos] = usePersistedState<Doc[]>(`ne:subidos:${empresaKey}`, []);
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
    if (d.origen === "Valery" && d.dataUrl) return window.open(d.dataUrl, "_blank");
    if (d.ne) return printDoc(notaEntregaHtml(d.ne, empresaKey));
    if (d.dev) return printDoc(devolucionHtml(d.dev, empresaKey));
    alert("Este documento de Valery no tiene archivo adjunto.");
  }

  function onUpload(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const name = f.name.toUpperCase();
        const tipo: Tipo = /NC|CREDITO|DEVOL/.test(name) ? "devolucion" : "entrega";
        const num = (f.name.match(/\d{4,}/) || ["—"])[0];
        setSubidos((prev) => [
          { id: `${Date.now()}-${f.name}`, tipo, correlativo: num, cliente: "(desde archivo)", fecha: hoyISO(), total: 0, origen: "Valery", fileName: f.name, dataUrl: String(reader.result) },
          ...prev,
        ]);
      };
      reader.readAsDataURL(f);
    });
  }

  return (
    <>
      <PageHeader
        title="Notas de entrega y devoluciones"
        description=""
        breadcrumbs={[{ label: "Operación" }, { label: "Notas de entrega" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {verRegistros && <StatusBadge tone="brand">{docs.length} documento(s)</StatusBadge>}
            <SubirArchivo onArchivos={onUpload}
              ayuda="NET/entrega → Nota de entrega · NC/crédito/devolución → Devolución." />
          </div>
        }
      />

      {/* Tabs */}
      <div className="sumi-tabs mb-4 gap-2">
        {([
          ["ne", "Generar nota de entrega"] as const,
          ["dev", "Generar devolución"] as const,
          ...(verRegistros ? ([["registro", "Registro"]] as const) : []),
        ]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${tab === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-text hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "registro" && verRegistros && (
        <SectionCard title="Registro de documentos" description="Filtra por período. Incluye NE y devoluciones, de Valery y de Macedonia."
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

      {(tab === "ne" || (tab === "registro" && !verRegistros)) && <GenerarNE onSave={async (ne) => {
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

        const conNumero = { ...ne, correlativo: r.documento.correlativo };
        const t = neTotals(conNumero);
        void t;
        // No se agrega a mano a la lista: se relee de la base. Empujar la fila
        // aca dejaria la pantalla mostrando algo que quiza no se guardo igual.
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


/** Formulario en blanco. Se reutiliza al limpiar tras guardar. */
const formularioVacio = () => ({
  cliente: "", rif: "", tlf: "", direccion: "", ordenCompra: "", notas: "",
  vendedor: "", deposito: "", tipoPrecio: TIPOS_PRECIO[0], divisa: DIVISAS[0],
});

function GenerarNE({ onSave, seq }: { onSave: (d: NEDoc) => Promise<{ error: string | null }>; seq: string }) {
  const empresaKey = useEmpresaActiva();
  const [guardando, setGuardando] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const cfg = useCarga(empresaKey, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;
  // El IVA se enciende solo cuando el pago es en bolivares — la regla del
  // negocio — pero el vendedor puede cambiarlo: tiene al cliente enfrente y
  // sabe cosas que el sistema no.
  // null = seguir la moneda. Un booleano guardado necesitaria un efecto que lo
  // sincronice, y ese efecto encadena renders. Derivarlo no necesita efecto.
  const [ivaManual, setIvaManual] = useState<boolean | null>(null);

  const [f, setF] = useState(formularioVacio());

  // El IVA sigue a la moneda salvo que el vendedor lo haya tocado a mano.
  const llevaIva = ivaManual ?? f.divisa === "Bolívar";
  const [lineas, setLineas] = useState<NELinea[]>([]);
  const [ln, setLn] = useState<NELinea>({ codigo: "", cantidad: 1, unidad: "CILINDRO", descripcion: "", precio: 0, descuento: 0 });
  const [cil, setCil] = useState<NECil[]>(GASES.map((g) => ({ gas: g, llenos: 0, vacios: 0 })));
  const [msg, setMsg] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  // Escanear un producto lo agrega como renglón; si ya está, sube la cantidad.
  // El catálogo de Valery no trae precio, por eso el renglón nace en 0 y se
  // completa en la lista (ver guard al registrar).
  async function onScan(codigo: string) {
    setMsg("");
    const r = await escanear(codigo, empresaKey);

    // Tres desenlaces, no dos: "no está en el catálogo" y "el sistema no
    // respondió" exigen acciones distintas del operador.
    if (r.estado !== "encontrado") {
      beep(false);
      setScanMsg(mensajeDeEscaneo(r));
      return;
    }

    const p = r.producto;
    beep(true);
    // Se usa la forma funcional: entre que salió la petición y volvió, el
    // operador pudo haber escaneado otra cosa. Leer `lineas` de la clausura
    // perdería esa lectura en silencio.
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.codigo === p.codigo);
      if (i >= 0) {
        const nueva = prev[i].cantidad + 1;
        setScanMsg({ ok: true, text: `${p.nombre} · cantidad ${nueva}` });
        return prev.map((l, j) => (j === i ? { ...l, cantidad: nueva } : l));
      }
      setScanMsg({
        ok: true,
        text: p.precio > 0 ? `${p.nombre} agregado` : `${p.nombre} agregado · falta indicar el precio`,
      });
      return [...prev, {
        codigo: p.codigo,
        descripcion: p.nombre,
        cantidad: 1,
        unidad: p.unidad ?? ln.unidad,
        precio: p.precio,   // el catálogo de la base SÍ trae precio
        descuento: 0,
      }];
    });
  }
  const updLinea = (i: number, patch: Partial<NELinea>) => {
    setMsg(""); // el aviso de "renglones sin precio" quedaría obsoleto al corregirlo
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  // Una sede por empresa: el deposito no se elige, se sabe.
  const depositoEmpresa = isEmpresaId(empresaKey) ? EMPRESAS[empresaKey].deposito : "";

  const cargaVend = useCarga(empresaKey, () => vendedoresDe(empresaKey));
  const vendedores = cargaVend.datos ?? [];

  const [escaneando, setEscaneando] = useState(false);

  const t = neTotals({ ...f, correlativo: "", fecha: "", deposito: depositoEmpresa, lineas, cilindros: cil } as NEDoc);
  const enBs = f.divisa === "Bolívar";
  // La tasa sale del BCV, no de una constante. Estaba en 49,5 mientras el BCV
  // real está cerca de 798: el total en bolívares que se le leía al cliente
  // salía DIECISÉIS VECES por debajo. El dashboard ya se había corregido; este
  // archivo, que es el documento que va al cliente, quedó afuera.
  const tasa = useTasaViva();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1fr]">
      <SectionCard title="Datos de la nota de entrega" description={`N° ${seq}`}>
        <div className="space-y-3">
          {/* Se ELIGE de la cartera, no se escribe.
              Escribir a mano convertia "Ferreteria Los Andes" y "FERRETERIA LOS
              ANDES" en dos clientes distintos, y el modulo que tiene que decir
              QUIEN TIENE LOS CILINDROS de la empresa se llenaba de duplicados.
              Al elegir se traen RIF y direccion: son datos de la ficha, no del
              documento, y retipearlos es otra forma de que difieran. */}
          <div>
            <label className={label}>Cliente</label>
            <SelectorCliente
              empresa={empresaKey}
              seleccionado={cliente}
              onSelect={(c) => {
                setCliente(c);
                setF((v) => ({
                  ...v,
                  cliente: c?.nombre ?? "",
                  rif: c?.rif ?? "",
                  direccion: c?.direccion ?? "",
                  tlf: c?.telefonos ?? "",
                }));
              }}
            />
          </div>

          {/* Quedan editables: la ficha puede estar incompleta —se cargaron
              5.028 clientes solo con el nombre— y el vendedor tiene el dato
              delante. Lo que escriba acá va al documento; completar la ficha
              es otra tarea, en su propia pantalla. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={label}>Cédula / R.I.F.</label><input className={inputClass} value={f.rif} onChange={set("rif")} /></div>
            <div><label className={label}>Teléfonos</label><input className={inputClass} value={f.tlf} onChange={set("tlf")} /></div>
          </div>
          <div><label className={label}>Dirección</label><input className={inputClass} value={f.direccion} onChange={set("direccion")} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={label}>Vendedor</label>
              {/* Sale de la tabla usuarios, igual que en Cotizaciones. Era un
                  texto fijo, "01 - GERENTE" para todos: no se sabia quien
                  habia emitido cada nota. */}
              <select className={inputClass} value={f.vendedor} onChange={set("vendedor")}>
                <option value="">— elegir —</option>
                {vendedores.map((v) => <option key={v.id} value={v.nombre}>{v.nombre} · {v.rol}</option>)}
              </select></div>
            <div><label className={label}>Depósito</label>
              {/* Cada empresa tiene UNA sede: no es una eleccion. Ofrecer las
                  dos ciudades dejaba emitir una nota de Sudematin desde
                  "Lecheria". */}
              <input className={inputClass} value={depositoEmpresa} readOnly aria-readonly="true" /></div>
            <div><label className={label}>Tipo de precio</label><select className={inputClass} value={f.tipoPrecio} onChange={set("tipoPrecio")}>{TIPOS_PRECIO.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><label className={label}>Divisa</label><select className={inputClass} value={f.divisa} onChange={set("divisa")}>{DIVISAS.map((d) => <option key={d}>{d}</option>)}</select></div>
          </div>
          <div><label className={label}>Orden de compra</label><input className={inputClass} value={f.ordenCompra} onChange={set("ordenCompra")} /></div>
          <div><label className={label}>Notas</label><input className={inputClass} value={f.notas} onChange={set("notas")} /></div>
          <p className="text-xs font-medium text-muted">Cilindros (llenos / vacíos)</p>
          {cil.map((c, i) => (
            <div key={c.gas} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <span className="text-sm text-text">{c.gas}</span>
              <input type="number" min={0} className="sumi-campo w-16 px-2 text-center" value={c.llenos} onChange={(e) => setCil(cil.map((x, j) => j === i ? { ...x, llenos: Number(e.target.value) } : x))} placeholder="Ll" />
              <input type="number" min={0} className="sumi-campo w-16 px-2 text-center" value={c.vacios} onChange={(e) => setCil(cil.map((x, j) => j === i ? { ...x, vacios: Number(e.target.value) } : x))} placeholder="Va" />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Renglones" description="">
        {/* El escáner es OPCIONAL, detrás de una píldora — igual que en
            Cotizaciones. Antes la barra estaba siempre visible y lo primero que
            veía el vendedor en la calle era "PAUSADO · los escaneos NO se
            registran": un error sobre una pistola lectora que no lleva encima. */}
        <button
          type="button"
          onClick={() => setEscaneando((v) => !v)}
          aria-pressed={escaneando}
          className={`flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition
            ${escaneando
              ? "border-brand-strong bg-brand-soft text-brand"
              : "border-border-strong bg-surface text-text hover:bg-surface-2"}`}
        >
          <Icon name="scan" size={16} />
          {escaneando ? "Escaneando…" : "Escanear"}
        </button>

        {escaneando && (
          <div className="mt-3">
            <ScanBar onScan={onScan} hint="Dispará el lector: el producto se agrega como renglón." />
          </div>
        )}
        {scanMsg && (
          <p className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${scanMsg.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
            <Icon name={scanMsg.ok ? "check" : "alert"} size={14} /> {scanMsg.text}
          </p>
        )}

        <p className="mb-2 mt-4 border-t border-border pt-3 text-xs font-medium text-muted">Carga manual</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Código</label><input className={inputClass} value={ln.codigo} onChange={(e) => setLn({ ...ln, codigo: e.target.value })} placeholder="ARG6" /></div>
          <div><label className={label}>Unidad</label><select className={inputClass} value={ln.unidad} onChange={(e) => setLn({ ...ln, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></div>
          <div className="col-span-2"><label className={label}>Nombre / Descripción</label><input className={inputClass} value={ln.descripcion} onChange={(e) => setLn({ ...ln, descripcion: e.target.value })} placeholder="ARGON CIL 6 M3" /></div>
          <div><label className={label}>Cantidad</label><input type="number" min={1} className={inputClass} value={ln.cantidad} onChange={(e) => setLn({ ...ln, cantidad: Number(e.target.value) })} /></div>
          <div><label className={label}>Precio</label><input type="number" min={0} step="0.01" className={inputClass} value={ln.precio} onChange={(e) => setLn({ ...ln, precio: Number(e.target.value) })} /></div>
          <div><label className={label}>Dcto %</label><input type="number" min={0} max={50} className={inputClass} value={ln.descuento} onChange={(e) => setLn({ ...ln, descuento: Number(e.target.value) })} /></div>
        </div>
        <Button variant="secondary" icon="plus" className="mt-2" onClick={() => { if (ln.descripcion && ln.precio > 0) { setLineas([...lineas, ln]); setLn({ codigo: "", cantidad: 1, unidad: ln.unidad, descripcion: "", precio: 0, descuento: 0 }); } }}>Agregar renglón</Button>
        {lineas.length > 0 && (
          <div className="sumi-scroll mt-3 max-w-full overflow-x-auto border-t border-border pt-2">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="pb-1 pr-2 font-medium">Cant.</th>
                  <th className="pb-1 pr-2 font-medium">Producto</th>
                  <th className="pb-1 pr-2 text-right font-medium">Precio</th>
                  <th className="pb-1 pr-2 text-right font-medium">Total</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineas.map((l, i) => (
                  <tr key={`${l.codigo}-${i}`}>
                    <td className="py-1.5 pr-2">
                      <input type="number" min={1} aria-label={`Cantidad ${l.descripcion}`}
                        className="h-8 w-14 rounded-lg border border-border-strong bg-surface-2 px-2 text-center text-sm text-text"
                        value={l.cantidad} onChange={(e) => updLinea(i, { cantidad: Number(e.target.value) })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className="block truncate text-text">{l.descripcion}</span>
                      <span className="block font-mono text-[11px] text-muted">{l.codigo}{l.descuento ? ` · -${l.descuento}%` : ""}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <input type="number" min={0} step="0.01" aria-label={`Precio ${l.descripcion}`}
                        className={`h-8 w-20 rounded-lg border bg-surface-2 px-2 text-right text-sm text-text ${l.precio <= 0 ? "border-danger" : "border-border"}`}
                        value={l.precio} onChange={(e) => updLinea(i, { precio: Number(e.target.value) })} />
                    </td>
                    <td className="py-1.5 pr-2 text-right text-muted">{fmtUsd(l.cantidad * l.precio * (1 - (l.descuento || 0) / 100))}</td>
                    <td className="py-1.5 text-right">
                      <button type="button" aria-label={`Quitar ${l.descripcion}`} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                        className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger"><Icon name="close" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Base imponible</dt><dd className="text-text">{enBs ? (tasa ? `${(t.base * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs` : "sin tasa") : fmtUsd(t.base)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">I.V.A. {ivaPct}%</dt><dd className="text-text">{enBs ? (tasa ? `${(t.iva * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs` : "sin tasa") : fmtUsd(t.iva)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>{enBs ? "Total Bs." : "Total $"}</dt><dd>{enBs ? (tasa ? `${(t.total * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs` : "sin tasa") : fmtUsd(t.total)}</dd></div>
          {enBs && <div className="flex justify-between"><dt className="text-muted">Dólar $</dt><dd className="text-muted">{fmtUsd(t.total)}</dd></div>}
        </dl>
        {enBs && !tasa && (
          <p role="alert" className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            No se pudo consultar la tasa del BCV. No emitas en bolívares hasta que cargue:
            un total inventado es peor que no tener total.
          </p>
        )}
        {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        {/* El IVA sigue a la moneda por defecto; esta casilla permite corregirlo
            sin tener que cambiar la divisa del documento. */}
        <label className="mt-3 flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3">
          <input
            type="checkbox"
            checked={llevaIva}
            onChange={(e) => setIvaManual(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-brand-strong)]"
          />
          <span className="text-sm text-text">
            Incluir IVA {ivaPct}%
            <span className="ml-1 text-xs text-muted">
              {f.divisa === "Bolívar" ? "(el pago es en bolívares)" : "(el pago es en dólares)"}
            </span>
          </span>
        </label>

        {/* Se confirma antes de emitir: pedir el numero quema un correlativo
            que no vuelve, y el documento sale impreso hacia el cliente. El
            resumen repite CLIENTE y TOTAL, que son los dos datos que duelen si
            estan mal y los unicos que el vendedor no puede corregir despues. */}
        <ConfirmDialog
          title="¿Emitir la nota de entrega?"
          message={`${f.cliente || "Sin cliente"} · ${lineas.length} renglón(es) · ${
            enBs && tasa ? `${(t.total * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs` : fmtUsd(t.total)
          }. Se consume el número ${seq} y no se puede deshacer.`}
          confirmLabel="Sí, emitir"
          onConfirm={async () => {
            if (guardando) return;                  // doble clic: no emitir dos veces
            setGuardando(true);
            try {
              const r = await onSave({ ...f, correlativo: seq, fecha: hoyISO(), lineas, cilindros: cil, llevaIva, ivaPct });
              // Si la base rechazó, hay que decirlo: antes el documento "se
              // generaba" en pantalla aunque no quedara guardado en ningún lado.
              if (r.error) setMsg(r.error);
              // Tambien se suelta el cliente elegido: si queda seleccionado,
              // la siguiente nota sale al mismo sin que nadie lo haya pedido.
              else { setLineas([]); setF(formularioVacio()); setCliente(null); }
            } finally {
              setGuardando(false);
            }
          }}
          trigger={(abrir) => (
            <Button icon="delivery" className="mt-3 w-full" cargando={guardando} textoCargando="Guardando…"
              onClick={() => {
                // Se valida ANTES de abrir el diálogo: confirmar y recién
                // entonces enterarse de que falta un precio es peor que no
                // confirmar nada.
                setMsg("");
                if (!f.cliente.trim()) return setMsg("El cliente es obligatorio.");
                if (lineas.length === 0) return setMsg("Agrega al menos un renglón.");
                if (lineas.some((l) => l.precio <= 0)) return setMsg("Hay renglones sin precio (marcados en rojo). Complétalos antes de generar.");
                abrir();
              }}>
              Registrar y generar (PDF)
            </Button>
          )}
        />
      </SectionCard>

      {/* Vista previa del documento mientras se arma.
          Cotizaciones la tenía desde el principio y notas de entrega no, al
          revés de lo que conviene: son 290 notas contra 59 facturas, y
          corregir una ya emitida cuesta un correlativo quemado.
          Se ve ANTES de emitir, que es el único momento en que sirve. */}
      <SectionCard title="Vista previa" description="Así va a salir el documento.">
        <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-display text-base font-semibold text-text">Nota de entrega</p>
              <p className="font-mono text-xs text-muted">N° {seq}</p>
            </div>
            <div className="text-right text-xs text-muted">
              <p>{f.divisa}</p>
              <p>{depositoEmpresa}</p>
              {llevaIva && <p>Con IVA {ivaPct}%</p>}
            </div>
          </div>

          <div className="grid gap-1 py-3 text-xs">
            <p><span className="text-muted">Cliente: </span>
              <span className="text-text">{f.cliente || <em className="text-muted">sin elegir</em>}</span></p>
            {f.rif && <p><span className="text-muted">RIF: </span><span className="font-mono text-text">{f.rif}</span></p>}
            {f.direccion && <p><span className="text-muted">Dirección: </span><span className="text-text">{f.direccion}</span></p>}
            {f.ordenCompra && <p><span className="text-muted">Orden de compra: </span><span className="text-text">{f.ordenCompra}</span></p>}
          </div>

          {lineas.length === 0 ? (
            <p className="border-t border-border py-6 text-center text-xs text-muted">
              Todavía no hay renglones. Escaneá o buscá un producto.
            </p>
          ) : (
            <table className="w-full border-t border-border text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 font-medium">Descripción</th>
                  <th className="py-1.5 text-right font-medium">Cant.</th>
                  <th className="py-1.5 text-right font-medium">Precio</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineas.map((l, i) => (
                  <tr key={`${l.codigo}-${i}`}>
                    <td className="py-1.5 pr-2 text-text">{l.descripcion}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{l.cantidad}</td>
                    <td className={`py-1.5 text-right tabular-nums ${l.precio > 0 ? "text-muted" : "text-danger"}`}>
                      {l.precio > 0 ? fmtUsd(l.precio) : "falta"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-text">
                      {fmtUsd(l.cantidad * l.precio * (1 - (l.descuento ?? 0) / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Los cilindros van aparte del total: son de la empresa y vuelven,
              no son mercadería vendida. */}
          {cil.some((c) => c.llenos > 0 || c.vacios > 0) && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Cilindros</p>
              {cil.filter((c) => c.llenos > 0 || c.vacios > 0).map((c) => (
                <p key={c.gas} className="flex justify-between text-xs">
                  <span className="text-text">{c.gas}</span>
                  <span className="tabular-nums text-muted">
                    {c.llenos} lleno(s) · {c.vacios} vacío(s)
                    {c.llenos !== c.vacios && (
                      <span className="ml-1.5 text-warn">
                        · queda con {Math.abs(c.llenos - c.vacios)} {c.llenos > c.vacios ? "más" : "menos"}
                      </span>
                    )}
                  </span>
                </p>
              ))}
            </div>
          )}

          {lineas.length > 0 && (
            <dl className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
              <div className="flex justify-between"><dt className="text-muted">Base</dt>
                <dd className="tabular-nums text-text">{fmtUsd(t.base)}</dd></div>
              {llevaIva && (
                <div className="flex justify-between"><dt className="text-muted">IVA {ivaPct}%</dt>
                  <dd className="tabular-nums text-text">{fmtUsd(t.iva)}</dd></div>
              )}
              <div className="flex justify-between font-semibold"><dt className="text-text">Total</dt>
                <dd className="tabular-nums text-text">
                  {enBs
                    ? (tasa ? `${(t.total * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs` : "sin tasa")
                    : fmtUsd(t.total)}
                </dd></div>
              {enBs && tasa && (
                <p className="pt-1 text-[11px] text-muted">Tasa BCV {tasa.toFixed(2)} · {fmtUsd(t.total)}</p>
              )}
            </dl>
          )}

          {f.notas && <p className="mt-3 border-t border-border pt-2 text-xs text-muted">{f.notas}</p>}
        </div>
      </SectionCard>
    </div>
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
  // El IVA sale de la configuracion de la empresa, no de un 16 escrito aca:
  // si cambia la alicuota, cambiarla en un solo lugar y no buscarla por el codigo.
  const cfgDev = useCarga(empresaDev, () => leerConfig(empresaDev));
  const ivaPctDev = Number(cfgDev.datos?.iva_pct) || 16;
  const total = sub * (1 + ivaPctDev / 100);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Datos de la devolución (Nota de Crédito)" description={`N° ${seq}`}>
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

      <SectionCard title="Productos devueltos">
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Código</label><input className={inputClass} value={ln.codigo} onChange={(e) => setLn({ ...ln, codigo: e.target.value })} /></div>
          <div><label className={label}>Cantidad</label><input type="number" min={1} className={inputClass} value={ln.cantidad} onChange={(e) => setLn({ ...ln, cantidad: Number(e.target.value) })} /></div>
          <div className="col-span-2"><label className={label}>Descripción</label><input className={inputClass} value={ln.descripcion} onChange={(e) => setLn({ ...ln, descripcion: e.target.value })} /></div>
          <div><label className={label}>Precio unit.</label><input type="number" min={0} step="0.01" className={inputClass} value={ln.precio} onChange={(e) => setLn({ ...ln, precio: Number(e.target.value) })} /></div>
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
