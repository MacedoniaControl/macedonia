"use client";

import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { downloadCsv } from "@/lib/ux/export-csv";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { addNotif } from "@/lib/ux/notifications";
import {
  FISICO,
  FISICO_META,
  buildMaster,
  duplicadosBloqueados,
  inFisico,
  type SItem,
} from "@/lib/ux/inventory-data";
import { FiscalRegularization } from "./FiscalRegularization";
import { ScanCapture } from "./ScanCapture";
import { useFiscal, stockValery, stockS, stockMaestro } from "@/lib/ux/inventory-fiscal";

const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text";
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 pl-9 pr-3 text-sm text-text";
const fieldClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";
const LIMIT = 100;

type Tab = "master" | "fisico" | "s" | "fiscal" | "escaner";
type MasterView = "fisico" | "espera-ne" | "espera-factura";

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("master");
  const [q, setQ] = useState("");
  const [sItems, setSItems] = usePersistedState<SItem[]>("inv-s", []);
  const { notas, ledger } = useFiscal();
  const [masterView, setMasterView] = useState<MasterView>("fisico");
  const [placeholder, setPlaceholder] = useState("");
  function stub(area: string) {
    setPlaceholder(`Acción pendiente de definir · ${area}`);
  }
  const StubBtn = ({ area }: { area: string }) => (
    <Button variant="secondary" icon="plus" onClick={() => stub(area)}>Acción</Button>
  );

  const conflictos = useMemo(() => duplicadosBloqueados(sItems), [sItems]);
  const master = useMemo(() => buildMaster(sItems), [sItems]);

  const t = q.trim().toLowerCase();
  const match = (codigo: string, nombre: string) =>
    !t || codigo.toLowerCase().includes(t) || nombre.toLowerCase().includes(t);

  const fisicoF = useMemo(() => FISICO.filter((f) => match(f.codigo, f.nombre)), [t]);
  const masterF = useMemo(() => master.filter((m) => match(m.codigo, m.nombre)), [master, t]);
  const sF = useMemo(() => sItems.filter((s) => match(s.codigo, s.nombre)), [sItems, t]);

  // --- Sub-apartados del Master (lógica preliminar; se afinará con las indicaciones) ---
  // Físico Existente: lo que realmente está en almacén (Maestro M > 0).
  const fisicoExistente = useMemo(
    () => masterF.map((m) => ({ ...m, m: stockMaestro(m.codigo, ledger) })).filter((m) => m.m !== 0),
    [masterF, ledger],
  );
  // En Espera por Factura: notas de entrega ya emitidas, pendientes de convertir a factura fiscal.
  const esperaFactura = useMemo(() => {
    const map = new Map<string, { codigo: string; nombre: string; cantidad: number; notas: string[] }>();
    notas.filter((n) => n.estado === "pendiente").forEach((n) =>
      n.lineas.forEach((l) => {
        const e = map.get(l.codigo) ?? { codigo: l.codigo, nombre: l.nombre, cantidad: 0, notas: [] };
        e.cantidad += l.cantidad;
        if (!e.notas.includes(n.numero)) e.notas.push(n.numero);
        map.set(l.codigo, e);
      }),
    );
    return [...map.values()].filter((e) => match(e.codigo, e.nombre));
  }, [notas, t]);
  // En Espera por Nota de Entrega: pedidos/compromisos aún sin NE emitida. Lógica a definir.
  const esperaNE: { codigo: string; nombre: string; cantidad: number }[] = [];

  const totFisico = fisicoExistente.reduce((a, m) => a + m.m, 0);
  const totFactura = esperaFactura.reduce((a, e) => a + e.cantidad, 0);
  const totNE = esperaNE.reduce((a, e) => a + e.cantidad, 0);

  // --- Inventario S: alta / ajuste / duplicados ---
  const [form, setForm] = useState({ codigo: "", nombre: "", existencia: "", costo: "", precio: "" });
  function addS() {
    const codigo = form.codigo.trim();
    if (!codigo || !form.nombre.trim()) return;
    const nuevo: SItem = {
      codigo,
      nombre: form.nombre.trim(),
      existencia: Number(form.existencia) || 0,
      costo: Number(form.costo) || 0,
      precio: Number(form.precio) || 0,
      empresa: "Sumigases",
      almacen: "Lechería",
    };
    setSItems([nuevo, ...sItems.filter((s) => s.codigo !== codigo)]);
    if (inFisico(codigo)) {
      addNotif({
        id: `dup-${codigo}-${Date.now()}`,
        tipo: "inventario",
        titulo: "Código duplicado en ambos inventarios",
        mensaje: `El código ${codigo} existe en el Inventario Físico (Valery) y en el Inventario S. Requiere revisión OWNER/ADMIN antes de modificarse.`,
        para: "OWNER/ADMIN",
        estado: "pendiente",
        hora: new Date().toLocaleString("es-VE"),
        payload: { codigo },
      });
    }
    setForm({ codigo: "", nombre: "", existencia: "", costo: "", precio: "" });
  }
  function aprobarDuplicado(codigo: string) {
    setSItems(sItems.map((s) => (s.codigo === codigo ? { ...s, tagDuplicado: true } : s)));
  }
  function ajustar(codigo: string, delta: number) {
    setSItems(sItems.map((s) => (s.codigo === codigo ? { ...s, existencia: s.existencia + delta } : s)));
  }
  function eliminar(codigo: string) {
    setSItems(sItems.filter((s) => s.codigo !== codigo));
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Físico (Valery) + Inventario S (SumiControl) = Master. La existencia total real de la empresa."
        breadcrumbs={[{ label: "Inventario" }, { label: "Inventario" }]}
        actions={
          <Button variant="secondary" icon="report" onClick={() => downloadCsv("inventario-master",
            [["Código", "Nombre", "Físico", "S", "Master"], ...masterF.map((m) => [m.codigo, m.nombre, m.fisico, m.s, m.master])])}>
            Exportar CSV
          </Button>
        }
      />

      {conflictos.length > 0 && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p className="font-medium text-danger">
            {conflictos.length} código(s) duplicado(s) en Físico y S — modificación bloqueada hasta aprobación OWNER/ADMIN.
          </p>
          <p className="mt-1 text-muted">
            {conflictos.slice(0, 8).map((c) => c.codigo).join(", ")}
            {conflictos.length > 8 ? "…" : ""} · Revísalos en la pestaña <strong>Inventario S</strong>.
          </p>
        </div>
      )}

      {placeholder && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-info/10 px-3 py-2 text-sm text-info">
          <Icon name="alert" size={16} /> {placeholder}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
        {([
          ["master", `Master (${master.length})`],
          ["fisico", `Físico · Valery (${FISICO.length})`],
          ["s", `Inventario S (${sItems.length})`],
          ["fiscal", "Regularización fiscal"],
          ["escaner", "Escáner"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === id ? "bg-brand-strong text-white" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab !== "fiscal" && tab !== "escaner" && (
        <div className="mb-3">
          <label className="relative flex max-w-md items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input type="search" placeholder="Buscar por código o nombre…" aria-label="Buscar" className={inputClass}
              value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      )}

      {tab === "escaner" && <ScanCapture />}

      {tab === "fiscal" && (
        <>
          <div className="mb-3 flex justify-end"><StubBtn area="Regularización fiscal" /></div>
          <FiscalRegularization />
        </>
      )}

      {/* -------- MASTER dividido en 3 apartados -------- */}
      {tab === "master" && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text">Inventario Master</h2>
            <StubBtn area="Master" />
          </div>

          {/* Tiles resumen de los tres apartados */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {([
              ["fisico", "Físico Existente", totFisico, fisicoExistente.length, "En almacén (Maestro M)"],
              ["espera-ne", "En Espera por Nota de Entrega", totNE, esperaNE.length, "Comprometido sin NE emitida"],
              ["espera-factura", "En Espera por Factura", totFactura, esperaFactura.length, "NE pendiente de factura fiscal"],
            ] as [MasterView, string, number, number, string][]).map(([id, label, unidades, skus, hint]) => (
              <button key={id} onClick={() => setMasterView(id)}
                className={`rounded-2xl border p-4 text-left transition ${masterView === id ? "border-brand bg-brand/5" : "border-border bg-surface hover:bg-surface-2"}`}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
                <div className="mt-1 text-2xl font-semibold text-text">{Math.round(unidades * 100) / 100}</div>
                <div className="text-xs text-muted">{skus} SKU · {hint}</div>
              </button>
            ))}
          </div>

          {/* Físico Existente */}
          {masterView === "fisico" && (
            <SectionCard title="Físico Existente" action={<StubBtn area="Físico Existente" />}
              description={`Lo que realmente está en almacén (Maestro M). Referencia V/S/M. Mostrando ${Math.min(fisicoExistente.length, LIMIT)} de ${fisicoExistente.length}.`}>
              <div className="sumi-scroll max-w-full overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2.5 pr-3 font-medium">Código</th>
                      <th className="py-2.5 pr-3 font-medium">Nombre</th>
                      <th className="py-2.5 pr-3 text-right font-medium">V · Valery</th>
                      <th className="py-2.5 pr-3 text-right font-medium">S · informal</th>
                      <th className="py-2.5 pr-3 text-right font-medium">Físico exist. (M)</th>
                      <th className="py-2.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fisicoExistente.slice(0, LIMIT).map((m) => {
                      const v = stockValery(m.codigo, ledger);
                      const s = stockS(m.codigo, ledger, m.s);
                      return (
                        <tr key={m.codigo} className={m.bloqueado ? "bg-danger/5" : "hover:bg-surface-2"}>
                          <td className="py-2.5 pr-3 font-mono text-xs text-muted">{m.codigo}</td>
                          <td className="py-2.5 pr-3 text-text">{m.nombre}</td>
                          <td className={`py-2.5 pr-3 text-right ${v < 0 ? "text-danger" : "text-muted"}`}>{v}</td>
                          <td className="py-2.5 pr-3 text-right text-muted">{s !== 0 || m.enS ? s : "—"}</td>
                          <td className={`py-2.5 pr-3 text-right font-medium ${m.m < 0 ? "text-danger" : "text-text"}`}>{m.m}</td>
                          <td className="py-2.5">
                            {m.bloqueado ? <StatusBadge tone="danger">Duplicado · bloqueado</StatusBadge>
                              : m.m <= 0 ? <StatusBadge tone="warn">Sin existencia</StatusBadge>
                              : <StatusBadge tone="ok">Disponible</StatusBadge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* En Espera por Nota de Entrega */}
          {masterView === "espera-ne" && (
            <SectionCard title="En Espera por Nota de Entrega" action={<StubBtn area="En Espera por Nota de Entrega" />}
              description="Existencia comprometida en pedidos aún sin Nota de Entrega emitida.">
              <p className="mb-3 rounded-xl border border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted">
                Apartado creado. <strong className="text-text">Lógica pendiente de definir</strong> (mañana): qué origina un compromiso, cómo entra y sale de este estado, y su relación con V/S/M.
              </p>
              {esperaNE.length === 0 ? (
                <EmptyState title="Sin existencia en espera por NE" message="Aún no hay compromisos registrados en este apartado." />
              ) : (
                <div className="sumi-scroll max-w-full overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted">
                      <tr className="border-b border-border">
                        <th className="py-2.5 pr-3 font-medium">Código</th>
                        <th className="py-2.5 pr-3 font-medium">Nombre</th>
                        <th className="py-2.5 pr-3 text-right font-medium">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {esperaNE.map((e) => (
                        <tr key={e.codigo} className="hover:bg-surface-2">
                          <td className="py-2.5 pr-3 font-mono text-xs text-muted">{e.codigo}</td>
                          <td className="py-2.5 pr-3 text-text">{e.nombre}</td>
                          <td className="py-2.5 pr-3 text-right text-text">{e.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* En Espera por Factura */}
          {masterView === "espera-factura" && (
            <SectionCard title="En Espera por Factura" action={<StubBtn area="En Espera por Factura" />}
              description="Notas de Entrega emitidas, pendientes de convertir a Factura Fiscal (Valery).">
              <p className="mb-3 rounded-xl border border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted">
                Fuente preliminar: bandeja de <strong className="text-text">Regularización fiscal</strong> (NE pendientes). <strong className="text-text">Lógica a afinar</strong> con tus indicaciones.
              </p>
              {esperaFactura.length === 0 ? (
                <EmptyState title="Sin existencia en espera por factura" message="No hay notas de entrega pendientes de facturar." />
              ) : (
                <div className="sumi-scroll max-w-full overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted">
                      <tr className="border-b border-border">
                        <th className="py-2.5 pr-3 font-medium">Código</th>
                        <th className="py-2.5 pr-3 font-medium">Nombre</th>
                        <th className="py-2.5 pr-3 text-right font-medium">Cantidad</th>
                        <th className="py-2.5 font-medium">Notas de entrega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {esperaFactura.slice(0, LIMIT).map((e) => (
                        <tr key={e.codigo} className="hover:bg-surface-2">
                          <td className="py-2.5 pr-3 font-mono text-xs text-muted">{e.codigo}</td>
                          <td className="py-2.5 pr-3 text-text">{e.nombre}</td>
                          <td className="py-2.5 pr-3 text-right font-medium text-text">{e.cantidad}</td>
                          <td className="py-2.5 text-xs text-muted">{e.notas.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}

      {/* -------- FÍSICO -------- */}
      {tab === "fisico" && (
        <SectionCard title="Inventario Físico (Valery)" action={<StubBtn area="Físico · Valery" />}
          description={`Solo lectura · fuente: ${FISICO_META.fuente} (${FISICO_META.fecha}). Mostrando ${Math.min(fisicoF.length, LIMIT)} de ${fisicoF.length}.`}>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Código</th>
                  <th className="py-2.5 pr-3 font-medium">Nombre</th>
                  <th className="py-2.5 pr-3 font-medium">Und.</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Existencia</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Exist. alt.</th>
                  <th className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fisicoF.slice(0, LIMIT).map((f) => (
                  <tr key={f.codigo} className="hover:bg-surface-2">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{f.codigo}</td>
                    <td className="py-2.5 pr-3 text-text">{f.nombre}</td>
                    <td className="py-2.5 pr-3 text-muted">{f.undPpal}</td>
                    <td className={`py-2.5 pr-3 text-right ${f.existPpal < 0 ? "text-danger" : "text-text"}`}>{f.existPpal}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{f.existAlt || "—"}</td>
                    <td className="py-2.5">
                      {f.existPpal < 0 ? <StatusBadge tone="danger">Negativa</StatusBadge>
                        : f.existPpal === 0 ? <StatusBadge tone="warn">En cero</StatusBadge>
                        : <StatusBadge tone="ok">Disponible</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* -------- INVENTARIO S -------- */}
      {tab === "s" && (
        <>
          <SectionCard title="Agregar a Inventario S" description="Stock propio de SumiControl. Si el código ya existe en el Físico, se marca duplicado y se bloquea hasta aprobación OWNER/ADMIN.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <input className={`${fieldClass} lg:col-span-1`} placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              <input className={`${fieldClass} lg:col-span-2`} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              <input className={fieldClass} type="number" placeholder="Existencia" value={form.existencia} onChange={(e) => setForm({ ...form, existencia: e.target.value })} />
              <input className={fieldClass} type="number" placeholder="Precio $" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
              <Button icon="plus" onClick={addS}>Agregar</Button>
            </div>
          </SectionCard>

          <div className="h-4" />

          <SectionCard title="Inventario S" action={<StubBtn area="Inventario S" />} description={`${sItems.length} ítem(s) propios. Mostrando ${Math.min(sF.length, LIMIT)}.`}>
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2.5 pr-3 font-medium">Código</th>
                    <th className="py-2.5 pr-3 font-medium">Nombre</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Precio</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Existencia</th>
                    <th className="py-2.5 font-medium">Estado / Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sF.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">Sin ítems en Inventario S.</td></tr>}
                  {sF.slice(0, LIMIT).map((s) => {
                    const dup = inFisico(s.codigo);
                    const bloqueado = dup && !s.tagDuplicado;
                    return (
                      <tr key={s.codigo} className={bloqueado ? "bg-danger/5" : "hover:bg-surface-2"}>
                        <td className="py-2.5 pr-3 font-mono text-xs text-muted">{s.codigo}</td>
                        <td className="py-2.5 pr-3 text-text">{s.nombre}</td>
                        <td className="py-2.5 pr-3 text-right text-text">${s.precio.toFixed(2)}</td>
                        <td className="py-2.5 pr-3 text-right text-text">{s.existencia}</td>
                        <td className="py-2.5">
                          {bloqueado ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone="danger">Duplicado · bloqueado</StatusBadge>
                              <Button variant="secondary" onClick={() => aprobarDuplicado(s.codigo)}>Aprobar duplicado (OWNER/ADMIN)</Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {dup && <StatusBadge tone="warn">Documento Duplicado</StatusBadge>}
                              <Button variant="secondary" onClick={() => ajustar(s.codigo, 1)}>+1</Button>
                              <Button variant="secondary" onClick={() => ajustar(s.codigo, -1)}>−1</Button>
                              <Button variant="ghost" icon="close" onClick={() => eliminar(s.codigo)}>Quitar</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
