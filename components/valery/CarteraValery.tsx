"use client";

// Las cuentas por cobrar (o por pagar) tal como están en Valery, leídas por el
// Puente. Solo se miran: no tocan la cartera de Macedonia (lib/valery/cartera-valery.ts
// dice por qué). Owner y Administradores: la base no se las da a nadie más.

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { SortableTh } from "@/components/ui/SortableTh";
import { TablePager } from "@/components/ui/TablePager";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { useTableView } from "@/lib/ux/use-table-view";
import { useCarga } from "@/lib/ux/use-carga";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import { fechaVista } from "@/lib/ux/tabla-export";
import { fmtBs, fmtTasa, fmtUsd } from "@/lib/ux/format";
import { conectado, haceCuanto } from "@/lib/valery/puente";
import { carteraDeValery, pedirAlPuente } from "@/lib/valery/puente-db";
import {
  buscarDocsValery, diasParaVencer, docsDesdeAgente, resumirCarteraValery, saldoUsd,
  type DocValery, type TipoCartera,
} from "@/lib/valery/cartera-valery";

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

const TEXTO: Record<TipoCartera, { titulo: string; quien: string; total: string; seccion: string; aclaracion: string }> = {
  cxc: {
    titulo: "Cuentas por cobrar en Valery", quien: "Cliente", total: "Por cobrar en Valery", seccion: "CxC Valery",
    aclaracion: "Así está en Valery, solo para mirar: no cambia la cartera de Macedonia. Valery lleva aquí las facturas; las notas de entrega a crédito se llevan en Macedonia.",
  },
  cxp: {
    titulo: "Cuentas por pagar en Valery", quien: "Proveedor", total: "Por pagar en Valery", seccion: "CxP Valery",
    aclaracion: "Así está en Valery, solo para mirar: no cambia la cartera de Macedonia. Valery puede tener facturas viejas que se pagaron y nunca se cerraron allá.",
  },
};

/** «2026-11-02T16:19:22» (hora del servidor de Valery) → «02-11-2026 16:19». */
const fechaHoraServidor = (s: string) => `${fechaVista(s.slice(0, 10))} ${s.slice(11, 16)}`;

function estadoDe(dias: number): { label: string; tone: Tone } {
  if (dias < 0) return { label: `Vencido (${-dias}d)`, tone: "danger" };
  if (dias <= 8) return { label: `Por vencer (${dias}d)`, tone: "warn" };
  return { label: "Pendiente", tone: "info" };
}

export function CarteraValery({ empresa, tipo }: { empresa: string; tipo: TipoCartera }) {
  return <ProveedorExportar><Cartera empresa={empresa} tipo={tipo} /></ProveedorExportar>;
}

function Cartera({ empresa, tipo }: { empresa: string; tipo: TipoCartera }) {
  const tx = TEXTO[tipo];
  const carga = useCarga(`valery:${tipo}:${empresa}`, () => carteraDeValery(empresa, tipo));
  const tasa = useTasaViva();
  const [yendo, setYendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const ultimo = carga.datos?.ultimo ?? null;
  const enCamino = ultimo?.estado === "pendiente" || ultimo?.estado === "en_proceso";
  // Mientras el agente lee, se mira cada 4 s; el agente pregunta cada 15.
  const { recargar } = carga;
  useEffect(() => {
    if (!enCamino) return;
    const t = setInterval(recargar, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCamino]);

  const hoy = hoyCaracas();
  const lectura = carga.datos?.lectura ?? null;
  const { docs, descartadas } = useMemo(() => docsDesdeAgente(tipo, lectura?.filas ?? []), [tipo, lectura]);
  const r = useMemo(() => resumirCarteraValery(docs, hoy, tasa), [docs, hoy, tasa]);
  const filtrados = useMemo(() => buscarDocsValery(docs, q), [docs, q]);

  async function leerAhora() {
    setMsg(null); setYendo(true);
    const p = await pedirAlPuente(empresa, tipo);
    setYendo(false);
    if (!p.ok) setMsg(p.error);
    recargar();
  }

  const agente = carga.datos?.agente ?? null;
  const vivo = conectado(agente?.ultimoContacto ?? null);
  let estado: { texto: string; tono: "ok" | "warn" | "muted" };
  if (!agente) estado = { texto: "El Puente Valery no está instalado en esta empresa: no hay de dónde leer.", tono: "warn" };
  else if (enCamino) estado = { texto: ultimo!.estado === "pendiente" && !vivo ? "Lectura pedida: el agente la toma cuando vuelva a conectarse." : "Leyendo Valery…", tono: "muted" };
  else if (ultimo?.estado === "error") estado = { texto: `La última lectura falló (${haceCuanto(ultimo.terminadoEn ?? ultimo.creadoEn)}): ${(ultimo.error ?? "sin detalle").replace(/\.$/, "")}.${lectura ? " Abajo está la anterior." : ""}`, tono: "warn" };
  else if (lectura) estado = { texto: `Leído de Valery ${haceCuanto(lectura.terminadoEn)}${lectura.copiaEn ? ` · copia de la base del ${fechaHoraServidor(lectura.copiaEn)}` : ""}.`, tono: "ok" };
  else estado = { texto: "Todavía no se ha leído de Valery.", tono: "muted" };

  return (
    <SectionCard title={tx.titulo} description={tx.aclaracion}>
      {/* Los botones van en el cuerpo, no en `action`: ahí no se parten y en 375 px se salían. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon="import" cargando={yendo || enCamino} textoCargando="Leyendo…" onClick={leerAhora} disabled={!agente}>Leer de Valery ahora</Button>
        <BotonDescargar empresa={empresa} />
      </div>
      <p role="status" className={`mb-4 flex items-start gap-2 text-sm ${estado.tono === "warn" ? "text-warn" : "text-text"}`}>
        <span className={`mt-0.5 shrink-0 ${estado.tono === "ok" ? "text-ok" : estado.tono === "warn" ? "text-warn" : "text-muted"}`}>
          <Icon name={estado.tono === "warn" ? "alert" : enCamino ? "import" : "check"} size={16} />
        </span>
        <span className="min-w-0">{estado.texto}</span>
      </p>
      {agente && !vivo && !enCamino && <p className="-mt-2 mb-4 text-xs text-warn">El agente del servidor no responde desde {haceCuanto(agente.ultimoContacto)}.</p>}
      {msg && <p className="-mt-2 mb-4 text-xs text-danger">{msg}</p>}

      <EstadoDatos cargando={carga.cargando} error={carga.error} vacio={!lectura}
        tituloVacio="Sin lectura de Valery" mensajeVacio="Pulsa «Leer de Valery ahora»: el agente la trae en unos segundos.">
        {/* Una columna en el teléfono: un saldo en bolívares no cabe en media tarjeta sin partirse. */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={tx.total} value={fmtBs(r.saldoBs)} accent sub={r.saldoUsd !== null ? `≈ ${fmtUsd(r.saldoUsd)}` : undefined} />
          <StatCard label="Vencido" value={fmtBs(r.vencidoBs)} sub={r.vencidoUsd !== null ? `≈ ${fmtUsd(r.vencidoUsd)} · ${r.vencidos} documento(s)` : `${r.vencidos} documento(s)`} />
          <StatCard label="Documentos" value={String(r.documentos)} sub={`${r.contrapartes} ${tipo === "cxc" ? "cliente(s)" : "proveedor(es)"}`} />
          <StatCard label="Último documento" value={(r.ultimaEmision && fechaVista(r.ultimaEmision)) || "—"} sub={r.masVieja ? `El más viejo: ${fechaVista(r.masVieja)}` : undefined} />
        </div>
        <label className="mb-3 block">
          <span className="sr-only">Buscar</span>
          <input className="sumi-campo" type="search" placeholder={`Buscar ${tx.quien.toLowerCase()}, RIF o documento`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Tabla docs={filtrados} tipo={tipo} hoy={hoy} tasa={tasa} busqueda={q} />
        <p className="mt-3 text-xs text-muted">
          US$: los documentos en dólares, a la tasa del documento; los de bolívares, a la tasa BCV de hoy{tasa ? ` (${fmtTasa(tasa)})` : ""}.
          {descartadas > 0 && ` ${descartadas} fila(s) del agente sin documento, fecha o saldo no se muestran.`}
        </p>
      </EstadoDatos>
    </SectionCard>
  );
}

function Tabla({ docs, tipo, hoy, tasa, busqueda }: { docs: DocValery[]; tipo: TipoCartera; hoy: string; tasa: number | null; busqueda: string }) {
  const tx = TEXTO[tipo];
  const acc = useMemo(() => ({
    emision: (d: DocValery) => d.emision, vence: (d: DocValery) => diasParaVencer(d, hoy), documento: (d: DocValery) => d.documento,
    contraparte: (d: DocValery) => d.contraparte, saldo: (d: DocValery) => d.saldoBs, usd: (d: DocValery) => saldoUsd(d, tasa)?.usd ?? 0,
  }), [hoy, tasa]);
  const t = useTableView(docs, acc, 25);
  useExportable(() => ({
    modulo: "", seccion: tx.seccion, titulo: tx.titulo,
    detalle: [`Leído de Valery por el Puente. Al ${fechaVista(hoy)}.`, ...(busqueda.trim() ? [`Búsqueda: «${busqueda.trim()}»`] : [])],
    columnas: [{ titulo: "Emisión", tipo: "fecha" }, { titulo: "Vence", tipo: "fecha" }, { titulo: "Tipo" }, { titulo: "Documento", tipo: "codigo" },
      ...(tipo === "cxp" ? [{ titulo: "N.º control", tipo: "codigo" as const }] : []),
      { titulo: tx.quien }, { titulo: "RIF", tipo: "codigo" }, { titulo: "Moneda" }, { titulo: "Saldo (Bs)", tipo: "num" }, { titulo: "Saldo (US$)", tipo: "usd" }],
    filas: t.ordenadas.map((d) => {
      const u = saldoUsd(d, tasa);
      return [fechaVista(d.emision), d.vencimiento ? fechaVista(d.vencimiento) : "", d.tipo, d.documento, ...(tipo === "cxp" ? [d.numeroControl] : []),
        d.contraparte, d.rif, d.moneda, Math.round(d.saldoBs * 100) / 100, u ? Math.round(u.usd * 100) / 100 : null];
    }),
    nota: `Saldos como los guarda Valery, en bolívares. US$: los documentos en dólares a la tasa del documento; los de bolívares a la tasa BCV de hoy${tasa ? ` (${fmtTasa(tasa)})` : ""}.`,
  }));
  if (!docs.length) return <EmptyState icon={tipo === "cxc" ? "receivable" : "payable"} title="Sin documentos" message="No hay documentos con saldo que coincidan con la búsqueda." />;
  return (
    <>
      <div className="sumi-scroll max-w-full overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <SortableTh label="Emisión" sortKey="emision" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Vence" sortKey="vence" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Documento" sortKey="documento" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label={tx.quien} sortKey="contraparte" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="Saldo (Bs)" sortKey="saldo" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
              <SortableTh label="US$" sortKey="usd" align="right" ariaSort={t.ariaSort} onSort={t.toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.visible.map((d) => {
              const e = estadoDe(diasParaVencer(d, hoy));
              const u = saldoUsd(d, tasa);
              return (
                <tr key={d.clave} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-muted">{fechaVista(d.emision)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3"><StatusBadge tone={e.tone}>{e.label}</StatusBadge></td>
                  <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs text-muted">
                    {d.tipo} {d.documento}
                    {d.numeroControl && <span className="block text-[11px]">Control {d.numeroControl}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-text">
                    {d.contraparte || "—"}
                    {d.rif && <span className="block text-xs text-muted">{d.rif}</span>}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-medium tabular-nums text-text">{fmtBs(d.saldoBs)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-muted">
                    {u ? fmtUsd(u.usd) : "—"}
                    {d.moneda === "USD" && <span className="block text-[11px]">en dólares</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePager {...t} etiqueta="documentos" />
    </>
  );
}
