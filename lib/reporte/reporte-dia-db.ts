"use server";

// El reporte del Dashboard por día, semana, mes o año (lib/reporte/reporte-dia.ts).
//
// Todo con la sesión de quien mira, y cada parte SOLO si puede ver su
// sección (el mismo criterio que los indicadores de lib/ux/dashboard-db.ts):
// a quien no ve Gastos no se le muestra «Gastos: $0», se le omite la parte.
// Lo de Valery (movimientos y saldos de CxC/CxP) es del Owner y los
// Administradores: la base solo a ellos les da lo que trae el Puente.
// Supabase corta en 1.000 filas: un año de abonos o de notas pasa de eso, así
// que todo se lee con todasLasFilas.

import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { getUsuarioSesion, sesionPuede } from "@/lib/auth/sesion-servidor";
import { ventasDelPeriodo } from "@/lib/valery/ventas-db";
import { resumirVentas, type MovVenta } from "@/lib/valery/ventas";
import { corteDe } from "@/lib/valery/ventas-auto";
import { agentePuente, pedirAlPuente } from "@/lib/valery/puente-db";
import { conectado, errorDeRango, filasDeParte, versionAlMenos, type TipoSolicitud } from "@/lib/valery/puente";
import { isEmpresaId, type EmpresaId } from "@/lib/ux/empresas";
import {
  armarSerie, contar, limitesDelRango, movsDesdeAgente, puntosMovs,
  type Conteo, type FilaSerie, type MovValery, type Periodo, type Punto,
} from "./reporte-dia";

export type Lectura = { id: number; terminadoEn: string | null };
type Cuentas = { nuevas: Conteo; abonos: Conteo; liquidaciones: Conteo; puntosAbonos: Punto[] };

export type ReportePeriodo = {
  periodo: Periodo;
  desde: string;
  hasta: string;
  ventas: {
    netoUsd: number; devolucionesUsd: number; ventas: number; clientes: number;
    masVendidos: string[];
    /** Primera y última hora del período (solo tiene sentido en un día). */
    primera: string | null; ultima: string | null;
    /** Las ventas entran a Macedonia desde el corte de inventario: antes no hay. */
    corte: string | null;
    puntos: Punto[];
  } | null;
  valery: {
    /** El agente puede traer los movimientos (1.0.4 o más nuevo). */
    agenteListo: boolean;
    conectado: boolean;
    enCurso: boolean;
    movimientos: MovValery[] | null;
    lecturaMovimientos: Lectura | null;
    /** Saldo total en Valery HOY, según la última lectura de CxC / CxP (en bolívares). */
    saldoCxc: { bs: number; documentos: number; lectura: Lectura } | null;
    saldoCxp: { bs: number; documentos: number; lectura: Lectura } | null;
  } | null;
  cobrar: Cuentas | null;
  pagar: Cuentas | null;
  notas: (Conteo & { puntos: Punto[] }) | null;
  devoluciones: Conteo | null;
  cotizaciones: Conteo | null;
  cilindros: { movimientos: number; entregados: number; retornados: number } | null;
  gastos: (Conteo & { puntos: Punto[] }) | null;
  conteos: { n: number; cerrados: number } | null;
  /** El desglose por día (semana, mes) o por mes (año). Vacío en un día. */
  serie: FilaSerie[];
};

async function parte<T>(puede: boolean, leer: () => Promise<T>): Promise<T | null> {
  if (!puede) return null;
  try { return await leer(); } catch { return null; }
}

const PERIODOS: Periodo[] = ["dia", "semana", "mes", "anio"];

export async function reportePeriodo(empresa: string, periodo: Periodo, desde: string, hasta: string): Promise<ReportePeriodo> {
  const vacio: ReportePeriodo = { periodo, desde, hasta, ventas: null, valery: null, cobrar: null, pagar: null, notas: null, devoluciones: null, cotizaciones: null, cilindros: null, gastos: null, conteos: null, serie: [] };
  const u = await getUsuarioSesion();
  if (!u || !isEmpresaId(empresa) || !PERIODOS.includes(periodo) || errorDeRango(desde, hasta)) return vacio;
  const sb = await createClient();
  const puede = (clave: string) => sesionPuede(u, clave);
  const gerencia = u.rol === "owner" || u.rol === "admin";
  const creado = limitesDelRango(desde, hasta);

  const cuentasDe = async (tipo: "cobrar" | "pagar"): Promise<Cuentas> => {
    const [nuevas, abonos, liq] = await Promise.all([
      todasLasFilas<{ monto: number }>((a, b, c) => sb.from("cuentas").select("monto", c ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).eq("tipo", tipo).gte("created_at", creado.desde).lt("created_at", creado.hasta).order("id").range(a, b)),
      todasLasFilas<{ monto: number; fecha: string }>((a, b, c) => sb.from("abonos").select("monto, fecha, cuentas!inner(tipo, empresa_id)", c ? { count: "exact" } : undefined)
        .eq("cuentas.empresa_id", empresa).eq("cuentas.tipo", tipo).gte("fecha", desde).lte("fecha", hasta).order("id").range(a, b)),
      todasLasFilas<{ total: number }>((a, b, c) => sb.from("liquidaciones").select("total", c ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).eq("tipo", tipo).gte("fecha", desde).lte("fecha", hasta).is("anulada_en", null).order("id").range(a, b)),
    ]);
    return {
      nuevas: contar(nuevas.map((x) => ({ usd: Number(x.monto) }))),
      abonos: contar(abonos.map((x) => ({ usd: Number(x.monto) }))),
      liquidaciones: contar(liq.map((x) => ({ usd: Number(x.total) }))),
      puntosAbonos: abonos.map((x) => ({ fecha: x.fecha, valor: Number(x.monto) })),
    };
  };

  const documentosDe = async (tipo: string) => {
    const filas = await todasLasFilas<{ total_usd: number | null; fecha: string }>((a, b, c) => sb.from("documentos").select("total_usd, fecha", c ? { count: "exact" } : undefined)
      .eq("empresa_id", empresa).eq("tipo", tipo).gte("fecha", desde).lte("fecha", hasta).order("id").range(a, b));
    return { ...contar(filas.map((d) => ({ usd: Number(d.total_usd ?? 0) }))), puntos: filas.map((d) => ({ fecha: d.fecha, valor: Number(d.total_usd ?? 0) })) };
  };

  const [ventas, valery, cobrar, pagar, notas, devoluciones, cotizaciones, cilindros, gastos, conteos] = await Promise.all([
    // Las ventas del kardex solo se le leen a Owner/Administrador (RLS de la migración 48): a otro le saldría un cero falso.
    parte(puede("revenue") && gerencia, () => ventasDe(empresa, desde, hasta)),
    parte(gerencia, () => valeryDe(empresa, desde, hasta)),
    parte(puede("receivables"), () => cuentasDe("cobrar")),
    parte(puede("payables"), () => cuentasDe("pagar")),
    parte(puede("delivery-notes"), () => documentosDe("nota_entrega")),
    parte(puede("delivery-notes"), async () => { const d = await documentosDe("devolucion"); return { n: d.n, usd: d.usd }; }),
    parte(puede("quotes"), async () => { const d = await documentosDe("cotizacion"); return { n: d.n, usd: d.usd }; }),
    parte(puede("cylinders"), async () => {
      const f = await todasLasFilas<{ cantidad: number; estado_desde: string | null; estado_hacia: string | null }>((a, b, c) => sb.from("cilindros_mov")
        .select("cantidad, estado_desde, estado_hacia", c ? { count: "exact" } : undefined).eq("empresa_id", empresa).gte("fecha", desde).lte("fecha", hasta).order("id").range(a, b));
      return {
        movimientos: f.length,
        entregados: f.filter((m) => m.estado_hacia === "en_cliente").reduce((a, m) => a + m.cantidad, 0),
        retornados: f.filter((m) => m.estado_desde === "en_cliente").reduce((a, m) => a + m.cantidad, 0),
      };
    }),
    parte(puede("expenses"), async () => {
      const f = await todasLasFilas<{ monto_usd: number; fecha: string }>((a, b, c) => sb.from("gastos").select("monto_usd, fecha", c ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).gte("fecha", desde).lte("fecha", hasta).order("id").range(a, b));
      return { ...contar(f.map((g) => ({ usd: Number(g.monto_usd) }))), puntos: f.map((g) => ({ fecha: g.fecha, valor: Number(g.monto_usd) })) };
    }),
    parte(puede("inventory"), async () => {
      const f = await todasLasFilas<{ cerrado: boolean }>((a, b, c) => sb.from("conteos").select("cerrado", c ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).gte("fecha", desde).lte("fecha", hasta).order("id").range(a, b));
      return { n: f.length, cerrados: f.filter((x) => x.cerrado).length };
    }),
  ]);

  const movs = valery?.movimientos ?? null;
  const serie = armarSerie(periodo, desde, hasta, {
    vendido: ventas?.puntos ?? null,
    facturadoCxc: movs && puntosMovs(movs, "cxc", "documento"),
    cobradoCxc: movs && puntosMovs(movs, "cxc", "pago"),
    compradoCxp: movs && puntosMovs(movs, "cxp", "documento"),
    pagadoCxp: movs && puntosMovs(movs, "cxp", "pago"),
    abonosCobrar: cobrar?.puntosAbonos ?? null,
    abonosPagar: pagar?.puntosAbonos ?? null,
    notas: notas?.puntos ?? null,
    gastos: gastos?.puntos ?? null,
  });
  return { periodo, desde, hasta, ventas, valery, cobrar, pagar, notas, devoluciones, cotizaciones, cilindros, gastos, conteos, serie };
}

/** Las ventas del período: los totales, lo más vendido y cuánto se vendió cada día. */
async function ventasDe(empresa: EmpresaId, desde: string, hasta: string): Promise<NonNullable<ReportePeriodo["ventas"]>> {
  const sb = await createClient();
  const [movs, corte] = await Promise.all([ventasDelPeriodo(empresa, desde, hasta), corteDe(sb, empresa)]);
  const r = resumirVentas(movs, empresa);
  const porDia = new Map<string, MovVenta[]>();
  for (const m of movs) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);
  const horas = r.documentos.filter((d) => d.cuenta).map((d) => d.hora).filter((h): h is string => !!h).sort();
  return {
    netoUsd: r.netoUsd, devolucionesUsd: r.devolucionesUsd, ventas: r.ventas, clientes: r.clientes,
    masVendidos: [...r.productos].sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 3).map((p) => p.nombre),
    primera: horas[0] ?? null, ultima: horas[horas.length - 1] ?? null, corte,
    // El neto de cada día con las mismas reglas del total (sin lo de la otra empresa ni el consumo interno).
    puntos: [...porDia].map(([fecha, m]) => ({ fecha, valor: resumirVentas(m, empresa).netoUsd })),
  };
}

/** Lo de Valery para el período: sus movimientos de CxC/CxP y el saldo de hoy (última lectura). */
async function valeryDe(empresa: string, desde: string, hasta: string): Promise<NonNullable<ReportePeriodo["valery"]>> {
  const sb = await createClient();
  const agente = await agentePuente(empresa);
  const cols = "id, estado, terminado_en";
  const [movs, curso, cxc, cxp] = await Promise.all([
    // Cualquier lectura que cubra el período sirve (la de un año cubre sus meses).
    sb.from("valery_solicitudes").select(cols).eq("empresa_id", empresa).eq("tipo", "movimientos").eq("estado", "lista")
      .lte("parametros->>desde", desde).gte("parametros->>hasta", hasta).order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("valery_solicitudes").select("id").eq("empresa_id", empresa).in("tipo", ["movimientos", "cxc", "cxp"]).in("estado", ["pendiente", "en_proceso"]).limit(1),
    sb.from("valery_solicitudes").select(cols).eq("empresa_id", empresa).eq("tipo", "cxc").eq("estado", "lista").order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("valery_solicitudes").select(cols).eq("empresa_id", empresa).eq("tipo", "cxp").eq("estado", "lista").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const filasDe = async (id: number) => {
    const { data, error } = await sb.from("valery_resultados").select("parte, datos").eq("solicitud_id", id).order("parte");
    if (error) throw error;
    return (data ?? []).flatMap((p) => filasDeParte(p.datos) ?? []);
  };
  const saldo = async (s: { id: number; terminado_en: string | null } | null) => {
    if (!s) return null;
    const filas = (await filasDe(s.id)) as { saldo?: unknown }[];
    return { bs: filas.reduce((a, f) => a + (Number(f.saldo) || 0), 0), documentos: filas.length, lectura: { id: s.id, terminadoEn: s.terminado_en } };
  };
  const [movimientos, saldoCxc, saldoCxp] = await Promise.all([
    movs.data ? filasDe(movs.data.id).then((f) => movsDesdeAgente(f).filter((m) => m.fecha >= desde && m.fecha <= hasta)) : Promise.resolve(null),
    saldo(cxc.data), saldo(cxp.data),
  ]);
  return {
    agenteListo: versionAlMenos(agente?.version, "1.0.4"),
    conectado: conectado(agente?.ultimoContacto ?? null),
    enCurso: (curso.data ?? []).length > 0,
    movimientos, lecturaMovimientos: movs.data ? { id: movs.data.id, terminadoEn: movs.data.terminado_en } : null,
    saldoCxc, saldoCxp,
  };
}

/**
 * Pide a Valery lo del período: sus movimientos de CxC/CxP y los saldos. No
 * repite un pedido que ya esté en camino. Owner o Administrador (lo comprueba
 * pedirAlPuente). Como mucho 400 días de una vez: un año entra.
 */
export async function actualizarReporteDesdeValery(empresa: string, desde: string, hasta: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = errorDeRango(desde, hasta);
  if (e) return { ok: false, error: e };
  const sb = await createClient();
  const { data: enCurso } = await sb.from("valery_solicitudes").select("tipo, parametros")
    .eq("empresa_id", empresa).in("tipo", ["movimientos", "cxc", "cxp"]).in("estado", ["pendiente", "en_proceso"]);
  const ya = (tipo: TipoSolicitud) => (enCurso ?? []).some((s) => {
    if (s.tipo !== tipo) return false;
    if (tipo !== "movimientos") return true;
    const p = (s.parametros as { desde?: string; hasta?: string } | null) ?? {};
    return p.desde === desde && p.hasta === hasta;
  });
  for (const [tipo, p] of [["movimientos", { desde, hasta }], ["cxc", {}], ["cxp", {}]] as const) {
    if (ya(tipo)) continue;
    const r = await pedirAlPuente(empresa, tipo, p);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true };
}
