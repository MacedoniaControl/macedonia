"use client";

// Comisiones y bonos (Finanzas). Alimenta las partidas "Comisiones vendedores" y
// "Bono trabajadores" del Estado de Resultado. Ver lib/ux/comisiones.ts.

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtUsd } from "@/lib/ux/format";
import { useRol, puedeVerFinanzas } from "@/lib/ux/session";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import {
  useComisiones, addTrabajador, updateTrabajador, removeTrabajador,
  addVentaAsignada, removeVentaAsignada, calcular, PCT_DEFECTO,
  type TipoTrabajador,
} from "@/lib/ux/comisiones";

const fieldClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Date().toISOString().slice(0, 10);

const TIPOS: { id: TipoTrabajador; label: string }[] = [
  { id: "junior", label: "Vendedor Junior" },
  { id: "senior", label: "Vendedor Senior" },
  { id: "otro", label: "Otro empleado" },
];

export default function CommissionsPage() {
  const pathname = usePathname();
  const empresa = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/)?.[1] ?? "sumigases";
  const { rol } = useRol();
  const permitido = puedeVerFinanzas(rol);
  const { trabajadores, ventas } = useComisiones(empresa);
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));
  // La utilidad del período (después de gastos) es la base del bono.
  const [utilidad, setUtilidad] = usePersistedState(`com:utilidad:${empresa}`, 0);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [asignarA, setAsignarA] = useState<string | null>(null);

  const calc = useMemo(() => calcular(trabajadores, ventas, utilidad, mes), [trabajadores, ventas, utilidad, mes]);
  const totComision = calc.reduce((a, c) => a + c.comision, 0);
  const totBono = calc.reduce((a, c) => a + c.bono, 0);

  if (!permitido) {
    return (
      <>
        <PageHeader title="Comisiones y bonos" breadcrumbs={[{ label: "Finanzas" }, { label: "Comisiones y bonos" }]}
          description="Cálculo de comisiones sobre ventas propias y bono sobre la utilidad." />
        <EmptyState icon="alert" title="Sin acceso" message="Solo Owner y Administrador pueden ver comisiones y bonos." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Comisiones y bonos"
        description="Comisión = % sobre las ventas propias del vendedor. Bono = % sobre la utilidad del período."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Comisiones y bonos" }]}
        filters={
          <>
            <label className="sr-only" htmlFor="c-mes">Mes</label>
            <input id="c-mes" type="month" className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
              value={mes} onChange={(e) => setMes(e.target.value)} />
          </>
        }
        actions={<Button icon="plus" onClick={() => setNuevoAbierto((v) => !v)}>{nuevoAbierto ? "Cerrar" : "Agregar trabajador"}</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <label className={lbl}>Utilidad del período (base del bono)</label>
          <input type="number" min={0} step="0.01" className={fieldClass} value={utilidad || ""}
            onChange={(e) => setUtilidad(Number(e.target.value) || 0)} placeholder="0.00" />
          <p className="mt-1 text-[11px] text-muted">Después de gastos. Vendrá del Estado de Resultado.</p>
        </div>
        <StatCard label="Total comisiones" value={fmtUsd(totComision)} sub={`${calc.length} trabajador(es)`} accent />
        <StatCard label="Total bonos" value={fmtUsd(totBono)} sub="sobre la utilidad" />
        <StatCard label="Total a pagar" value={fmtUsd(totComision + totBono)} sub="comisiones + bonos" />
      </div>

      {nuevoAbierto && (
        <>
          <FormTrabajador empresa={empresa} onDone={() => setNuevoAbierto(false)} />
          <div className="h-4" />
        </>
      )}

      <SectionCard title="Cálculo del mes" description={`Período ${mes}. Los porcentajes son editables por Admin y Owner.`}>
        {calc.length === 0 ? (
          <EmptyState title="Sin trabajadores" message="Agrega un trabajador para calcular su comisión y su bono." />
        ) : (
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Trabajador</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Ventas propias</th>
                  <th className="py-2.5 pr-3 text-right font-medium">% Com.</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Comisión</th>
                  <th className="py-2.5 pr-3 text-right font-medium">% Bono</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Bono</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Total</th>
                  <th className="py-2.5 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calc.map((c) => (
                  <tr key={c.trabajador.id} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3">
                      <span className="block text-text">{c.trabajador.nombre}</span>
                      <StatusBadge tone={c.trabajador.tipo === "senior" ? "brand" : "muted"}>
                        {TIPOS.find((t) => t.id === c.trabajador.tipo)?.label}
                      </StatusBadge>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text">
                      {fmtUsd(c.ventas)}
                      <span className="block text-[11px] text-muted">{c.docs} doc(s)</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <input type="number" min={0} max={100} step="0.1" aria-label={`% comisión ${c.trabajador.nombre}`}
                        className="h-8 w-16 rounded-lg border border-border bg-surface-2 px-2 text-right text-sm text-text"
                        value={c.trabajador.pctComision}
                        onChange={(e) => updateTrabajador(c.trabajador.id, { pctComision: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-ok">{fmtUsd(c.comision)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <input type="number" min={0} max={100} step="0.1" aria-label={`% bono ${c.trabajador.nombre}`}
                        className="h-8 w-16 rounded-lg border border-border bg-surface-2 px-2 text-right text-sm text-text"
                        value={c.trabajador.pctBono}
                        onChange={(e) => updateTrabajador(c.trabajador.id, { pctBono: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-ok">{fmtUsd(c.bono)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-text">{fmtUsd(c.total)}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="secondary" icon="plus" onClick={() => setAsignarA(asignarA === c.trabajador.id ? null : c.trabajador.id)}>
                          Asignar venta
                        </Button>
                        <button type="button" aria-label={`Eliminar ${c.trabajador.nombre}`} onClick={() => removeTrabajador(c.trabajador.id)}
                          className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger"><Icon name="close" size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {asignarA && (
        <>
          <div className="h-4" />
          <FormAsignar trabajadorId={asignarA} empresa={empresa}
            nombre={trabajadores.find((t) => t.id === asignarA)?.nombre ?? ""}
            onDone={() => setAsignarA(null)} />
        </>
      )}

      <div className="h-4" />

      <SectionCard title="Ventas asignadas" description="Documentos (NET/FAC) atribuidos a cada vendedor. Un documento no puede asignarse dos veces.">
        {ventas.filter((v) => v.fecha.startsWith(mes)).length === 0 ? (
          <EmptyState title="Sin ventas asignadas en este mes" message="Asigna documentos a un vendedor para que se calcule su comisión." />
        ) : (
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Fecha</th>
                  <th className="py-2.5 pr-3 font-medium">Documento</th>
                  <th className="py-2.5 pr-3 font-medium">Cliente</th>
                  <th className="py-2.5 pr-3 font-medium">Vendedor</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Monto</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ventas.filter((v) => v.fecha.startsWith(mes)).map((v) => (
                  <tr key={v.id} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 text-muted">{v.fecha}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge tone={v.tipoDoc === "FAC" ? "info" : "ok"}>{v.tipoDoc}</StatusBadge>
                      <span className="ml-2 font-mono text-xs text-muted">{v.documento}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-text">{v.cliente || "—"}</td>
                    <td className="py-2.5 pr-3 text-muted">{trabajadores.find((t) => t.id === v.trabajadorId)?.nombre ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text">{fmtUsd(v.montoUsd)}</td>
                    <td className="py-2.5 text-right">
                      <button type="button" aria-label={`Quitar ${v.documento}`} onClick={() => removeVentaAsignada(v.id)}
                        className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger"><Icon name="close" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function FormTrabajador({ empresa, onDone }: { empresa: string; onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoTrabajador>("junior");
  const [pctComision, setPct] = useState(PCT_DEFECTO.junior);
  const [pctBono, setBono] = useState(0);
  const [msg, setMsg] = useState("");

  function cambiarTipo(t: TipoTrabajador) {
    setTipo(t);
    setPct(PCT_DEFECTO[t]);
  }

  return (
    <SectionCard title="Nuevo trabajador" description="El % de comisión arranca en el valor de referencia y se puede ajustar.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className={lbl}>Nombre *</label>
          <input className={fieldClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
        </div>
        <div>
          <label className={lbl}>Tipo</label>
          <select className={fieldClass} value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoTrabajador)}>
            {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>% Comisión</label>
            <input type="number" min={0} max={100} step="0.1" className={fieldClass} value={pctComision} onChange={(e) => setPct(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label className={lbl}>% Bono</label>
            <input type="number" min={0} max={100} step="0.1" className={fieldClass} value={pctBono} onChange={(e) => setBono(Number(e.target.value) || 0)} />
          </div>
        </div>
      </div>
      {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      <div className="mt-3 flex gap-2">
        <Button icon="check" onClick={() => {
          if (!nombre.trim()) return setMsg("El nombre es obligatorio.");
          addTrabajador({ nombre: nombre.trim(), empresa, tipo, pctComision, pctBono, activo: true });
          onDone();
        }}>Guardar</Button>
        <Button variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </SectionCard>
  );
}

function FormAsignar({ trabajadorId, empresa, nombre, onDone }: { trabajadorId: string; empresa: string; nombre: string; onDone: () => void }) {
  const [f, setF] = useState({ tipoDoc: "NET" as "NET" | "FAC", documento: "", fecha: hoyISO(), montoUsd: "", cliente: "" });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <SectionCard title={`Asignar venta a ${nombre}`} description="Por código de documento. La comisión se calcula sobre estas ventas.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className={lbl}>Tipo</label>
          <select className={fieldClass} value={f.tipoDoc} onChange={set("tipoDoc")}>
            <option value="NET">NET (nota de entrega)</option>
            <option value="FAC">FAC (factura)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>N° documento *</label>
          <input className={fieldClass} value={f.documento} onChange={set("documento")} placeholder="0000002032" />
        </div>
        <div>
          <label className={lbl}>Fecha</label>
          <input type="date" className={fieldClass} value={f.fecha} onChange={set("fecha")} />
        </div>
        <div>
          <label className={lbl}>Monto USD *</label>
          <input type="number" min={0} step="0.01" className={fieldClass} value={f.montoUsd} onChange={set("montoUsd")} placeholder="0.00" />
        </div>
        <div>
          <label className={lbl}>Cliente</label>
          <input className={fieldClass} value={f.cliente} onChange={set("cliente")} />
        </div>
      </div>
      {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      <div className="mt-3 flex gap-2">
        <Button icon="check" onClick={() => {
          setMsg("");
          if (!f.documento.trim()) return setMsg("El número de documento es obligatorio.");
          const monto = Number(f.montoUsd) || 0;
          if (monto <= 0) return setMsg("El monto debe ser mayor que cero.");
          const r = addVentaAsignada({ trabajadorId, empresa, tipoDoc: f.tipoDoc, documento: f.documento.trim(), fecha: f.fecha, montoUsd: monto, cliente: f.cliente.trim() || undefined });
          if (!r.ok) return setMsg(r.error ?? "No se pudo asignar.");
          onDone();
        }}>Asignar</Button>
        <Button variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </SectionCard>
  );
}
