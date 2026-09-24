"use client";

// Dashboard: todo de datos reales, en dólares y en bolívares.
//
//   · Arriba, el día: ventas de hoy, cuentas por cobrar y por pagar, cilindros,
//     compras por recibir. Antes eran ocho tarjetas escritas en cero.
//   · Abajo, el período elegido, del histórico real de Valery (las dos empresas).
//     Antes «Rentabilidad» y los gráficos eran cifras fijas de 2024 de
//     Sumigases, y Sudematin salía en cero por un factor 0.
//   · Los bolívares van a la tasa BCV de hoy, debajo de cada monto. Con años
//     enteros llegan a diez y más dígitos: se abrevian en millones o billones
//     para que quepan (fmtBsCorto).
//   · Utilidad, ROI y márgenes son de Owner y Administrador, como Gastos.

import { useMemo } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { AlertCard } from "@/components/ui/AlertCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeriesChart } from "@/components/ui/SeriesChart";
import { HistoryKpis, HistoryTrend } from "@/components/ui/HistoryStats";
import { getHistory } from "@/lib/ux/history-data";
import { historicoEnRango, totalesDe, AGRUPACIONES_HISTORICO } from "@/lib/ux/historico-rango";
import { enBs, fmtUsd } from "@/lib/ux/format";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { useBcvRate, useTasaViva } from "@/lib/ux/bcv-rate";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { saldos, type SaldoCilindro } from "@/lib/cilindros/cilindros-db";
import { resumenOperativo } from "@/lib/ux/dashboard-db";
import { useCarga } from "@/lib/ux/use-carga";
import { SelectorRango } from "@/components/ui/SelectorRango";
import { RANGO_HISTORICO, type Rango } from "@/lib/ux/rango";
import { Icon } from "@/components/ui/Icon";
import { alertasOperativas } from "@/lib/ux/dashboard-data";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { useSesion } from "@/components/auth/SesionProvider";
import { puedeVer } from "@/lib/auth/permisos";
import { puedeVerFinanzas, useRol } from "@/lib/ux/session";

const selectClass = "sumi-campo sumi-campo--auto min-w-[9rem]";

type Filtros = { empresa: string; rango: Rango };

// Vista de dashboard reutilizable. Con `empresaFija` queda bloqueada a una empresa
// (rutas /admin/[empresa]/dashboard, con su tema).
export function DashboardView({ empresaFija }: { empresaFija?: string }) {
  // v3: sin el selector de moneda (dólares y bolívares van juntos) y con el
  // rango del histórico, que cierra el mes anterior.
  const [f, setF] = usePersistedState<Filtros>("dash:filtros:v3", { empresa: "sumigases", rango: RANGO_HISTORICO });
  const empresa = empresaFija ?? f.empresa;
  const emp = isEmpresaId(empresa) ? EMPRESAS[empresa] : null;
  const tasa = useTasaViva();
  const bcv = useBcvRate();
  const { rol } = useRol();
  const sesion = useSesion();
  const finanzas = puedeVerFinanzas(rol);
  const ve = (clave: string) => !sesion?.permisos || puedeVer(sesion.permisos, rol, clave);

  const op = useCarga(`op:${empresa}`, () => resumenOperativo(empresa));
  const cilindros = useCarga(`cil:${empresa}`, () => (ve("cylinders") ? saldos(empresa) : Promise.resolve([] as SaldoCilindro[])));

  const porEstado = useMemo(() => {
    const ETIQUETAS: Record<string, { etiqueta: string; tone: "ok" | "muted" | "info" | "warn" | "danger" }> = {
      lleno:           { etiqueta: "Llenos",             tone: "ok" },
      vacio:           { etiqueta: "Vacíos",             tone: "muted" },
      en_cliente:      { etiqueta: "En Cliente",         tone: "info" },
      en_llenado:      { etiqueta: "En Llenado",         tone: "warn" },
      fuera_servicio:  { etiqueta: "Fuera de Servicio",  tone: "danger" },
    };
    const suma = new Map<string, number>();
    for (const s of (cilindros.datos ?? []) as SaldoCilindro[]) {
      suma.set(s.estado, (suma.get(s.estado) ?? 0) + s.cantidad);
    }
    return [...suma.entries()]
      .filter(([, n]) => n !== 0)
      .map(([estado, cantidad]) => ({
        estado, cantidad,
        etiqueta: ETIQUETAS[estado]?.etiqueta ?? estado,
        tone: ETIQUETAS[estado]?.tone ?? ("muted" as const),
      }));
  }, [cilindros.datos]);
  const totalCil = porEstado.reduce((a, c) => a + c.cantidad, 0);
  const cil = (estado: string) => porEstado.find((c) => c.estado === estado)?.cantidad ?? 0;

  // El período, del histórico real de la empresa activa.
  const hist = getHistory(empresa);
  const periodos = historicoEnRango(empresa, f.rango);
  const t = totalesDe(periodos);
  const hastaHist = hist.meta.hasta.split("-").reverse().join("-");
  const cargando = op.cargando ? "…" : "—";
  const o = op.datos;
  const n = (x: number) => x.toLocaleString("es-VE");

  type Kpi = { key: string; label: string; value: string; bs?: string | null; sub?: string; tone: "brand" | "navy" | "ok" | "warn" | "danger" | "info" };
  const kpis: Kpi[] = [
    ...(ve("delivery-notes") ? [{ key: "vh", label: "Ventas Hoy", value: o?.ventasHoy ? fmtUsd(o.ventasHoy.usd) : cargando,
      bs: o?.ventasHoy ? enBs(o.ventasHoy.usd, tasa) : null, sub: o?.ventasHoy ? `${n(o.ventasHoy.notas)} nota(s) de entrega` : undefined, tone: "brand" as const }] : []),
    ...(o?.cobrar !== null && ve("receivables") ? [{ key: "cxc", label: "Cuentas por Cobrar", value: o?.cobrar ? fmtUsd(o.cobrar.usd) : cargando,
      bs: o?.cobrar ? enBs(o.cobrar.usd, tasa) : null,
      sub: o?.cobrar ? `${n(o.cobrar.documentos)} documento(s) · vencido ${fmtUsd(o.cobrar.vencido)}` : undefined, tone: "warn" as const }] : []),
    ...(o?.pagar !== null && ve("payables") ? [{ key: "cxp", label: "Cuentas por Pagar", value: o?.pagar ? fmtUsd(o.pagar.usd) : cargando,
      bs: o?.pagar ? enBs(o.pagar.usd, tasa) : null,
      sub: o?.pagar ? `${n(o.pagar.proveedores)} proveedor(es) · vencido ${fmtUsd(o.pagar.vencido)}` : undefined, tone: "danger" as const }] : []),
    ...(ve("inventory") ? [{ key: "neg", label: "Existencia Negativa", value: o?.negativos ? n(o.negativos.productos) : cargando,
      sub: "productos que salieron sin entrada registrada", tone: "warn" as const }] : []),
    ...(ve("cylinders") ? [
      { key: "cp", label: "Cilindros por Retornar", value: cilindros.cargando ? "…" : n(cil("en_cliente")), sub: "en poder de clientes", tone: "info" as const },
      { key: "rp", label: "Recargas Pendientes", value: cilindros.cargando ? "…" : n(cil("vacio") + cil("en_llenado")), sub: "vacíos y en llenado", tone: "info" as const },
    ] : []),
    ...(o?.compras !== null && ve("purchases") ? [{ key: "oc", label: "Compras por Recibir", value: o?.compras ? n(o.compras.ordenes) : cargando,
      bs: null, sub: o?.compras ? `orden(es) · ${fmtUsd(o.compras.usd)} pendientes` : undefined, tone: "navy" as const }] : []),
    ...(finanzas ? [{ key: "bg", label: "Utilidad del Período", value: fmtUsd(t.util), bs: enBs(t.util, tasa),
      sub: `histórico de Valery, hasta ${hastaHist}`, tone: "ok" as const }] : []),
  ];

  const empresaLabel = empresa === "sudematin" ? "Sudematin" : "Sumigases";
  const topProductos = hist.topProductos.slice(0, 5);
  const topClientes = hist.topClientes.slice(0, 5);

  return (
    <div className={emp ? `theme-${emp.id}` : ""}>
      {emp && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <img src={emp.logo} alt={emp.nombre}
            className="h-8 w-auto max-w-[110px] shrink-0 object-contain sm:h-9 sm:max-w-[160px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{emp.nombre}</p>
            <p className="truncate text-xs text-muted">RIF {emp.rif}</p>
          </div>
          <div className="hidden sm:block">
            <StatusBadge tone="brand">Panel {emp.nombreCorto}</StatusBadge>
          </div>
        </div>
      )}
      <PageHeader
        title="Dashboard"
        filters={!empresaFija ? (
          <>
            <label className="sr-only" htmlFor="f-empresa">Empresa</label>
            <select id="f-empresa" className={selectClass} value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}>
              <option value="sumigases">Sumigases</option>
              <option value="sudematin">Sudematin</option>
            </select>
          </>
        ) : undefined}
      />

      {/* Banda superior: el histórico en una línea + la tasa del día */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ok/10 text-ok"><Icon name="roi" size={18} /></span>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Histórico {empresaLabel} · Valery</p>
          </div>
          <div className={`mt-3 grid gap-3 ${finanzas ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"}`}>
            <div className="min-w-0">
              <p className="text-base font-semibold tabular-nums text-text sm:text-xl">{fmtUsd(hist.totals.venta)}</p>
              {tasa && <p className="text-[11px] tabular-nums text-muted [overflow-wrap:anywhere]">≈ {enBs(hist.totals.venta, tasa)}</p>}
              <p className="text-xs text-muted">Ventas</p>
            </div>
            {finanzas && (
              <>
                <div className="min-w-0">
                  <p className="text-base font-semibold tabular-nums text-text sm:text-xl">{fmtUsd(hist.totals.util)}</p>
                  {tasa && <p className="text-[11px] tabular-nums text-muted [overflow-wrap:anywhere]">≈ {enBs(hist.totals.util, tasa)}</p>}
                  <p className="text-xs text-muted">Utilidad</p>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold tabular-nums text-ok sm:text-xl">{hist.totals.roi.toLocaleString("es-VE")}%</p>
                  <p className="text-xs text-muted">ROI (utilidad / costo)</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon name="dollar" size={18} /></span>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Precio del Dólar · BCV</p>
          </div>
          {bcv ? (
            <>
              <p className="mt-2 text-xl font-semibold tabular-nums text-text sm:text-2xl">{bcv.tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs</p>
              <p className="mt-1 text-xs text-muted">
                {bcv.fecha ? `Fecha valor BCV: ${bcv.fecha} · ` : ""}Consultado: {new Date(bcv.fetchedAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <p className="mt-1 text-xs text-muted">Los bolívares de esta pantalla se calculan a esta tasa.</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-xl font-semibold text-muted sm:text-2xl">— Bs</p>
              <p className="mt-1 text-xs text-muted">Sin consultar. Pulsa «Tasa BCV» en la barra superior.</p>
            </>
          )}
        </div>
      </div>

      {op.error && <AlertCard tone="danger" titulo="No se pudieron leer los indicadores del día" mensaje={op.error} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} bs={k.bs} sub={k.sub} tone={k.tone} />
        ))}
      </div>

      {finanzas && (
        <>
          <div className="mt-6">
            <SectionCard
              title="Histórico de Ventas y Compras"
              action={<StatusBadge tone="brand">Real {hist.meta.desde.slice(0, 4)}–{hist.meta.hasta.slice(0, 4)}</StatusBadge>}
            >
              <HistoryKpis empresa={empresa} tasa={tasa} />
              <div className="mt-5 border-t border-border pt-4">
                <HistoryTrend empresa={empresa} />
              </div>
            </SectionCard>
          </div>

          <div className="mb-4 mt-6 rounded-2xl border border-border bg-surface px-4 py-3">
            <SelectorRango valor={f.rango} onCambio={(r) => setF({ ...f, rango: r })} agrupaciones={AGRUPACIONES_HISTORICO} />
          </div>

          <SectionCard title="Rentabilidad del Período"
            description={`Del histórico de Valery, que llega hasta ${hastaHist}.`}
            action={<StatusBadge tone="brand">{periodos.length} período(s)</StatusBadge>}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="ROI del Período" value={`${t.roi.toLocaleString("es-VE")}%`} sub="utilidad / costo" accent />
              <StatCard label="Utilidad" value={fmtUsd(t.util)} bs={enBs(t.util, tasa)} sub="ventas menos costo" />
              <StatCard label="Margen Bruto" value={`${t.margen.toLocaleString("es-VE")}%`} sub="sobre ventas" />
              <StatCard label="Ventas" value={fmtUsd(t.venta)} bs={enBs(t.venta, tasa)}
                sub={`compras ${fmtUsd(t.compra)}${t.compra > 0 ? ` · ${(t.venta / t.compra).toLocaleString("es-VE", { maximumFractionDigits: 1 })}x` : ""}`} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-text">Productos de Mayor Utilidad</p>
                <ul className="space-y-1.5">
                  {topProductos.map((p) => {
                    const costo = p.venta - p.util;
                    return (
                      <li key={p.codigo} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-muted">{p.nombre}</span>
                        <span className="shrink-0 text-right">
                          <b className="block tabular-nums text-text">{fmtUsd(p.util)}</b>
                          {costo > 0 && <span className="text-[11px] text-muted">ROI {Math.round((p.util / costo) * 100).toLocaleString("es-VE")}%</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-text">Clientes de Mayor Facturación</p>
                <ul className="space-y-1.5">
                  {topClientes.map((c) => (
                    <li key={c.nombre} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-muted">{c.nombre}</span>
                      <b className="shrink-0 tabular-nums text-text">{fmtUsd(c.venta)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">Productos y clientes: acumulado de todo el histórico.</p>
          </SectionCard>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Ventas vs Utilidad">
              <SeriesChart labels={periodos.map((p) => p.etiqueta)} formato={(v) => fmtUsd(v)} height={240}
                series={[
                  { name: "Ventas", color: "var(--color-brand)", values: periodos.map((p) => p.venta) },
                  { name: "Utilidad", color: "var(--color-ok)", values: periodos.map((p) => p.util) },
                ]} />
            </SectionCard>
            <SectionCard title="Ventas vs Compras">
              <SeriesChart labels={periodos.map((p) => p.etiqueta)} formato={(v) => fmtUsd(v)} height={240}
                series={[
                  { name: "Ventas", color: "var(--color-brand)", values: periodos.map((p) => p.venta) },
                  { name: "Compras", color: "var(--color-warn)", values: periodos.map((p) => p.compra) },
                ]} />
            </SectionCard>
          </div>
        </>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ve("cylinders") && <SectionCard title="Cilindros por Estado" description="Calculado de los movimientos.">
          {/* Sale de la base, no de una lista en cero: la vista cilindros_saldo
              existe desde que se construyó el módulo. Antes se dibujaban cinco
              filas en cero y cinco barras con width NaN%, porque el porcentaje
              se calculaba dividiendo entre un total que era cero. */}
          <EstadoDatos
            cargando={cilindros.cargando}
            error={cilindros.error}
            vacio={porEstado.length === 0}
            tituloVacio="Todavía no hay cilindros"
            mensajeVacio="Cuando se den de alta en Cilindros, aparecen aquí."
            filas={4}
          >
            <ul className="space-y-3">
              {porEstado.map((c) => {
                const pct = totalCil > 0 ? Math.round((c.cantidad / totalCil) * 100) : 0;
                return (
                  <li key={c.estado}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <StatusBadge tone={c.tone}>{c.etiqueta}</StatusBadge>
                      <span className="font-medium tabular-nums text-text">{c.cantidad}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </EstadoDatos>
        </SectionCard>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Alertas Operativas" description="Atención requerida.">
          {alertasOperativas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Nada que atender por ahora.
            </p>
          ) : (
            <div className="space-y-3">
              {alertasOperativas.map((a) => (
                <AlertCard key={a.titulo} tone={a.tone} titulo={a.titulo} mensaje={a.mensaje} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// Entrada por defecto (/admin/dashboard). Cada empresa por separado: no hay
// consolidado, para no mezclar dos operaciones que no se mezclan.
export default function DashboardPage() {
  return <DashboardView />;
}
