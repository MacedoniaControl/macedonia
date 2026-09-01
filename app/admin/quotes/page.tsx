"use client";

import { useRef, useEffect, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { guardarDocumento, correlativoPrevisto } from "@/lib/documentos/documentos-db";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SubirArchivo } from "@/components/ui/SubirArchivo";
import { fmtUsd } from "@/lib/ux/format";
import { VentasExternas } from "./VentasExternas";
import { presupuestoHtml, printDoc, type DevLinea } from "@/lib/ux/doc-templates";
import { ScanBar } from "@/components/inventory/ScanBar";
import { ProductSearch } from "@/components/inventory/ProductSearch";
import { escanear, mensajeDeEscaneo, type ProductoEscaneado } from "@/lib/inventory/escanear";
import { beep } from "@/lib/inventory/scan-feedback";
import { useCarga } from "@/lib/ux/use-carga";
import { vendedoresDe } from "@/lib/auth/vendedores";
import { gases as gasesDe } from "@/lib/cilindros/cilindros-db";
import { leerConfig } from "@/lib/config/config-db";
import { useRol, puedeVerRegistros } from "@/lib/ux/session";

type Estado = "Borrador" | "Aprobada" | "Rechazada" | "Nota de entrega";
type Cotizacion = {
  id: number; correlativo: string; razonSocial: string; rif: string; direccion: string; telefonos: string;
  fechaEmision: string; fechaVenc: string; fechaISO: string; moneda: string; nota: string;
  lineas: DevLinea[]; total: number; estado: Estado; origen: "Macedonia" | "SumiControl" | "Valery"; fileName?: string; dataUrl?: string;
};

const CATALOGO = [
  { codigo: "ARG6", descripcion: "ARGON CIL 6 M3", precio: 120 },
  { codigo: "OXI6", descripcion: "OXIGENO GASEOSO CIL 6M3", precio: 16.01 },
  { codigo: "E30918", descripcion: 'ELECTRODO INOX 309L 1/8"', precio: 30 },
  { codigo: "4009MPR", descripcion: "ELECTRODO E-410 1/8", precio: 50 },
  { codigo: "8004005", descripcion: 'DISCO DE CORTE 7" x 1/16"', precio: 2.2 },
  { codigo: "2001105", descripcion: "REGULADOR DE ARGON C/ FLUJOMETRO", precio: 63.87 },
];
const MONEDAS = ["Dolar", "Bolívar"];
const TIPOS_PRECIO = ["Precio Mayorista", "Precio Oferta", "Detal"];
const UNIDADES = ["UNIDAD", "CILINDRO", "KG", "MT", "PAR", "CAJA"];
const toneOf: Record<Estado, Tone> = { Borrador: "muted", Aprobada: "info", Rechazada: "danger", "Nota de entrega": "ok" };
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Date().toISOString().slice(0, 10);
const dmy = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

function inPeriod(iso: string, period: string): boolean {
  const d = new Date(iso + "T00:00:00"); const n = new Date();
  if (period === "dia") return d.toDateString() === n.toDateString();
  if (period === "semana") return (n.getTime() - d.getTime()) / 86400000 <= 7 && d <= n;
  if (period === "mes") return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  return d.getFullYear() === n.getFullYear();
}

const SEED: Cotizacion[] = [
  { id: 1, correlativo: "0000002242", razonSocial: "SERVICIOS Y SUMINISTROS V & B, C.A", rif: "J080142489", direccion: "", telefonos: "0000", fechaEmision: dmy(new Date()), fechaVenc: dmy(new Date()), fechaISO: hoyISO(), moneda: "Dolar", nota: "", lineas: [{ codigo: "ARG6", descripcion: "ARGON CIL 6 M3", cantidad: 2, precio: 120, descuento: 0 }], total: 916.4, estado: "Aprobada", origen: "Valery", fileName: "Presupuesto-0000002242.pdf" },
];

export default function QuotesPage() {
  const empresaKey = useEmpresaActiva();
  const [cots, setCots] = usePersistedState<Cotizacion[]>(`cot:docs:${empresaKey}`, SEED);
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

  const filtered = cots.filter((c) => inPeriod(c.fechaISO, period));

  function generarPDF(c: Cotizacion) {
    if (c.origen === "Valery" && c.dataUrl) return window.open(c.dataUrl, "_blank");
    printDoc(presupuestoHtml({ correlativo: c.correlativo, fechaEmision: c.fechaEmision, fechaVenc: c.fechaVenc, razonSocial: c.razonSocial, rif: c.rif, direccion: c.direccion, telefonos: c.telefonos, lineas: c.lineas, moneda: c.moneda, nota: c.nota }, empresaKey));
  }
  function setEstado(id: number, estado: Estado) {
    setCots((prev) => prev.map((c) => (c.id === id ? { ...c, estado } : c)));
  }
  function onUpload(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const r = new FileReader();
      r.onload = () => {
        const num = (file.name.match(/\d{4,}/) || ["—"])[0];
        setCots((p) => [{ id: Date.now() + Math.random(), correlativo: num, razonSocial: "(desde archivo)", rif: "", direccion: "", telefonos: "", fechaEmision: dmy(new Date()), fechaVenc: "", fechaISO: hoyISO(), moneda: "Dolar", nota: "", lineas: [], total: 0, estado: "Aprobada", origen: "Valery", fileName: file.name, dataUrl: String(r.result) }, ...p]);
      };
      r.readAsDataURL(file);
    });
  }

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        description=""
        breadcrumbs={[{ label: "Operación" }, { label: "Cotizaciones" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {verRegistros && <StatusBadge tone="brand">{cots.length} cotización(es)</StatusBadge>}
            <SubirArchivo onArchivos={onUpload}
              ayuda="Se registran por fecha y quedan disponibles para consultar." />
          </div>
        }
      />

      <div className="sumi-tabs mb-4 gap-2">
        {([
          ["gen", "Generar presupuesto"] as const,
          // Ventas externas vive aqui, no en el menu principal: es una forma de
          // cotizar/vender, no un departamento aparte.
          ["externas", "Ventas externas"] as const,
          ...(verRegistros ? ([["registro", "Registro"]] as const) : []),
        ]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${tab === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-text hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "registro" && verRegistros && (
        <SectionCard title="Registro de presupuestos" description="Filtra por período. Incluye presupuestos de Macedonia y de Valery."
          action={<select className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="año">Año</option></select>}>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr className="border-b border-border">
                <th className="py-2.5 pr-3 font-medium">N°</th><th className="py-2.5 pr-3 font-medium">Razón social</th>
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
                        {c.origen === "SumiControl" && c.estado === "Borrador" && <>
                          <button type="button" onClick={() => setEstado(c.id, "Aprobada")} className="text-sm text-info hover:underline">Aprobar</button>
                          <button type="button" onClick={() => setEstado(c.id, "Rechazada")} className="text-sm text-muted hover:underline">Rechazar</button>
                        </>}
                        {c.origen === "SumiControl" && c.estado === "Aprobada" && <button type="button" onClick={() => setEstado(c.id, "Nota de entrega")} className="text-sm text-ok hover:underline">→ Nota de entrega</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {(tab === "gen" || (tab === "registro" && !verRegistros)) && <GenerarPresupuesto seq={previsto} onSave={async (c) => {
        // Guardar primero, imprimir después: el número solo existe una vez que
        // la base lo reservó.
        const r = await guardarDocumento({
          tipo: "cotizacion",
          cliente: c.razonSocial,
          clienteRif: c.rif,
          clienteDireccion: c.direccion,
          lineas: c.lineas.map((l) => ({
            codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad,
            unidad: l.unidad, precio: l.precio, descuento: l.descuento,
          })),
        }, empresaKey);

        if (!r.ok) return { error: r.error };

        const conNumero = { ...c, correlativo: r.documento.correlativo };
        setCots((p) => [{ ...conNumero, id: r.documento.id, estado: "Borrador", origen: "Macedonia", fechaISO: hoyISO() }, ...p]);
        setPrevisto(String(Number(r.documento.correlativo) + 1).padStart(10, "0"));
        printDoc(presupuestoHtml(conNumero, empresaKey));
        return { error: null };
      }} />}

      {tab === "externas" && <VentasExternas />}

    </>
  );
}

// ---- Generar presupuesto (formato Valery) ----
type GenDoc = { correlativo: string; fechaEmision: string; fechaVenc: string; razonSocial: string; rif: string; direccion: string; telefonos: string; lineas: DevLinea[]; moneda: string; nota: string; total: number };

function GenerarPresupuesto({ seq, onSave }: { seq: string; onSave: (d: GenDoc) => Promise<{ error: string | null }> }) {
  const [guardando, setGuardando] = useState(false);
  const empresaKey = useEmpresaActiva();
  const [f, setF] = useState({ razonSocial: "", rif: "", direccion: "", telefonos: "", vendedor: "", tipoPrecio: TIPOS_PRECIO[0], moneda: "Dolar", nota: "", venceDias: 5 });

  // El vendedor sale de la tabla de usuarios: antes era un texto fijo igual
  // para todos y no se sabia quien habia hecho cada cotizacion.
  const cargaVend = useCarga(empresaKey, () => vendedoresDe(empresaKey));
  const vendedores = cargaVend.datos ?? [];

  // Se venden gases, asi que tienen que poder elegirse en un presupuesto.
  const cargaGases = useCarga(empresaKey, () => gasesDe(empresaKey));
  const gases = cargaGases.datos ?? [];

  const cfg = useCarga(empresaKey, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;
  const [lineas, setLineas] = useState<DevLinea[]>([]);
  const [ln, setLn] = useState<DevLinea>({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0, unidad: "UNIDAD" });
  const [msg, setMsg] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pick = (codigo: string) => { const p = CATALOGO.find((c) => c.codigo === codigo); if (p) setLn({ ...ln, codigo: p.codigo, descripcion: p.descripcion, precio: p.precio }); };
  const sub = lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const totalOp = sub * (1 + ivaPct / 100);

  // Agrega un producto del catálogo (escáner o buscador). Si ya está, sube la cantidad.
  // El catálogo de Valery no trae precio: el renglón nace en 0 y se completa abajo.
  function agregarProducto(p: ProductoEscaneado, origen: "escáner" | "buscador") {
    setMsg("");
    // Forma funcional: entre que salió la consulta y volvió, pudo entrar otra
    // lectura. Leer `lineas` de la clausura la perdería en silencio.
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.codigo === p.codigo);
      if (i >= 0) {
        const nueva = prev[i].cantidad + 1;
        setAviso({ ok: true, text: `${p.nombre} · cantidad ${nueva}` });
        return prev.map((l, j) => (j === i ? { ...l, cantidad: nueva } : l));
      }
      setAviso({
        ok: true,
        text: p.precio > 0
          ? `${p.nombre} agregado (${origen})`
          : `${p.nombre} agregado (${origen}) · falta indicar el precio`,
      });
      return [...prev, {
        codigo: p.codigo, descripcion: p.nombre, cantidad: 1,
        precio: p.precio, descuento: 0, unidad: p.unidad ?? ln.unidad,
      }];
    });
  }
  async function onScan(codigo: string) {
    const r = await escanear(codigo, empresaKey);
    if (r.estado !== "encontrado") {
      beep(false);
      setAviso(mensajeDeEscaneo(r));
      return;
    }
    beep(true);
    agregarProducto(r.producto, "escáner");
  }
  const updLinea = (i: number, patch: Partial<DevLinea>) => {
    setMsg("");
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr_1fr] lg:grid-cols-2">
      <SectionCard title="Nueva cotización" description={`N° ${String(seq).padStart(10, "0")}`}>
        <div className="space-y-3">
          <div><label className={lbl}>Razón social</label><input className={inputClass} value={f.razonSocial} onChange={set("razonSocial")} placeholder="Empresa externa" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>RIF</label><input className={inputClass} value={f.rif} onChange={set("rif")} /></div>
            <div><label className={lbl}>Teléfonos</label><input className={inputClass} value={f.telefonos} onChange={set("telefonos")} /></div>
          </div>
          <div><label className={lbl}>Dirección</label><input className={inputClass} value={f.direccion} onChange={set("direccion")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Vendedor</label>
              <select className={inputClass} value={f.vendedor} onChange={set("vendedor")}>
                <option value="">— elegir —</option>
                {vendedores.map((v) => <option key={v.id} value={v.nombre}>{v.nombre} · {v.rol}</option>)}
              </select>
              {cargaVend.error && <span className="mt-1 block text-xs text-danger">{cargaVend.error}</span>}
            </div>
            <div><label className={lbl}>Tipo de precio</label><select className={inputClass} value={f.tipoPrecio} onChange={set("tipoPrecio")}>{TIPOS_PRECIO.map((tp) => <option key={tp}>{tp}</option>)}</select></div>
            <div><label className={lbl}>Divisa / Expresado en</label><select className={inputClass} value={f.moneda} onChange={set("moneda")}>{MONEDAS.map((mo) => <option key={mo}>{mo}</option>)}</select></div>
            <div><label className={lbl}>Caduca en (días)</label><input type="number" min={1} className={inputClass} value={f.venceDias} onChange={set("venceDias")} /></div>
          </div>
          <div><label className={lbl}>Nota</label><input className={inputClass} value={f.nota} onChange={set("nota")} /></div>
        </div>
      </SectionCard>

      <SectionCard title="Renglones" description="">
        {/* Buscar por texto, o escanear. El escáner vive en una píldora al lado
            del buscador: se usa con el lector en la mano, no siempre. */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className={lbl}>Buscar producto</label>
            <ProductSearch onPick={(p) => agregarProducto(p, "buscador")} />
          </div>
          <button
            type="button"
            onClick={() => setEscaneando((v) => !v)}
            aria-pressed={escaneando}
            className={`flex h-11 flex-none items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition
              ${escaneando
                ? "border-brand-strong bg-brand-soft text-brand"
                : "border-border-strong bg-surface text-text hover:bg-surface-2"}`}
          >
            <Icon name="scan" size={16} />
            {escaneando ? "Escaneando…" : "Escanear"}
          </button>
        </div>

        {escaneando && (
          <div className="mt-3">
            <ScanBar onScan={onScan} hint="Dispará el lector: el producto se agrega solo." />
          </div>
        )}

        {/* Gases: se venden, así que tienen que poder elegirse. */}
        {gases.length > 0 && (
          <div className="mt-3">
            <label className={lbl}>Agregar gases</label>
            <div className="flex flex-wrap gap-1.5">
              {gases.map((g) => (
                <button
                  key={g.nombre}
                  type="button"
                  onClick={() => agregarProducto(
                    { codigo: g.nombre, nombre: g.nombre, precio: 0, unidad: "CILINDRO" } as ProductoEscaneado,
                    "buscador",
                  )}
                  className="min-h-9 rounded-full border border-border bg-surface px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-text"
                >
                  + {g.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {aviso && (
          <p className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
            <Icon name={aviso.ok ? "check" : "alert"} size={14} /> {aviso.text}
          </p>
        )}

        <p className="mb-2 mt-4 border-t border-border pt-3 text-xs font-medium text-muted">Carga manual</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>Del catálogo</label><select className={inputClass} value={ln.codigo} onChange={(e) => pick(e.target.value)}><option value="">— elegir —</option>{CATALOGO.map((p) => <option key={p.codigo} value={p.codigo}>{p.descripcion}</option>)}</select></div>
          <div><label className={lbl}>Código</label><input className={inputClass} value={ln.codigo} onChange={(e) => setLn({ ...ln, codigo: e.target.value })} /></div>
          <div className="col-span-2"><label className={lbl}>Descripción</label><input className={inputClass} value={ln.descripcion} onChange={(e) => setLn({ ...ln, descripcion: e.target.value })} /></div>
          <div><label className={lbl}>Cantidad</label><input type="number" min={1} className={inputClass} value={ln.cantidad} onChange={(e) => setLn({ ...ln, cantidad: Number(e.target.value) })} /></div>
          <div><label className={lbl}>Und.</label><select className={inputClass} value={ln.unidad} onChange={(e) => setLn({ ...ln, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></div>
          <div><label className={lbl}>Precio</label><input type="number" min={0} step="0.01" className={inputClass} value={ln.precio} onChange={(e) => setLn({ ...ln, precio: Number(e.target.value) })} /></div>
          <div><label className={lbl}>Dcto %</label><input type="number" min={0} max={100} className={inputClass} value={ln.descuento} onChange={(e) => setLn({ ...ln, descuento: Number(e.target.value) })} /></div>
        </div>
        <Button variant="secondary" icon="plus" className="mt-2" onClick={() => { if (ln.descripcion && ln.precio > 0) { setLineas([...lineas, ln]); setLn({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0, unidad: ln.unidad }); } }}>Agregar renglón</Button>
        {lineas.length > 0 && (
          <>
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
                          className="h-8 w-14 rounded-lg border border-border bg-surface-2 px-2 text-center text-sm text-text"
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
                      <td className="py-1.5 pr-2 text-right text-muted">{fmtUsd(l.cantidad * l.precio * (1 - l.descuento / 100))}</td>
                      <td className="py-1.5 text-right">
                        <button type="button" aria-label={`Quitar ${l.descripcion}`} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                          className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger"><Icon name="close" size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold text-text">
              <span>Total operación (IVA {ivaPct}%)</span><span className="tabular-nums">{fmtUsd(totalOp)}</span>
            </p>
          </>
        )}
        {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        <Button icon="quote" className="mt-3 w-full" disabled={guardando} onClick={async () => {
          setMsg("");
          if (!f.razonSocial.trim()) return setMsg("La razón social es obligatoria.");
          if (lineas.length === 0) return setMsg("Agrega al menos un renglón.");
          if (lineas.some((l) => l.precio <= 0)) return setMsg("Hay renglones sin precio (marcados en rojo). Complétalos antes de generar.");
          const emision = new Date(); const venc = new Date(Date.now() + f.venceDias * 86400000);
          if (guardando) return;                       // doble clic: no emitir dos veces
          setGuardando(true);
          try {
            const r = await onSave({ correlativo: seq, fechaEmision: dmy(emision), fechaVenc: dmy(venc), razonSocial: f.razonSocial, rif: f.rif, direccion: f.direccion, telefonos: f.telefonos, lineas, moneda: f.moneda, nota: f.nota, total: totalOp });
            if (r.error) setMsg(r.error);
            else setLineas([]);
          } finally {
            setGuardando(false);
          }
        }}>{guardando ? "Guardando…" : "Registrar y generar (PDF)"}</Button>
      </SectionCard>

      {/* Vista previa. Se ve mientras se arma, no después de emitir: corregir un
          documento ya generado cuesta un correlativo quemado. */}
      <SectionCard title="Vista previa" description="Así va a salir el documento.">
        <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-display text-base font-semibold text-text">Cotización</p>
              <p className="font-mono text-xs text-muted">N° {String(seq).padStart(10, "0")}</p>
            </div>
            <div className="text-right text-xs text-muted">
              <p>{f.tipoPrecio}</p>
              <p>{f.moneda}</p>
              <p>Vence en {f.venceDias} día(s)</p>
            </div>
          </div>

          <div className="grid gap-1 py-3 text-xs">
            <p><span className="text-muted">Cliente: </span>
              <span className="text-text">{f.razonSocial || <em className="text-muted">sin completar</em>}</span></p>
            {f.rif && <p><span className="text-muted">RIF: </span><span className="font-mono text-text">{f.rif}</span></p>}
            {f.direccion && <p><span className="text-muted">Dirección: </span><span className="text-text">{f.direccion}</span></p>}
            <p><span className="text-muted">Vendedor: </span>
              <span className="text-text">{f.vendedor || <em className="text-muted">sin elegir</em>}</span></p>
          </div>

          {lineas.length === 0 ? (
            <p className="border-t border-border py-6 text-center text-xs text-muted">
              Todavía no hay renglones. Escaneá, buscá o agregá un gas.
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
                      {fmtUsd(l.cantidad * l.precio * (1 - l.descuento / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border">
                <tr><td colSpan={3} className="py-1.5 text-right text-muted">Subtotal</td>
                  <td className="py-1.5 text-right tabular-nums text-text">{fmtUsd(sub)}</td></tr>
                <tr><td colSpan={3} className="py-1.5 text-right text-muted">IVA {ivaPct}%</td>
                  <td className="py-1.5 text-right tabular-nums text-text">{fmtUsd(totalOp - sub)}</td></tr>
                <tr className="font-semibold"><td colSpan={3} className="py-1.5 text-right text-text">Total</td>
                  <td className="py-1.5 text-right tabular-nums text-text">{fmtUsd(totalOp)}</td></tr>
              </tfoot>
            </table>
          )}

          {f.nota && <p className="mt-3 border-t border-border pt-2 text-xs text-muted">{f.nota}</p>}
        </div>
      </SectionCard>
    </div>
  );
}
