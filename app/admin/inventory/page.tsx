"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { downloadCsv } from "@/lib/ux/export-csv";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { addNotif } from "@/lib/ux/notifications";
import {
  buildMaster,
  duplicadosBloqueados,
  inFisico,
  type SItem,
} from "@/lib/ux/inventory-data";
import { FiscalRegularization } from "./FiscalRegularization";
import { MasterInventario } from "./MasterInventario";
import { MovimientosPanel } from "./MovimientosPanel";
import { useTableView } from "@/lib/ux/use-table-view";
import { TablePager } from "@/components/ui/TablePager";
import { SortableTh } from "@/components/ui/SortableTh";
import { useFiscal, stockValery, stockS, stockMaestro } from "@/lib/ux/inventory-fiscal";
import { inventarioDe, type ItemInventario } from "@/lib/inventory/inventario-db";
import { ventas12m, precioProm, estadoRotacion, rotacionVentana } from "@/lib/ux/inventory-rotation";
import { fmtUsd } from "@/lib/ux/format";

const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text";
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 pl-9 pr-3 text-sm text-text";
const fieldClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

type Tab = "master" | "movimientos" | "fisico" | "s" | "fiscal";

export default function InventoryPage() {
  // Empresa activa según la ruta (consolidado -> sumigases).
  const empresa = useEmpresaActiva();
  const [tab, setTab] = useState<Tab>("master");
  const [q, setQ] = useState("");
  const [sItems, setSItems] = usePersistedState<SItem[]>(`inv-s:${empresa}`, []);
  const { notas, ledger, ready } = useFiscal(empresa);
  const [fisView, setFisView] = useState<"existencias" | "rotacion">("existencias");
  const [placeholder, setPlaceholder] = useState("");
  function stub(area: string) {
    setPlaceholder(`Acción pendiente de definir · ${area}`);
  }
  const StubBtn = ({ area }: { area: string }) => (
    <Button variant="secondary" icon="plus" onClick={() => stub(area)}>Acción</Button>
  );

  const conflictos = useMemo(() => duplicadosBloqueados(sItems, empresa), [sItems, empresa]);
  const master = useMemo(() => buildMaster(sItems, empresa), [sItems, empresa]);
  // El físico viene de la BASE: catálogo + existencia calculada del kardex.
  // Antes salía de un JSON del código con la existencia congelada del día del
  // export de Valery, que dejaba de ser cierta al primer movimiento.
  const [fisico, setFisico] = useState<ItemInventario[]>([]);
  const [cargandoInv, setCargandoInv] = useState(true);
  const [errorInv, setErrorInv] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargandoInv(true);
    inventarioDe(empresa)
      .then((items) => { if (vigente) { setFisico(items); setErrorInv(null); } })
      .catch((e) => { if (vigente) { setErrorInv((e as Error).message); setFisico([]); } })
      .finally(() => { if (vigente) setCargandoInv(false); });
    return () => { vigente = false; };   // al cambiar de empresa, descartar lo viejo
  }, [empresa]);

  const t = q.trim().toLowerCase();
  const match = (codigo: string, nombre: string) =>
    !t || codigo.toLowerCase().includes(t) || nombre.toLowerCase().includes(t);

  const fisicoF = useMemo(() => fisico.filter((f) => match(f.codigo, f.nombre)), [t, fisico]);
  const masterF = useMemo(() => master.filter((m) => match(m.codigo, m.nombre)), [master, t]);
  const sF = useMemo(() => sItems.filter((s) => match(s.codigo, s.nombre)), [sItems, t]);

  // --- Sub-apartados del Master (lógica preliminar; se afinará con las indicaciones) ---
  // Físico Existente: lo que realmente está en almacén (Maestro M > 0).
  const fisicoExistente = useMemo(
    () => masterF.map((m) => ({ ...m, m: stockMaestro(m.codigo, ledger, empresa) })).filter((m) => m.m !== 0),
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

  // --- Orden + paginación por tabla ---
  const accFisicoExistente = useMemo(
    () => ({
      codigo: (r: (typeof fisicoExistente)[number]) => r.codigo,
      nombre: (r: (typeof fisicoExistente)[number]) => r.nombre,
      v: (r: (typeof fisicoExistente)[number]) => stockValery(r.codigo, ledger, empresa),
      s: (r: (typeof fisicoExistente)[number]) => stockS(r.codigo, ledger, r.s),
      m: (r: (typeof fisicoExistente)[number]) => r.m,
    }),
    [ledger],
  );
  const tFis = useTableView(fisicoExistente, accFisicoExistente);

  // --- Rotación: existencia (M en vivo) vs velocidad de venta (12m histórico) ---
  const rotacion = useMemo(
    () =>
      masterF
        .map((m) => {
          const disponible = stockMaestro(m.codigo, ledger, empresa);
          const v12 = ventas12m(m.codigo);
          const avg = v12 / 12;
          return { codigo: m.codigo, nombre: m.nombre, disponible, v12, avg, precio: precioProm(m.codigo), est: estadoRotacion(disponible, avg) };
        })
        // se muestra lo que tienes en almacén o lo que se vende (agotados con ventas incluidos)
        .filter((r) => r.disponible !== 0 || r.v12 > 0),
    [masterF, ledger],
  );
  const resumenRot = useMemo(() => {
    const c = { reponer: 0, sobrestock: 0, sinRotacion: 0, agotado: 0 };
    rotacion.forEach((r) => {
      if (r.est.label === "Reponer pronto") c.reponer++;
      else if (r.est.label === "Sobrestock") c.sobrestock++;
      else if (r.est.label === "Sin rotación") c.sinRotacion++;
      else if (r.est.label === "Agotado") c.agotado++;
    });
    return c;
  }, [rotacion]);
  const accRot = useMemo(
    () => ({
      codigo: (r: (typeof rotacion)[number]) => r.codigo,
      nombre: (r: (typeof rotacion)[number]) => r.nombre,
      disponible: (r: (typeof rotacion)[number]) => r.disponible,
      v12: (r: (typeof rotacion)[number]) => r.v12,
      avg: (r: (typeof rotacion)[number]) => r.avg,
      meses: (r: (typeof rotacion)[number]) => (r.est.meses ?? 99999),
      precio: (r: (typeof rotacion)[number]) => r.precio,
    }),
    [],
  );
  const tRot = useTableView(rotacion, accRot);

  const accValery = useMemo(
    () => ({
      codigo: (r: (typeof fisico)[number]) => r.codigo,
      nombre: (r: (typeof fisico)[number]) => r.nombre,
      und: (r: (typeof fisico)[number]) => r.undPpal,
      existencia: (r: (typeof fisico)[number]) => r.existPpal,
      alt: (r: (typeof fisico)[number]) => r.existAlt,
    }),
    [],
  );
  const tVal = useTableView(fisicoF, accValery);

  const accS = useMemo(
    () => ({
      codigo: (r: SItem) => r.codigo,
      nombre: (r: SItem) => r.nombre,
      precio: (r: SItem) => r.precio,
      existencia: (r: SItem) => r.existencia,
    }),
    [],
  );
  const tS = useTableView(sF, accS);

  const accFactura = useMemo(
    () => ({
      codigo: (r: (typeof esperaFactura)[number]) => r.codigo,
      nombre: (r: (typeof esperaFactura)[number]) => r.nombre,
      cantidad: (r: (typeof esperaFactura)[number]) => r.cantidad,
    }),
    [],
  );
  const tFac = useTableView(esperaFactura, accFactura);

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
    if (inFisico(codigo, empresa)) {
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
        description="Físico (Valery) + Inventario S (Macedonia) = Master. La existencia total real de la empresa."
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

      <div className="sumi-tabs mb-4 rounded-xl border border-border bg-surface p-1">
        {([
          ["master", `Master (${master.length})`],
          ["fisico", `Físico · Valery (${fisico.length})`],
          ["s", `Inventario S (${sItems.length})`],
          ["movimientos", "Movimientos"],
          ["fiscal", "Regularización fiscal"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === id ? "bg-brand-strong text-white" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab !== "fiscal" && tab !== "movimientos" && (
        <div className="mb-3">
          <label className="relative flex max-w-md items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input type="search" placeholder="Buscar por código o nombre…" aria-label="Buscar" className={inputClass}
              value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      )}

      {tab === "movimientos" && <MovimientosPanel empresa={empresa} />}

      {tab === "fiscal" && (
        <>
          <div className="mb-3 flex justify-end"><StubBtn area="Regularización fiscal" /></div>
          <FiscalRegularization empresa={empresa} />
        </>
      )}

      {/* -------- MASTER dividido en 3 apartados -------- */}
      {tab === "master" && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-text">Inventario Master</h2>
          </div>

          {/* DOS cifras, no tres. El kardex ya distingue lo que movio mercancia
              de lo que solo cuadra papeles, asi que V/S/M se simplifica a
              FISICO REAL vs FISCAL. Ver MasterInventario.tsx. */}
          <MasterInventario empresa={empresa} filtro={q} />
        </>
      )}


      {tab === "fisico" && (
        <SectionCard title="Inventario Físico (Valery)" action={<StubBtn area="Físico · Valery" />}
          description={`Solo lectura · fuente: base de datos · existencia calculada del kardex.`}>
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <SortableTh label="Código" sortKey="codigo" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Nombre" sortKey="nombre" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Und." sortKey="und" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Existencia" sortKey="existencia" align="right" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <SortableTh label="Exist. alt." sortKey="alt" align="right" ariaSort={tVal.ariaSort} onSort={tVal.toggleSort} />
                  <th scope="col" className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tVal.visible.map((f) => (
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
          <TablePager {...tVal} etiqueta="productos" />
        </SectionCard>
      )}

      {/* -------- INVENTARIO S -------- */}
      {tab === "s" && (
        <>
          <SectionCard title="Agregar a Inventario S" description="Stock propio de Macedonia. Si el código ya existe en el Físico, se marca duplicado y se bloquea hasta aprobación OWNER/ADMIN.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <input className={`${fieldClass} lg:col-span-1`} placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              <input className={`${fieldClass} lg:col-span-2`} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              <input className={fieldClass} type="number" placeholder="Existencia" value={form.existencia} onChange={(e) => setForm({ ...form, existencia: e.target.value })} />
              <input className={fieldClass} type="number" placeholder="Precio $" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
              <Button icon="plus" onClick={addS}>Agregar</Button>
            </div>
          </SectionCard>

          <div className="h-4" />

          <SectionCard title="Inventario S" action={<StubBtn area="Inventario S" />} description={`${sItems.length} ítem(s) propios.`}>
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <SortableTh label="Código" sortKey="codigo" ariaSort={tS.ariaSort} onSort={tS.toggleSort} />
                    <SortableTh label="Nombre" sortKey="nombre" ariaSort={tS.ariaSort} onSort={tS.toggleSort} />
                    <SortableTh label="Precio" sortKey="precio" align="right" ariaSort={tS.ariaSort} onSort={tS.toggleSort} />
                    <SortableTh label="Existencia" sortKey="existencia" align="right" ariaSort={tS.ariaSort} onSort={tS.toggleSort} />
                    <th scope="col" className="py-2.5 font-medium">Estado / Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sF.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">Sin ítems en Inventario S.</td></tr>}
                  {tS.visible.map((s) => {
                    const dup = inFisico(s.codigo, empresa);
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
            <TablePager {...tS} etiqueta="ítems" />
          </SectionCard>
        </>
      )}
    </>
  );
}
