"use client";

import { registrarGasto, listarGastos, eliminarGasto, type GastoGuardado } from "@/lib/finanzas/gastos-db";

// Gastos (Finanzas). Carga manual de gastos que alimentan el Estado de Resultado.
// Catálogo de partidas y categorías = las del EdR real. Ver lib/ux/gastos.ts.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtUsd } from "@/lib/ux/format";
import { useTableView } from "@/lib/ux/use-table-view";
import { TablePager } from "@/components/ui/TablePager";
import { SortableTh } from "@/components/ui/SortableTh";
import { useRol, puedeVerFinanzas } from "@/lib/ux/session";
import { useBcvRate } from "@/lib/ux/bcv-rate";
import {
  totalesPorCategoria,
  PARTIDAS, CATEGORIAS, TIPOS_TRANSACCION, categoriaDe, type Gasto,
} from "@/lib/ux/gastos";

const fieldClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function ExpensesPage() {
  const pathname = usePathname();
  const empresa = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/)?.[1] ?? "sumigases";
  const { rol } = useRol();
  const permitido = puedeVerFinanzas(rol);
  // Los gastos viven en la base: son la mitad del Estado de Resultado y tienen
  // que ser los mismos para el Owner y para el administrador, no uno por máquina.
  const [gastos, setGastos] = useState<GastoGuardado[]>([]);
  const [ready, setReady] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setReady(false);
    listarGastos(empresa)
      .then((g) => { if (vigente) { setGastos(g); setErrorCarga(null); } })
      .catch((e) => { if (vigente) setErrorCarga((e as Error).message); })
      .finally(() => { if (vigente) setReady(true); });
    return () => { vigente = false; };
  }, [empresa, recarga]);
  const bcv = useBcvRate();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));

  const delMes = useMemo(() => gastos.filter((g) => g.fecha.startsWith(mes)), [gastos, mes]);
  const totales = useMemo(() => totalesPorCategoria(delMes as unknown as Gasto[]), [delMes]);
  const totalMes = useMemo(() => delMes.reduce((a, g) => a + g.montoUsd, 0), [delMes]);

  const acc = useMemo(
    () => ({
      fecha: (g: Gasto) => g.fecha,
      partida: (g: Gasto) => g.partida,
      categoria: (g: Gasto) => g.categoria,
      monto: (g: Gasto) => g.montoUsd,
      beneficiario: (g: Gasto) => g.beneficiario ?? "",
    }),
    [],
  );
  const t = useTableView(delMes as unknown as Gasto[], acc, 25);

  if (!permitido) {
    return (
      <>
        <PageHeader title="Gastos" description="Registro de gastos que alimenta el Estado de Resultado."
          breadcrumbs={[{ label: "Finanzas" }, { label: "Gastos" }]} />
        <EmptyState icon="alert" title="Sin acceso"
          message="Los gastos y la utilidad solo están disponibles para Owner y Administrador." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Gastos"
        description="Carga manual de gastos por partida. Alimenta el Estado de Resultado."
        breadcrumbs={[{ label: "Finanzas" }, { label: "Gastos" }]}
        filters={
          <>
            <label className="sr-only" htmlFor="g-mes">Mes</label>
            <input id="g-mes" type="month" className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
              value={mes} onChange={(e) => setMes(e.target.value)} />
          </>
        }
        actions={<Button icon="plus" onClick={() => setAbierto((v) => !v)}>{abierto ? "Cerrar" : "Registrar gasto"}</Button>}
      />

      {/* Totales por categoría (las 5 del Estado de Resultado) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total del mes" value={ready ? fmtUsd(totalMes) : "—"} sub={`${delMes.length} gasto(s)`} accent />
        {CATEGORIAS.map((c) => (
          <StatCard key={c} label={c} value={ready ? fmtUsd(totales[c]) : "—"}
            sub={totalMes > 0 ? `${Math.round((totales[c] / totalMes) * 100)}% del mes` : "—"} />
        ))}
      </div>

      {abierto && (
        <>
          <FormGasto empresa={empresa} tasaBcv={bcv?.tasa} onDone={() => setAbierto(false)} />
          <div className="h-4" />
        </>
      )}

      <SectionCard title="Gastos del mes" description={`Partida · categoría · monto. Período ${mes}.`}>
        {delMes.length === 0 ? (
          <EmptyState title="Sin gastos en este mes" message="Registra un gasto para que aparezca aquí y sume al Estado de Resultado." />
        ) : (
          <>
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <SortableTh label="Fecha" sortKey="fecha" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Partida" sortKey="partida" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Categoría" sortKey="categoria" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <SortableTh label="Beneficiario" sortKey="beneficiario" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <th scope="col" className="py-2.5 pr-3 font-medium">Pago</th>
                    <SortableTh label="Monto (USD)" sortKey="monto" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                    <th scope="col" className="py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.visible.map((g) => (
                    <tr key={g.id} className="hover:bg-surface-2">
                      <td className="py-2.5 pr-3 text-muted">{g.fecha}</td>
                      <td className="py-2.5 pr-3 text-text">
                        {g.partida}
                        {g.nota && <span className="block text-[11px] text-muted">{g.nota}</span>}
                      </td>
                      <td className="py-2.5 pr-3"><StatusBadge tone="muted">{g.categoria}</StatusBadge></td>
                      <td className="py-2.5 pr-3 text-muted">{g.beneficiario || "—"}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {g.tipoTransaccion || "—"}
                        {g.moneda === "BS" && <span className="block">{g.monto.toLocaleString("es-VE")} Bs · TC {g.tasa}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-text">{fmtUsd(g.montoUsd)}</td>
                      <td className="py-2.5 text-right">
                        <button type="button" aria-label={`Eliminar gasto ${g.partida}`} onClick={async () => { await eliminarGasto(Number(g.id), empresa); setRecarga((n) => n + 1); }}
                          className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger"><Icon name="close" size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePager {...t} etiqueta="gastos" />
          </>
        )}
      </SectionCard>
    </>
  );
}

function FormGasto({ empresa, tasaBcv, onDone }: { empresa: string; tasaBcv?: number; onDone: () => void }) {
  const [f, setF] = useState({
    fecha: hoyISO(),
    partida: PARTIDAS[0].nombre,
    monto: "",
    moneda: "USD" as "USD" | "BS",
    tasa: tasaBcv ? String(tasaBcv) : "",
    beneficiario: "",
    tipoTransaccion: TIPOS_TRANSACCION[0],
    documento: "",
    nota: "",
  });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const monto = Number(f.monto) || 0;
  const tasa = Number(f.tasa) || 0;
  const enUsd = f.moneda === "USD" ? monto : tasa > 0 ? monto / tasa : 0;

  async function guardar() {
    setMsg("");
    if (monto <= 0) return setMsg("El monto debe ser mayor que cero.");
    if (f.moneda === "BS" && tasa <= 0) return setMsg("Indica la tasa de cambio para convertir de Bs a dólares.");
    // El usuario sale de la sesión del servidor. Antes todo gasto quedaba
    // firmado como "Greeg V." aunque lo cargara el administrador.
    const r = await registrarGasto({
      fecha: f.fecha,
      partida: f.partida,
      categoria: categoriaDe(f.partida),
      monto,
      moneda: f.moneda,
      tasa: f.moneda === "BS" ? tasa : undefined,
      beneficiario: f.beneficiario.trim() || undefined,
      tipoTransaccion: f.tipoTransaccion,
      documento: f.documento.trim() || undefined,
      nota: f.nota.trim() || undefined,
    }, empresa);

    if (!r.ok) return setMsg(r.error);
    onDone();
  }

  return (
    <SectionCard title="Registrar gasto" description="Queda registrado con fecha, partida, beneficiario y usuario.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={lbl}>Fecha</label>
          <input type="date" className={fieldClass} value={f.fecha} onChange={set("fecha")} />
        </div>
        <div className="lg:col-span-2">
          <label className={lbl}>Partida *</label>
          <select className={fieldClass} value={f.partida} onChange={set("partida")}>
            {CATEGORIAS.map((c) => (
              <optgroup key={c} label={c}>
                {PARTIDAS.filter((p) => p.categoria === c).map((p) => (
                  <option key={p.nombre} value={p.nombre}>{p.nombre}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">Categoría: {categoriaDe(f.partida)}</p>
        </div>

        <div>
          <label className={lbl}>Monto *</label>
          <input type="number" min={0} step="0.01" className={fieldClass} value={f.monto} onChange={set("monto")} placeholder="0.00" />
        </div>
        <div>
          <label className={lbl}>Moneda</label>
          <select className={fieldClass} value={f.moneda} onChange={set("moneda")}>
            <option value="USD">Dólares (USD)</option>
            <option value="BS">Bolívares (Bs)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Tasa de cambio {f.moneda === "BS" && "*"}</label>
          <input type="number" min={0} step="0.01" className={fieldClass} value={f.tasa} onChange={set("tasa")}
            disabled={f.moneda === "USD"} placeholder={tasaBcv ? `BCV ${tasaBcv}` : "Bs por $"} />
        </div>

        <div>
          <label className={lbl}>Beneficiario</label>
          <input className={fieldClass} value={f.beneficiario} onChange={set("beneficiario")} placeholder="Corpoelec, SENIAT…" />
        </div>
        <div>
          <label className={lbl}>Tipo de transacción</label>
          <select className={fieldClass} value={f.tipoTransaccion} onChange={set("tipoTransaccion")}>
            {TIPOS_TRANSACCION.map((tt) => <option key={tt}>{tt}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>N° documento</label>
          <input className={fieldClass} value={f.documento} onChange={set("documento")} placeholder="S/N" />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className={lbl}>Nota</label>
          <input className={fieldClass} value={f.nota} onChange={set("nota")} placeholder="Detalle opcional" />
        </div>
      </div>

      {monto > 0 && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          Se registrará como <strong className="text-text">{fmtUsd(enUsd)}</strong>
          {f.moneda === "BS" && tasa > 0 && ` (${monto.toLocaleString("es-VE")} Bs ÷ ${tasa})`}
          {" · "}{categoriaDe(f.partida)}
        </p>
      )}
      {msg && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

      <div className="mt-3 flex gap-2">
        <Button icon="check" onClick={guardar}>Guardar gasto</Button>
        <Button variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </SectionCard>
  );
}
