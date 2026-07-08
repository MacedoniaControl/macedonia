"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";
import { presupuestoHtml, printDoc, type DevLinea } from "@/lib/ux/doc-templates";

type Estado = "Borrador" | "Aprobada" | "Rechazada" | "Nota de entrega";
type Cotizacion = {
  id: number; correlativo: string; razonSocial: string; rif: string; direccion: string; telefonos: string;
  fechaEmision: string; fechaVenc: string; moneda: string; nota: string; lineas: DevLinea[]; total: number; estado: Estado;
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
const toneOf: Record<Estado, Tone> = { Borrador: "muted", Aprobada: "info", Rechazada: "danger", "Nota de entrega": "ok" };
const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";
const lbl = "mb-1 block text-xs font-medium text-muted";
const dmy = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

export default function QuotesPage() {
  const [cots, setCots] = usePersistedState<Cotizacion[]>("cot:lista", []);
  const [seq, setSeq] = usePersistedState("cot:seq", 2243);
  const [f, setF] = useState({ razonSocial: "", rif: "", direccion: "", telefonos: "", moneda: "Dolar", nota: "", venceDias: 5 });
  const [lineas, setLineas] = useState<DevLinea[]>([]);
  const [ln, setLn] = useState<DevLinea>({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0 });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function pick(codigo: string) {
    const p = CATALOGO.find((c) => c.codigo === codigo);
    if (p) setLn({ ...ln, codigo: p.codigo, descripcion: p.descripcion, precio: p.precio });
  }
  function addLinea() {
    if (!ln.descripcion || ln.precio <= 0) return;
    setLineas([...lineas, ln]);
    setLn({ codigo: "", descripcion: "", cantidad: 1, precio: 0, descuento: 0 });
  }

  const sub = lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const totalOp = sub * 1.16;

  function crear() {
    setMsg("");
    if (!f.razonSocial.trim()) return setMsg("ERR:La razón social es obligatoria.");
    if (lineas.length === 0) return setMsg("ERR:Agrega al menos un producto.");
    const correlativo = String(seq).padStart(10, "0");
    const emision = new Date();
    const venc = new Date(Date.now() + f.venceDias * 86400000);
    setCots((prev) => [{
      id: Date.now(), correlativo, razonSocial: f.razonSocial, rif: f.rif, direccion: f.direccion, telefonos: f.telefonos,
      fechaEmision: dmy(emision), fechaVenc: dmy(venc), moneda: f.moneda, nota: f.nota, lineas, total: totalOp, estado: "Borrador",
    }, ...prev]);
    setSeq((s) => s + 1);
    setLineas([]);
    setMsg(`Presupuesto ${correlativo} creado en borrador.`);
  }

  function generarPDF(c: Cotizacion) {
    printDoc(presupuestoHtml({
      correlativo: c.correlativo, fechaEmision: c.fechaEmision, fechaVenc: c.fechaVenc,
      razonSocial: c.razonSocial, rif: c.rif, direccion: c.direccion, telefonos: c.telefonos,
      lineas: c.lineas, moneda: c.moneda, nota: c.nota,
    }));
  }
  function setEstado(id: number, estado: Estado, nota: string) {
    setCots((prev) => prev.map((c) => (c.id === id ? { ...c, estado } : c)));
    setMsg(nota);
  }

  return (
    <>
      <PageHeader
        title="Cotizaciones / Presupuestos"
        description="Genera presupuestos con el formato oficial (como Valery). Flujo: Borrador → Aprobada → Nota de entrega."
        breadcrumbs={[{ label: "Operación" }, { label: "Cotizaciones" }]}
        actions={<StatusBadge tone="brand">{cots.length} presupuesto(s)</StatusBadge>}
      />

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
              <div><label className={lbl}>Expresado en</label><select className={inputClass} value={f.moneda} onChange={set("moneda")}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select></div>
              <div><label className={lbl}>Vence en (días)</label><input type="number" min={1} className={inputClass} value={f.venceDias} onChange={set("venceDias")} /></div>
            </div>
            <div><label className={lbl}>Nota</label><input className={inputClass} value={f.nota} onChange={set("nota")} /></div>

            <p className="border-t border-border pt-2 text-xs font-medium text-muted">Renglones</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>Producto del catálogo</label><select className={inputClass} value={ln.codigo} onChange={(e) => pick(e.target.value)}><option value="">— elegir —</option>{CATALOGO.map((p) => <option key={p.codigo} value={p.codigo}>{p.descripcion}</option>)}</select></div>
              <div><label className={lbl}>Código</label><input className={inputClass} value={ln.codigo} onChange={(e) => setLn({ ...ln, codigo: e.target.value })} /></div>
              <div className="col-span-2"><label className={lbl}>Descripción</label><input className={inputClass} value={ln.descripcion} onChange={(e) => setLn({ ...ln, descripcion: e.target.value })} /></div>
              <div><label className={lbl}>Cantidad</label><input type="number" min={1} className={inputClass} value={ln.cantidad} onChange={(e) => setLn({ ...ln, cantidad: Number(e.target.value) })} /></div>
              <div><label className={lbl}>Precio</label><input type="number" min={0} step="0.01" className={inputClass} value={ln.precio} onChange={(e) => setLn({ ...ln, precio: Number(e.target.value) })} /></div>
              <div><label className={lbl}>Descuento %</label><input type="number" min={0} max={100} className={inputClass} value={ln.descuento} onChange={(e) => setLn({ ...ln, descuento: Number(e.target.value) })} /></div>
            </div>
            <Button variant="secondary" icon="plus" onClick={addLinea}>Agregar renglón</Button>

            {lineas.length > 0 && (
              <ul className="space-y-1 border-t border-border pt-2 text-sm">
                {lineas.map((l, i) => <li key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate text-text">{l.cantidad} × {l.codigo} {l.descripcion}</span><span className="text-muted">{fmtUsd(l.cantidad * l.precio * (1 - l.descuento / 100))}</span></li>)}
                <li className="flex justify-between border-t border-border pt-1"><span className="text-muted">Base</span><span className="text-text">{fmtUsd(sub)}</span></li>
                <li className="flex justify-between font-semibold"><span>Total operación (IVA 16%)</span><span>{fmtUsd(totalOp)}</span></li>
              </ul>
            )}
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="quote" onClick={crear} className="w-full">Crear presupuesto (borrador)</Button>
          </div>
        </SectionCard>

        <SectionCard title="Presupuestos" description="Genera el PDF oficial, aprueba o convierte a nota de entrega.">
          {cots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Aún no hay presupuestos. Crea uno a la izquierda.</p>
          ) : (
            <ul className="space-y-2">
              {cots.map((c) => (
                <li key={c.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{c.correlativo}</span>
                    <StatusBadge tone={toneOf[c.estado]}>{c.estado}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text">{c.razonSocial} · {c.lineas.length} ítem(s) · {fmtUsd(c.total)} · {c.moneda}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" icon="report" onClick={() => generarPDF(c)}>Presupuesto (PDF)</Button>
                    {c.estado === "Borrador" && (
                      <>
                        <Button variant="secondary" onClick={() => setEstado(c.id, "Aprobada", `${c.correlativo} aprobado.`)}>Aprobar</Button>
                        <Button variant="ghost" onClick={() => setEstado(c.id, "Rechazada", `${c.correlativo} rechazado.`)}>Rechazar</Button>
                      </>
                    )}
                    {c.estado === "Aprobada" && (
                      <Button icon="delivery" onClick={() => setEstado(c.id, "Nota de entrega", `${c.correlativo} → convertido a nota de entrega.`)}>Convertir a NE</Button>
                    )}
                    {c.estado === "Nota de entrega" && <span className="self-center text-xs text-ok">✓ Convertido a nota de entrega.</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">El PDF replica el formato de presupuesto de Valery (logo, RIF, columnas y totales). Demo client-side.</p>
    </>
  );
}
