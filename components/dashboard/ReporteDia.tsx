"use client";

// El reporte del día en el Dashboard: ventas de Valery, lo que se movió en sus
// cuentas por cobrar y por pagar, y lo que se hizo en Macedonia ese día.
// Cada bloque aparece solo si quien mira puede ver esa sección (null en el
// reporte = no se muestra; nunca un cero que no es cierto).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { SortableTh } from "@/components/ui/SortableTh";
import { TablePager } from "@/components/ui/TablePager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCarga } from "@/lib/ux/use-carga";
import { useTableView } from "@/lib/ux/use-table-view";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtBs, fmtUsd } from "@/lib/ux/format";
import { haceCuanto } from "@/lib/valery/puente";
import { horaVista } from "@/lib/valery/ventas";
import { claseMov, resumirMovs, type Cartera, type GrupoMov, type MovValery } from "@/lib/reporte/reporte-dia";
import { actualizarReporteDesdeValery, reporteDelDia, type ReporteDia as Reporte } from "@/lib/reporte/reporte-dia-db";

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const masDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const chip = "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors";
const chipActivo = "border-brand-strong bg-brand-soft text-brand";
const chipQuieto = "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text";
const n = (x: number) => x.toLocaleString("es-VE");
/** Una lectura de Valery de hoy se vuelve a pedir sola si tiene más de una hora. */
const VIEJA_MS = 60 * 60_000;

export function ReporteDia({ empresa }: { empresa: string }) {
  const hoy = hoyCaracas();
  const [dia, setDia] = useState(hoy);
  const [vuelta, setVuelta] = useState(0);
  const carga = useCarga(`reporte:${empresa}:${dia}:${vuelta}`, () => reporteDelDia(empresa, dia));
  // Mientras se refresca, se sigue viendo lo último que llegó (no parpadea).
  const [ultimo, setUltimo] = useState<Reporte | null>(null);
  if (carga.datos && carga.datos !== ultimo) setUltimo(carga.datos);
  const r = carga.datos ?? (ultimo?.dia === dia ? ultimo : null);
  const [yendo, setYendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const v = r?.valery ?? null;
  // Mientras el agente trae lo pedido, se mira cada 5 s.
  useEffect(() => {
    if (!v?.enCurso) return;
    const t = setInterval(() => setVuelta((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [v?.enCurso]);

  async function leerDeValery() {
    setMsg(null); setYendo(true);
    const res = await actualizarReporteDesdeValery(empresa, dia);
    setYendo(false);
    if (!res.ok) setMsg(res.error);
    setVuelta((x) => x + 1);
  }

  // Sola, una vez por día mirado: si no hay lectura de ese día, o la de hoy es vieja.
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    if (!v || !v.agenteListo || !v.conectado || v.enCurso) return;
    const clave = `${empresa}:${dia}`;
    if (pedidas.current.has(clave)) return;
    const vieja = !v.lecturaMovimientos?.terminadoEn
      || (dia === hoy && Date.now() - Date.parse(v.lecturaMovimientos.terminadoEn) > VIEJA_MS);
    if (!vieja) return;
    pedidas.current.add(clave);
    void actualizarReporteDesdeValery(empresa, dia).then(() => setVuelta((x) => x + 1));
  }, [v, empresa, dia, hoy]);

  const otro = dia !== hoy && dia !== masDias(hoy, -1);
  return (
    <SectionCard title="Reporte del día" description={`Lo que pasó el ${fechaVista(dia)}: ventas y cuentas en Valery, y lo que se hizo en Macedonia.`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={`${chip} ${dia === hoy ? chipActivo : chipQuieto}`} aria-pressed={dia === hoy} onClick={() => setDia(hoy)}>Hoy</button>
        <button type="button" className={`${chip} ${dia === masDias(hoy, -1) ? chipActivo : chipQuieto}`} aria-pressed={dia === masDias(hoy, -1)} onClick={() => setDia(masDias(hoy, -1))}>Ayer</button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="sr-only">Otro día</span>
          <input type="date" className={`h-11 rounded-xl border bg-surface px-3 text-sm text-text ${otro ? "border-brand-strong" : "border-border"}`}
            value={dia} max={hoy} onChange={(e) => e.target.value && setDia(e.target.value)} />
        </label>
        {v && (
          <Button variant="secondary" icon="import" cargando={yendo || v.enCurso} textoCargando="Leyendo Valery…" onClick={leerDeValery}
            disabled={!v.agenteListo}>Leer de Valery</Button>
        )}
      </div>
      {v && !v.agenteListo && <p className="mb-3 text-xs text-warn">Los movimientos del día de CxC y CxP necesitan el agente 1.0.4: reinstálalo desde Configuración → Puente con Valery.</p>}
      {v && v.agenteListo && !v.conectado && !v.enCurso && <p className="mb-3 text-xs text-warn">El agente del servidor no responde: lo de Valery se ve como estaba en su última lectura.</p>}
      {msg && <p className="mb-3 text-xs text-danger">{msg}</p>}

      <EstadoDatos cargando={!r && carga.cargando} error={!r ? carga.error : null} vacio={false}>
        {r && <Cuerpo r={r} empresa={empresa} />}
      </EstadoDatos>
    </SectionCard>
  );
}

function Cuerpo({ r, empresa }: { r: Reporte; empresa: string }) {
  const grupos = useMemo(() => resumirMovs(r.valery?.movimientos ?? []), [r.valery?.movimientos]);
  const v = r.valery;
  const operacion = [r.notas, r.devoluciones, r.cotizaciones, r.cilindros, r.gastos, r.conteos].some((x) => x !== null);
  const ruta = (s: string) => `/admin/${empresa}/${s}`;
  if (!r.ventas && !v && !r.cobrar && !r.pagar && !operacion) {
    return <p className="text-sm text-muted">No tienes acceso a ninguna de las secciones que entran en este reporte.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {r.ventas && (
          <Bloque titulo="Ventas en Valery" icono="sales" href={ruta("revenue")}>
            <Dato etiqueta="Vendido" valor={fmtUsd(r.ventas.netoUsd)} fuerte />
            <Dato etiqueta="Facturas y notas" valor={`${n(r.ventas.ventas)} · ${n(r.ventas.clientes)} cliente(s)`} />
            <Dato etiqueta="Devoluciones" valor={fmtUsd(r.ventas.devolucionesUsd)} />
            <Horario docs={r.ventas.documentos.map((d) => d.hora)} />
            {r.ventas.productos.length > 0 && (
              <p className="mt-2 text-xs text-muted">Lo más vendido: {[...r.ventas.productos].sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 3).map((p) => p.nombre).join(" · ")}</p>
            )}
          </Bloque>
        )}
        {v && (["cxc", "cxp"] as const).map((c) => (
          <BloqueValery key={c} cartera={c} grupos={grupos[c]} hayLectura={!!v.movimientos}
            saldo={c === "cxc" ? v.saldoCxc : v.saldoCxp} href={ruta(c === "cxc" ? "receivables" : "payables")} />
        ))}
        {r.cobrar && <BloqueCuentas titulo="Cuentas por cobrar en Macedonia" icono="receivable" c={r.cobrar} pagado="Abonos cobrados" href={ruta("receivables")} />}
        {r.pagar && <BloqueCuentas titulo="Cuentas por pagar en Macedonia" icono="payable" c={r.pagar} pagado="Abonos pagados" href={ruta("payables")} />}
        {operacion && (
          <Bloque titulo="Operación en Macedonia" icono="delivery">
            {r.notas && <Dato etiqueta="Notas de entrega" valor={`${n(r.notas.n)} · ${fmtUsd(r.notas.usd)}`} />}
            {r.devoluciones && <Dato etiqueta="Devoluciones" valor={`${n(r.devoluciones.n)} · ${fmtUsd(r.devoluciones.usd)}`} />}
            {r.cotizaciones && <Dato etiqueta="Cotizaciones" valor={`${n(r.cotizaciones.n)} · ${fmtUsd(r.cotizaciones.usd)}`} />}
            {r.cilindros && <Dato etiqueta="Cilindros" valor={`${n(r.cilindros.entregados)} entregados · ${n(r.cilindros.retornados)} retornados`} />}
            {r.gastos && <Dato etiqueta="Gastos" valor={`${n(r.gastos.n)} · ${fmtUsd(r.gastos.usd)}`} />}
            {r.conteos && <Dato etiqueta="Conteos de inventario" valor={`${n(r.conteos.n)} (${n(r.conteos.cerrados)} cerrados)`} />}
          </Bloque>
        )}
      </div>
      {v?.movimientos && v.movimientos.length > 0 && <TablaMovs movs={v.movimientos} />}
      {v?.lecturaMovimientos && (
        <p className="mt-3 text-xs text-muted">Movimientos de Valery leídos {haceCuanto(v.lecturaMovimientos.terminadoEn)}. Montos en bolívares como los guarda Valery; en dólares, el total en dólares que guarda Valery para cada documento.</p>
      )}
    </>
  );
}

function Bloque({ titulo, icono, href, children }: { titulo: string; icono: Parameters<typeof Icon>[0]["name"]; href?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text"><Icon name={icono} size={16} /> <span className="truncate">{titulo}</span></p>
        {href && <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-brand hover:underline">Ver</Link>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Dato({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted">{etiqueta}</span>
      <span className={`text-right tabular-nums ${fuerte ? "text-base font-semibold text-text" : "text-text"}`}>{valor}</span>
    </p>
  );
}

/** La primera y la última venta del día, si se sabe la hora (agente 1.0.4). */
function Horario({ docs }: { docs: (string | null)[] }) {
  const horas = docs.filter((h): h is string => !!h).sort();
  if (!horas.length) return null;
  return <Dato etiqueta="Primera y última" valor={`${horaVista(horas[0])} – ${horaVista(horas[horas.length - 1])}`} />;
}

function BloqueValery({ cartera, grupos, hayLectura, saldo, href }: {
  cartera: Cartera; grupos: GrupoMov[]; hayLectura: boolean; href: string;
  saldo: { bs: number; documentos: number; lectura: { terminadoEn: string | null } } | null;
}) {
  return (
    <Bloque titulo={cartera === "cxc" ? "Cuentas por cobrar en Valery" : "Cuentas por pagar en Valery"} icono={cartera === "cxc" ? "receivable" : "payable"} href={href}>
      {!hayLectura ? (
        <p className="text-sm text-muted">Sin lectura de ese día todavía.</p>
      ) : !grupos.length ? (
        <p className="text-sm text-muted">Sin movimientos ese día.</p>
      ) : grupos.map((g) => (
        <Dato key={g.clase} etiqueta={`${g.etiqueta} (${n(g.documentos)})`} valor={g.totalUsd !== null ? `${fmtBs(g.totalBs)} · ${fmtUsd(g.totalUsd)}` : fmtBs(g.totalBs)} />
      ))}
      {saldo && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
          Saldo en Valery: <span className="tabular-nums text-text">{fmtBs(saldo.bs)}</span> en {n(saldo.documentos)} documento(s) · leído {haceCuanto(saldo.lectura.terminadoEn)}
        </p>
      )}
    </Bloque>
  );
}

function BloqueCuentas({ titulo, icono, c, pagado, href }: {
  titulo: string; icono: "receivable" | "payable"; href: string; pagado: string;
  c: { nuevas: { n: number; usd: number }; abonos: { n: number; usd: number }; liquidaciones: { n: number; usd: number } };
}) {
  return (
    <Bloque titulo={titulo} icono={icono} href={href}>
      <Dato etiqueta={`Cuentas nuevas (${n(c.nuevas.n)})`} valor={fmtUsd(c.nuevas.usd)} />
      <Dato etiqueta={`${pagado} (${n(c.abonos.n)})`} valor={fmtUsd(c.abonos.usd)} />
      <Dato etiqueta={`Liquidaciones (${n(c.liquidaciones.n)})`} valor={fmtUsd(c.liquidaciones.usd)} />
    </Bloque>
  );
}

const TONO: Record<ReturnType<typeof claseMov>, "info" | "ok" | "warn" | "muted"> = {
  documento: "info", pago: "ok", nota_credito: "warn", anticipo: "ok", retencion: "muted", otro: "muted",
};

function TablaMovs({ movs }: { movs: MovValery[] }) {
  const acc = useMemo(() => ({
    hora: (m: MovValery) => m.hora ?? "", cartera: (m: MovValery) => m.cartera, tipo: (m: MovValery) => m.tipo,
    contraparte: (m: MovValery) => m.contraparte, total: (m: MovValery) => m.totalBs,
  }), []);
  const t = useTableView(movs, acc, 25);
  // Un botón y no un <details>: con su borde y su relleno, el paginador no cabía en 375 px.
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="mt-4">
      <Button variant="secondary" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)}>
        {abierta ? "Ocultar" : "Ver"} los {n(movs.length)} movimientos de Valery
      </Button>
      {abierta && <div className="mt-3">
        <div className="sumi-scroll max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <SortableTh label="Hora" sortKey="hora" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Cartera" sortKey="cartera" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Tipo" sortKey="tipo" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Contraparte" sortKey="contraparte" ariaSort={t.ariaSort} onSort={t.toggleSort} />
                <SortableTh label="Total" sortKey="total" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.visible.map((m, i) => (
                <tr key={`${m.cartera}|${m.tipo}|${m.documento}|${i}`} className="align-top hover:bg-surface-2">
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-muted">{horaVista(m.hora)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{m.cartera === "cxc" ? "Por cobrar" : "Por pagar"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    <StatusBadge tone={TONO[claseMov(m.tipo)]}>{m.tipo}</StatusBadge>
                    <span className="block font-mono text-[11px] text-muted">{m.documento}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-text">{m.contraparte || "—"}<span className="block text-xs text-muted">{m.concepto}</span></td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-text">
                    {fmtBs(m.totalBs)}
                    {m.totalUsd !== null && <span className="block text-xs text-muted">{fmtUsd(m.totalUsd)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager {...t} etiqueta="movimientos" />
      </div>}
    </div>
  );
}
