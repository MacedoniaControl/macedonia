"use client";

import { useRef, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fmtUsd } from "@/lib/ux/format";
import { presupuestoHtml, printDoc, type DevLinea } from "@/lib/ux/doc-templates";
import { ScanBar } from "@/components/inventory/ScanBar";
import { ProductSearch } from "@/components/inventory/ProductSearch";
import { lookupByCodigo, type InventoryProduct } from "@/lib/inventory/catalog";
import { beep } from "@/lib/inventory/scan-feedback";
import { useRol, puedeVerRegistros } from "@/lib/ux/session";

type Estado = "Borrador" | "Aprobada" | "Rechazada" | "Nota de entrega";
type Cotizacion = {
  id: number; correlativo: string; razonSocial: string; rif: string; direccion: string; telefonos: string;
  fechaEmision: string; fechaVenc: string; fechaISO: string; moneda: string; nota: string;
  lineas: DevLinea[]; total: number; estado: Estado; origen: "SumiControl" | "Valery"; fileName?: string; dataUrl?: string;
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
const TIPOS_PRECIO = ["Precio Máximo", "Precio Mínimo", "Precio Oferta", "Precio Mayor"];
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
  const [seq, setSeq] = usePersistedState(`cot:seq:${empresaKey}`, 2243);
  // "Generar presupuesto" es el apartado principal (lo que más se usa).
  const [tab, setTab] = useState<"registro" | "gen" | "subir">("gen");
  const [period, setPeriod] = useState("mes");
  const fileRef = useRef<HTMLInputElement>(null);
  // Los registros/logs son solo del OWNER.
  const { rol } = useRol();
  const verRegistros = puedeVerRegistros(rol);

  const filtered = cots.filter((c) => inPeriod(c.fechaISO, period));

  function generarPDF(c: Cotizacion) {
    if (c.origen === "Valery" && c.dataUrl) return window.open(c.dataUrl, "_blank");
    printDoc(presupuestoHtml({ correlativo: c.correlativo, fechaEmision: c.fechaEmision, fechaVenc: c.fechaVenc, razonSocial: c.razonSocial, rif: c.rif, direccion: c.direccion, telefonos: c.telefonos, lineas: c.lineas, moneda: c.moneda, nota: c.nota }));
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
        title="Cotizaciones / Presupuestos"
        description="Registro, generación (formato oficial Valery) e importación de presupuestos."
        breadcrumbs={[{ label: "Operación" }, { label: "Cotizaciones" }]}
        actions={verRegistros ? <StatusBadge tone="brand">{cots.length} presupuesto(s)</StatusBadge> : undefined}
      />

      <div className="sumi-tabs mb-4 gap-2">
        {([
          ["gen", "Generar presupuesto"] as const,
          ["subir", "Subir de Valery"] as const,
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

      {(tab === "gen" || (tab === "registro" && !verRegistros)) && <GenerarPresupuesto seq={seq} onSave={(c) => {
        setCots((p) => [{ ...c, id: Date.now(), estado: "Borrador", origen: "SumiControl", fechaISO: hoyISO() }, ...p]);
        setSeq((s) => s + 1);
        printDoc(presupuestoHtml(c));
      }} />}

      {tab === "subir" && (
        <SectionCard title="Subir presupuestos de Valery" description="Macedonia los guarda en el registro y los organiza por fecha.">
          <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Icon name="upload" size={24} /></span>
            <p className="mt-3 text-sm font-medium text-text">Selecciona los PDF de presupuesto de Valery</p>
            <p className="mt-1 text-xs text-muted">Se registran por fecha y quedan disponibles para consultar/imprimir.</p>
            <Button icon="upload" onClick={() => fileRef.current?.click()} className="mt-4">Seleccionar archivos</Button>
          </div>
        </SectionCard>
      )}
    </>
  );
}

// ---- Generar presupuesto (formato Valery) ----
type GenDoc = { correlativo: string; fechaEmision: string; fechaVenc: string; razonSocial: string; rif: string; direccion: string; telefonos: string; lineas: DevLinea[]; moneda: string; nota: string; total: number };

function GenerarPresupuesto({ seq, onSave }: { seq: number; onSave: (d: GenDoc) => void }) {
  const [f, setF] = useState({ razonSocial: "", rif: "", direccion: "", telefonos: "", vendedor: "01 - GERENTE", tipoPrecio: TIPOS_PRECIO[0], moneda: "Dolar", nota: "", venceDias: 5 });
  const [lineas, setLineas] = useState<DevLinea[]>([]);
  const [ln, setLn] = useState<DevLinea>({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0, unidad: "UNIDAD" });
  const [msg, setMsg] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pick = (codigo: string) => { const p = CATALOGO.find((c) => c.codigo === codigo); if (p) setLn({ ...ln, codigo: p.codigo, descripcion: p.descripcion, precio: p.precio }); };
  const sub = lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const totalOp = sub * 1.16;

  // Agrega un producto del catálogo (escáner o buscador). Si ya está, sube la cantidad.
  // El catálogo de Valery no trae precio: el renglón nace en 0 y se completa abajo.
  function agregarProducto(p: InventoryProduct, origen: "escáner" | "buscador") {
    setMsg("");
    const i = lineas.findIndex((l) => l.codigo === p.codigo);
    if (i >= 0) {
      const nueva = lineas[i].cantidad + 1;
      setLineas(lineas.map((l, j) => (j === i ? { ...l, cantidad: nueva } : l)));
      setAviso({ ok: true, text: `${p.nombre} · cantidad ${nueva}` });
    } else {
      setLineas([...lineas, { codigo: p.codigo, descripcion: p.nombre, cantidad: 1, precio: 0, descuento: 0, unidad: ln.unidad }]);
      setAviso({ ok: true, text: `${p.nombre} agregado (${origen}) · falta indicar el precio` });
    }
  }
  function onScan(codigo: string) {
    const p = lookupByCodigo(codigo);
    if (!p) {
      beep(false);
      setAviso({ ok: false, text: `Código "${codigo}" no encontrado en el catálogo.` });
      return;
    }
    beep(true);
    agregarProducto(p, "escáner");
  }
  const updLinea = (i: number, patch: Partial<DevLinea>) => {
    setMsg("");
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <SectionCard title="Nuevo presupuesto" description={`N° ${String(seq).padStart(10, "0")}`}>
        <div className="space-y-3">
          <div><label className={lbl}>Razón social</label><input className={inputClass} value={f.razonSocial} onChange={set("razonSocial")} placeholder="Empresa externa" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>RIF</label><input className={inputClass} value={f.rif} onChange={set("rif")} /></div>
            <div><label className={lbl}>Teléfonos</label><input className={inputClass} value={f.telefonos} onChange={set("telefonos")} /></div>
          </div>
          <div><label className={lbl}>Dirección</label><input className={inputClass} value={f.direccion} onChange={set("direccion")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Vendedor</label><input className={inputClass} value={f.vendedor} onChange={set("vendedor")} /></div>
            <div><label className={lbl}>Tipo de precio</label><select className={inputClass} value={f.tipoPrecio} onChange={set("tipoPrecio")}>{TIPOS_PRECIO.map((tp) => <option key={tp}>{tp}</option>)}</select></div>
            <div><label className={lbl}>Divisa / Expresado en</label><select className={inputClass} value={f.moneda} onChange={set("moneda")}>{MONEDAS.map((mo) => <option key={mo}>{mo}</option>)}</select></div>
            <div><label className={lbl}>Caduca en (días)</label><input type="number" min={1} className={inputClass} value={f.venceDias} onChange={set("venceDias")} /></div>
          </div>
          <div><label className={lbl}>Nota</label><input className={inputClass} value={f.nota} onChange={set("nota")} /></div>
        </div>
      </SectionCard>

      <SectionCard title="Renglones" description="Escanea o busca en el catálogo para agregar; también puedes cargarlo a mano.">
        {/* Escáner de productos */}
        <ScanBar onScan={onScan} hint="Dispara el lector: el producto se agrega al presupuesto." />

        {/* Buscador del catálogo (inventario) */}
        <div className="mt-3">
          <label className={lbl}>Buscar en productos y catálogo</label>
          <ProductSearch onPick={(p) => agregarProducto(p, "buscador")} />
        </div>

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
              <span>Total operación (IVA 16%)</span><span className="tabular-nums">{fmtUsd(totalOp)}</span>
            </p>
          </>
        )}
        {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        <Button icon="quote" className="mt-3 w-full" onClick={() => {
          setMsg("");
          if (!f.razonSocial.trim()) return setMsg("La razón social es obligatoria.");
          if (lineas.length === 0) return setMsg("Agrega al menos un renglón.");
          if (lineas.some((l) => l.precio <= 0)) return setMsg("Hay renglones sin precio (marcados en rojo). Complétalos antes de generar.");
          const emision = new Date(); const venc = new Date(Date.now() + f.venceDias * 86400000);
          onSave({ correlativo: String(seq).padStart(10, "0"), fechaEmision: dmy(emision), fechaVenc: dmy(venc), razonSocial: f.razonSocial, rif: f.rif, direccion: f.direccion, telefonos: f.telefonos, lineas, moneda: f.moneda, nota: f.nota, total: totalOp });
        }}>Registrar y generar (PDF)</Button>
      </SectionCard>
    </div>
  );
}
