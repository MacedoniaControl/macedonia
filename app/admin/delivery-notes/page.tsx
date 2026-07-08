"use client";

import { useRef, useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fmtUsd } from "@/lib/ux/format";
import {
  notaEntregaHtml, devolucionHtml, printDoc, neTotals,
  type NEDoc, type DevDoc, type NELinea, type DevLinea, type NECil,
} from "@/lib/ux/doc-templates";

type Tipo = "entrega" | "devolucion";
type Doc = {
  id: string; tipo: Tipo; correlativo: string; cliente: string; fecha: string; total: number;
  origen: "SumiControl" | "Valery"; fileName?: string; dataUrl?: string; ne?: NEDoc; dev?: DevDoc;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);
const GASES = ["OXIGENO", "ACETILENO", "ARGON", "NITROGENO"];
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";
const label = "mb-1 block text-xs font-medium text-muted";

const SEED: Doc[] = [
  { id: "s1", tipo: "entrega", correlativo: "0000008203", cliente: "JOSE LUIS", fecha: hoyISO(), total: 139.2, origen: "Valery", fileName: "NET-0000008203.pdf" },
  { id: "s2", tipo: "devolucion", correlativo: "0000000603", cliente: "ELECTRIN C.A.", fecha: hoyISO(), total: 46975.13, origen: "Valery", fileName: "NC-0000000603.pdf" },
];

function inPeriod(fecha: string, period: string): boolean {
  const d = new Date(fecha + "T00:00:00");
  const n = new Date();
  if (period === "dia") return d.toDateString() === n.toDateString();
  if (period === "semana") return (n.getTime() - d.getTime()) / 86400000 <= 7 && d <= n;
  if (period === "mes") return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  return d.getFullYear() === n.getFullYear();
}

export default function DeliveryNotesPage() {
  const [docs, setDocs] = usePersistedState<Doc[]>("ne:docs", SEED);
  const [seqNE, setSeqNE] = usePersistedState("ne:seqNE", 8204);
  const [seqDev, setSeqDev] = usePersistedState("ne:seqDev", 604);
  const [tab, setTab] = useState<"registro" | "ne" | "dev" | "subir">("registro");
  const [period, setPeriod] = useState("mes");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = docs.filter((d) => inPeriod(d.fecha, period));

  function verDoc(d: Doc) {
    if (d.origen === "Valery" && d.dataUrl) return window.open(d.dataUrl, "_blank");
    if (d.ne) return printDoc(notaEntregaHtml(d.ne));
    if (d.dev) return printDoc(devolucionHtml(d.dev));
    alert("Este documento de Valery no tiene archivo adjunto en la demo (subido solo como registro).");
  }

  function onUpload(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const name = f.name.toUpperCase();
        const tipo: Tipo = /NC|CREDITO|DEVOL/.test(name) ? "devolucion" : "entrega";
        const num = (f.name.match(/\d{4,}/) || ["—"])[0];
        setDocs((prev) => [
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
        description="Registro, generación e importación de Notas de Entrega (Valery/SumiControl) y Notas de Crédito (devoluciones)."
        breadcrumbs={[{ label: "Operación" }, { label: "Notas de entrega" }]}
        actions={<StatusBadge tone="brand">{docs.length} documento(s)</StatusBadge>}
      />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([["registro", "Registro"], ["ne", "Generar nota de entrega"], ["dev", "Generar devolución"], ["subir", "Subir de Valery"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${tab === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-text hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "registro" && (
        <SectionCard title="Registro de documentos" description="Filtra por período. Incluye NE y devoluciones, de Valery y de SumiControl."
          action={
            <select className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text" value={period} onChange={(e) => setPeriod(e.target.value)}>
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
                    <td className="py-2.5 pr-3"><StatusBadge tone={d.origen === "Valery" ? "navy" : "brand"}>{d.origen}</StatusBadge></td>
                    <td className="py-2.5"><button type="button" onClick={() => verDoc(d)} className="text-sm font-medium text-brand hover:underline">Ver / PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === "ne" && <GenerarNE onSave={(ne) => {
        const t = neTotals(ne);
        setDocs((p) => [{ id: `${Date.now()}`, tipo: "entrega", correlativo: ne.correlativo, cliente: ne.cliente, fecha: ne.fecha, total: t.total, origen: "SumiControl", ne }, ...p]);
        setSeqNE((s) => s + 1);
        printDoc(notaEntregaHtml(ne));
      }} seq={seqNE} />}

      {tab === "dev" && <GenerarDev onSave={(dev, total) => {
        setDocs((p) => [{ id: `${Date.now()}`, tipo: "devolucion", correlativo: dev.correlativo, cliente: dev.razonSocial, fecha: dev.fechaEmision, total, origen: "SumiControl", dev }, ...p]);
        setSeqDev((s) => s + 1);
        printDoc(devolucionHtml(dev));
      }} seq={seqDev} />}

      {tab === "subir" && (
        <SectionCard title="Subir documentos de Valery" description="SumiControl detecta el tipo por el nombre del archivo y lo organiza en el registro por fecha.">
          <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Icon name="upload" size={24} /></span>
            <p className="mt-3 text-sm font-medium text-text">Arrastra o selecciona los PDF de Valery</p>
            <p className="mt-1 text-xs text-muted">Nombres con NET/entrega → Nota de entrega · NC/crédito/devolución → Devolución.</p>
            <Button icon="upload" onClick={() => fileRef.current?.click()} className="mt-4">Seleccionar archivos</Button>
          </div>
        </SectionCard>
      )}
    </>
  );
}

// ---- Generar Nota de Entrega ----
function GenerarNE({ onSave, seq }: { onSave: (d: NEDoc) => void; seq: number }) {
  const [f, setF] = useState({ cliente: "", rif: "", tlf: "", direccion: "", ordenCompra: "" });
  const [lineas, setLineas] = useState<NELinea[]>([]);
  const [ln, setLn] = useState<NELinea>({ cantidad: 1, unidad: "CILINDRO", descripcion: "", precio: 0 });
  const [cil, setCil] = useState<NECil[]>(GASES.map((g) => ({ gas: g, llenos: 0, vacios: 0 })));
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Datos de la nota de entrega">
        <div className="space-y-3">
          <div><label className={label}>Cliente</label><input className={inputClass} value={f.cliente} onChange={set("cliente")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>RIF / C.I.</label><input className={inputClass} value={f.rif} onChange={set("rif")} /></div>
            <div><label className={label}>Teléfono</label><input className={inputClass} value={f.tlf} onChange={set("tlf")} /></div>
          </div>
          <div><label className={label}>Dirección</label><input className={inputClass} value={f.direccion} onChange={set("direccion")} /></div>
          <div><label className={label}>Orden de compra</label><input className={inputClass} value={f.ordenCompra} onChange={set("ordenCompra")} /></div>
          <p className="text-xs font-medium text-muted">Cilindros (llenos / vacíos)</p>
          {cil.map((c, i) => (
            <div key={c.gas} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <span className="text-sm text-text">{c.gas}</span>
              <input type="number" min={0} className="h-9 w-16 rounded-lg border border-border bg-surface-2 px-2 text-center text-sm text-text" value={c.llenos} onChange={(e) => setCil(cil.map((x, j) => j === i ? { ...x, llenos: Number(e.target.value) } : x))} placeholder="Ll" />
              <input type="number" min={0} className="h-9 w-16 rounded-lg border border-border bg-surface-2 px-2 text-center text-sm text-text" value={c.vacios} onChange={(e) => setCil(cil.map((x, j) => j === i ? { ...x, vacios: Number(e.target.value) } : x))} placeholder="Va" />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Productos / líneas" description={`N° ${String(seq).padStart(10, "0")}`}>
        <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
          <div><label className={label}>Cant.</label><input type="number" min={1} className="h-10 w-16 rounded-xl border border-border bg-surface-2 px-2 text-center text-sm text-text" value={ln.cantidad} onChange={(e) => setLn({ ...ln, cantidad: Number(e.target.value) })} /></div>
          <div><label className={label}>Descripción</label><input className={inputClass} value={ln.descripcion} onChange={(e) => setLn({ ...ln, descripcion: e.target.value })} /></div>
          <div><label className={label}>Precio</label><input type="number" min={0} step="0.01" className="h-10 w-24 rounded-xl border border-border bg-surface-2 px-2 text-right text-sm text-text" value={ln.precio} onChange={(e) => setLn({ ...ln, precio: Number(e.target.value) })} /></div>
        </div>
        <Button variant="secondary" icon="plus" className="mt-2" onClick={() => { if (ln.descripcion && ln.precio > 0) { setLineas([...lineas, ln]); setLn({ ...ln, descripcion: "", precio: 0 }); } }}>Agregar línea</Button>
        {lineas.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
            {lineas.map((l, i) => <li key={i} className="flex justify-between"><span className="truncate text-text">{l.cantidad} × {l.descripcion}</span><span className="text-muted">{fmtUsd(l.cantidad * l.precio)}</span></li>)}
            <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total operación (IVA incl.)</span><span>{fmtUsd(neTotals({ ...f, correlativo: "", fecha: "", lineas, cilindros: cil } as NEDoc).total)}</span></li>
          </ul>
        )}
        {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        <Button icon="delivery" className="mt-3 w-full" onClick={() => {
          setMsg("");
          if (!f.cliente.trim()) return setMsg("El cliente es obligatorio.");
          if (lineas.length === 0) return setMsg("Agrega al menos una línea.");
          onSave({ ...f, correlativo: String(seq).padStart(10, "0"), fecha: hoyISO(), lineas, cilindros: cil });
        }}>Generar y guardar (PDF)</Button>
      </SectionCard>
    </div>
  );
}

// ---- Generar Devolución (Nota de Crédito) ----
function GenerarDev({ onSave, seq }: { onSave: (d: DevDoc, total: number) => void; seq: number }) {
  const [f, setF] = useState({ razonSocial: "", rif: "", direccion: "", telefonos: "", referencia: "", nota: "", formaPago: "" });
  const [lineas, setLineas] = useState<DevLinea[]>([]);
  const [ln, setLn] = useState<DevLinea>({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0 });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const sub = lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const total = sub * 1.16;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Datos de la devolución (Nota de Crédito)" description={`N° ${String(seq).padStart(10, "0")}`}>
        <div className="space-y-3">
          <div><label className={label}>Razón social</label><input className={inputClass} value={f.razonSocial} onChange={set("razonSocial")} /></div>
          <div className="grid grid-cols-2 gap-3">
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
            <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total operación (IVA incl.)</span><span>{fmtUsd(total)}</span></li>
          </ul>
        )}
        {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        <Button icon="quote" className="mt-3 w-full" onClick={() => {
          setMsg("");
          if (!f.razonSocial.trim()) return setMsg("La razón social es obligatoria.");
          if (lineas.length === 0) return setMsg("Agrega al menos un producto devuelto.");
          onSave({ ...f, correlativo: String(seq).padStart(10, "0"), fechaEmision: hoyISO(), fechaVenc: hoyISO(), lineas }, total);
        }}>Generar y guardar (PDF)</Button>
      </SectionCard>
    </div>
  );
}
