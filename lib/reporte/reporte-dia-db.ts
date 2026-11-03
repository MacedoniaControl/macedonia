"use server";

// El reporte del día del Dashboard (lib/reporte/reporte-dia.ts).
//
// Todo con la sesión de quien mira, y cada parte SOLO si puede ver su
// sección (el mismo criterio que los indicadores de lib/ux/dashboard-db.ts):
// a quien no ve Gastos no se le muestra «Gastos: $0», se le omite la parte.
// Lo de Valery (movimientos y saldos de CxC/CxP) es del Owner y los
// Administradores: la base solo a ellos les da lo que trae el Puente.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, sesionPuede } from "@/lib/auth/sesion-servidor";
import { ventasDelPeriodo } from "@/lib/valery/ventas-db";
import { resumirVentas, type ResumenVentas } from "@/lib/valery/ventas";
import { agentePuente, pedirAlPuente } from "@/lib/valery/puente-db";
import { conectado, filasDeParte, versionAlMenos, type TipoSolicitud } from "@/lib/valery/puente";
import { isEmpresaId } from "@/lib/ux/empresas";
import { contar, limitesDelDia, movsDesdeAgente, type Conteo, type MovValery } from "./reporte-dia";

export type Lectura = { id: number; terminadoEn: string | null };

export type ReporteDia = {
  dia: string;
  ventas: ResumenVentas | null;
  valery: {
    /** El agente puede traer los movimientos (1.0.4 o más nuevo). */
    agenteListo: boolean;
    conectado: boolean;
    enCurso: boolean;
    movimientos: MovValery[] | null;
    lecturaMovimientos: Lectura | null;
    /** Saldo total en Valery según la última lectura de CxC / CxP (en bolívares). */
    saldoCxc: { bs: number; documentos: number; lectura: Lectura } | null;
    saldoCxp: { bs: number; documentos: number; lectura: Lectura } | null;
  } | null;
  cobrar: { nuevas: Conteo; abonos: Conteo; liquidaciones: Conteo } | null;
  pagar: { nuevas: Conteo; abonos: Conteo; liquidaciones: Conteo } | null;
  notas: Conteo | null;
  devoluciones: Conteo | null;
  cotizaciones: Conteo | null;
  cilindros: { movimientos: number; entregados: number; retornados: number } | null;
  gastos: Conteo | null;
  conteos: { n: number; cerrados: number } | null;
};

async function parte<T>(puede: boolean, leer: () => Promise<T>): Promise<T | null> {
  if (!puede) return null;
  try { return await leer(); } catch { return null; }
}

const valido = (dia: string) => /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T00:00:00Z`));

export async function reporteDelDia(empresa: string, dia: string): Promise<ReporteDia> {
  const vacio: ReporteDia = { dia, ventas: null, valery: null, cobrar: null, pagar: null, notas: null, devoluciones: null, cotizaciones: null, cilindros: null, gastos: null, conteos: null };
  const u = await getUsuarioSesion();
  if (!u || !isEmpresaId(empresa) || !valido(dia)) return vacio;
  const sb = await createClient();
  const puede = (clave: string) => sesionPuede(u, clave);
  const gerencia = u.rol === "owner" || u.rol === "admin";
  const { desde, hasta } = limitesDelDia(dia);

  const cuentasDelDia = async (tipo: "cobrar" | "pagar") => {
    const [nuevas, abonos, liq] = await Promise.all([
      sb.from("cuentas").select("monto").eq("empresa_id", empresa).eq("tipo", tipo).gte("created_at", desde).lt("created_at", hasta),
      sb.from("abonos").select("monto, cuentas!inner(tipo, empresa_id)").eq("cuentas.empresa_id", empresa).eq("cuentas.tipo", tipo).eq("fecha", dia),
      sb.from("liquidaciones").select("total").eq("empresa_id", empresa).eq("tipo", tipo).eq("fecha", dia).is("anulada_en", null),
    ]);
    const e = nuevas.error ?? abonos.error ?? liq.error;
    if (e) throw e;
    return {
      nuevas: contar((nuevas.data ?? []).map((x) => ({ usd: Number(x.monto) }))),
      abonos: contar((abonos.data ?? []).map((x) => ({ usd: Number(x.monto) }))),
      liquidaciones: contar((liq.data ?? []).map((x) => ({ usd: Number(x.total) }))),
    };
  };

  const documentosDe = async (tipo: string) => {
    const { data, error } = await sb.from("documentos").select("total_usd").eq("empresa_id", empresa).eq("tipo", tipo).eq("fecha", dia);
    if (error) throw error;
    return contar((data ?? []).map((d) => ({ usd: Number(d.total_usd ?? 0) })));
  };

  const [ventas, valery, cobrar, pagar, notas, devoluciones, cotizaciones, cilindros, gastos, conteos] = await Promise.all([
    // Las ventas del kardex solo se le leen a Owner/Administrador (RLS de la migración 48): a otro le saldría un cero falso.
    parte(puede("revenue") && gerencia, async () => resumirVentas(await ventasDelPeriodo(empresa, dia, dia), empresa)),
    parte(gerencia, () => valeryDelDia(empresa, dia)),
    parte(puede("receivables"), () => cuentasDelDia("cobrar")),
    parte(puede("payables"), () => cuentasDelDia("pagar")),
    parte(puede("delivery-notes"), () => documentosDe("nota_entrega")),
    parte(puede("delivery-notes"), () => documentosDe("devolucion")),
    parte(puede("quotes"), () => documentosDe("cotizacion")),
    parte(puede("cylinders"), async () => {
      const { data, error } = await sb.from("cilindros_mov").select("cantidad, estado_desde, estado_hacia").eq("empresa_id", empresa).eq("fecha", dia);
      if (error) throw error;
      const f = data ?? [];
      return {
        movimientos: f.length,
        entregados: f.filter((m) => m.estado_hacia === "en_cliente").reduce((a, m) => a + m.cantidad, 0),
        retornados: f.filter((m) => m.estado_desde === "en_cliente").reduce((a, m) => a + m.cantidad, 0),
      };
    }),
    parte(puede("expenses"), async () => {
      const { data, error } = await sb.from("gastos").select("monto_usd").eq("empresa_id", empresa).eq("fecha", dia);
      if (error) throw error;
      return contar((data ?? []).map((g) => ({ usd: Number(g.monto_usd) })));
    }),
    parte(puede("inventory"), async () => {
      const { data, error } = await sb.from("conteos").select("cerrado").eq("empresa_id", empresa).eq("fecha", dia);
      if (error) throw error;
      return { n: data?.length ?? 0, cerrados: (data ?? []).filter((c) => c.cerrado).length };
    }),
  ]);
  return { dia, ventas, valery, cobrar, pagar, notas, devoluciones, cotizaciones, cilindros, gastos, conteos };
}

/** Lo de Valery para ese día: sus movimientos de CxC/CxP y el saldo de la última lectura. */
async function valeryDelDia(empresa: string, dia: string): Promise<NonNullable<ReporteDia["valery"]>> {
  const sb = await createClient();
  const agente = await agentePuente(empresa);
  const cols = "id, estado, terminado_en";
  const [movs, curso, cxc, cxp] = await Promise.all([
    sb.from("valery_solicitudes").select(cols).eq("empresa_id", empresa).eq("tipo", "movimientos").eq("estado", "lista")
      .lte("parametros->>desde", dia).gte("parametros->>hasta", dia).order("id", { ascending: false }).limit(1).maybeSingle(),
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
    movs.data ? filasDe(movs.data.id).then(movsDesdeAgente) : Promise.resolve(null),
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
 * Pide a Valery lo del día: sus movimientos de CxC/CxP y los saldos. No repite
 * un pedido que ya esté en camino. Owner o Administrador (lo comprueba pedirAlPuente).
 */
export async function actualizarReporteDesdeValery(empresa: string, dia: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!valido(dia)) return { ok: false, error: "Fecha inválida." };
  const sb = await createClient();
  const { data: enCurso } = await sb.from("valery_solicitudes").select("tipo, parametros")
    .eq("empresa_id", empresa).in("tipo", ["movimientos", "cxc", "cxp"]).in("estado", ["pendiente", "en_proceso"]);
  const ya = (tipo: TipoSolicitud) => (enCurso ?? []).some((s) => s.tipo === tipo
    && (tipo !== "movimientos" || (s.parametros as { desde?: string } | null)?.desde === dia));
  for (const [tipo, p] of [["movimientos", { desde: dia, hasta: dia }], ["cxc", {}], ["cxp", {}]] as const) {
    if (ya(tipo)) continue;
    const r = await pedirAlPuente(empresa, tipo, p);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true };
}
