"use server";

// Puente Valery: lo que hace el panel de Macedonia (docs/decisions/puente-valery.md).
//
// Todo lo lee y lo pide la sesión de quien mira, así que la base (RLS de la
// migración 47) decide: el Owner y los Administradores de esa empresa. Solo
// crear o revocar el agente usa la clave de servicio, porque su tabla no tiene
// política de escritura; antes se comprueba lo mismo que comprobaría la base.

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, puedeEntrarAEmpresa } from "@/lib/auth/sesion-servidor";
import { importarVentasValery } from "@/lib/inventory/ventas-valery-db";
import { errorDeRango, renglonesDesdePuente, type EstadoSolicitud, type FilaVentaPuente, type TipoSolicitud } from "./puente.ts";

export type AgentePuente = {
  creadoEn: string;
  ultimoContacto: string | null;
  version: string | null;
  info: Record<string, unknown>;
};

export type SolicitudPuente = {
  id: number;
  tipo: TipoSolicitud;
  parametros: Record<string, unknown>;
  estado: EstadoSolicitud;
  creadoNombre: string | null;
  creadoEn: string;
  terminadoEn: string | null;
  resumen: Record<string, unknown> | null;
  error: string | null;
  aplicadoEn: string | null;
  importacionId: number | null;
};

async function gerenciaDe(empresa: string) {
  const u = await getUsuarioSesion();
  if (!u) return { error: "Sin sesión." } as const;
  if (!(u.rol === "owner" || u.rol === "admin") || !puedeEntrarAEmpresa(u, empresa)) return { error: "Solo el Owner o un Administrador de esta empresa." } as const;
  return { u } as const;
}

/** El agente vivo de la empresa, o null si no hay ninguno instalado. */
export async function agentePuente(empresa: string): Promise<AgentePuente | null> {
  const sb = await createClient();
  const { data, error } = await sb.from("valery_agentes").select("creado_en, ultimo_contacto, version, info")
    .eq("empresa_id", empresa).is("revocado_en", null).maybeSingle();
  if (error) throw new Error(`No se pudo leer el puente: ${error.message}`);
  if (!data) return null;
  return { creadoEn: data.creado_en, ultimoContacto: data.ultimo_contacto, version: data.version, info: (data.info as Record<string, unknown>) ?? {} };
}

/**
 * Crea la clave de un agente nuevo y revoca la anterior. La clave se devuelve
 * UNA vez, para meterla en el instalador; la base guarda solo su huella.
 */
export async function crearAgentePuente(empresa: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const g = await gerenciaDe(empresa);
  if ("error" in g) return { ok: false, error: g.error as string };
  const token = `mvp_${randomBytes(32).toString("base64url")}`;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const { error: e1 } = await admin.from("valery_agentes").update({ revocado_en: ahora }).eq("empresa_id", empresa).is("revocado_en", null);
  if (e1) return { ok: false, error: `No se pudo revocar el agente anterior: ${e1.message}` };
  const { error: e2 } = await admin.from("valery_agentes").insert({
    empresa_id: empresa, token_hash: createHash("sha256").update(token, "utf8").digest("hex"), creado_por: g.u.id,
  });
  if (e2) return { ok: false, error: `No se pudo crear el agente: ${e2.message}` };
  return { ok: true, token };
}

/** Desconecta el agente: su clave deja de servir en el acto. */
export async function revocarAgentePuente(empresa: string): Promise<{ ok: boolean; error?: string }> {
  const g = await gerenciaDe(empresa);
  if ("error" in g) return { ok: false, error: g.error as string };
  const { error } = await createAdminClient().from("valery_agentes").update({ revocado_en: new Date().toISOString() })
    .eq("empresa_id", empresa).is("revocado_en", null);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Le pide algo al agente. Las ventas, con su rango de fechas. */
export async function pedirAlPuente(
  empresa: string, tipo: TipoSolicitud, parametros: { desde?: string; hasta?: string } = {},
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const g = await gerenciaDe(empresa);
  if ("error" in g) return { ok: false, error: g.error as string };
  if (!["ventas", "cxc", "cxp", "existencias", "estado"].includes(tipo)) return { ok: false, error: "Pedido desconocido." };
  const p: Record<string, string> = {};
  if (tipo === "ventas") {
    const e = errorDeRango(parametros.desde ?? "", parametros.hasta ?? "");
    if (e) return { ok: false, error: e };
    p.desde = parametros.desde!; p.hasta = parametros.hasta!;
  }
  const sb = await createClient();
  const { data, error } = await sb.from("valery_solicitudes").insert({
    empresa_id: empresa, tipo, parametros: p, creado_por: g.u.id, creado_nombre: g.u.nombre,
  }).select("id").single();
  if (error || !data) return { ok: false, error: `No se pudo pedir: ${error?.message}` };
  return { ok: true, id: data.id };
}

/** Los últimos pedidos de la empresa, del más nuevo al más viejo. */
export async function solicitudesPuente(empresa: string, limite = 25): Promise<SolicitudPuente[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("valery_solicitudes")
    .select("id, tipo, parametros, estado, creado_nombre, creado_en, terminado_en, resumen, error, aplicado_en, importacion_id")
    .eq("empresa_id", empresa).order("id", { ascending: false }).limit(limite);
  if (error) throw new Error(`No se pudieron leer los pedidos: ${error.message}`);
  return (data ?? []).map((s) => ({
    id: s.id, tipo: s.tipo, parametros: (s.parametros as Record<string, unknown>) ?? {}, estado: s.estado,
    creadoNombre: s.creado_nombre, creadoEn: s.creado_en, terminadoEn: s.terminado_en,
    resumen: (s.resumen as Record<string, unknown>) ?? null, error: s.error, aplicadoEn: s.aplicado_en, importacionId: s.importacion_id,
  }));
}

/** Lo que entregó el agente para un pedido, con las partes ya unidas. */
export async function resultadoPuente(id: number): Promise<{ ok: true; tipo: TipoSolicitud; filas: Record<string, unknown>[] } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data: s } = await sb.from("valery_solicitudes").select("tipo, estado").eq("id", id).maybeSingle();
  if (!s) return { ok: false, error: "No existe ese pedido." };
  if (s.estado !== "lista" && s.estado !== "aplicada") return { ok: false, error: "Ese pedido todavía no tiene resultado." };
  const { data, error } = await sb.from("valery_resultados").select("parte, datos").eq("solicitud_id", id).order("parte");
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo: s.tipo as TipoSolicitud, filas: (data ?? []).flatMap((p) => (p.datos as Record<string, unknown>[]) ?? []) };
}

/**
 * Las ventas que trajo el agente entran al kardex con el MISMO importador que
 * los Excel: mismas reglas, mismo corte, mismas claves (un renglón ya
 * importado no se repite, venga del Excel o del puente).
 */
export async function aplicarVentasPuente(id: number): Promise<
  | { ok: true; nuevos: number; repetidos: number; facturasDeNotas: number; notasFacturadas: number; descartadas: number }
  | { ok: false; error: string }
> {
  const sb = await createClient();
  const { data: s } = await sb.from("valery_solicitudes").select("empresa_id, tipo, estado, parametros").eq("id", id).maybeSingle();
  if (!s) return { ok: false, error: "No existe ese pedido." };
  if (s.tipo !== "ventas") return { ok: false, error: "Solo las ventas se aplican al kardex." };
  if (s.estado !== "lista") return { ok: false, error: s.estado === "aplicada" ? "Ese pedido ya se aplicó." : "Ese pedido todavía no está listo." };
  const g = await gerenciaDe(s.empresa_id);
  if ("error" in g) return { ok: false, error: g.error as string };
  const r = await resultadoPuente(id);
  if (!r.ok) return r;
  const { renglones, descartadas } = renglonesDesdePuente(r.filas as unknown as FilaVentaPuente[]);
  if (!renglones.length) return { ok: false, error: "El agente no trajo renglones de venta en ese rango." };
  const p = (s.parametros as { desde?: string; hasta?: string }) ?? {};
  const imp = await importarVentasValery(s.empresa_id, `Puente Valery · pedido ${id} (${p.desde ?? "?"} a ${p.hasta ?? "?"})`, `puente-valery-${id}`, renglones);
  if (!imp.ok) return imp;
  const { error } = await sb.rpc("valery_marcar_solicitud", { p_id: id, p_estado: "aplicada", p_importacion: imp.importacionId });
  if (error) return { ok: false, error: `Las ventas entraron (importación ${imp.importacionId}), pero el pedido no quedó marcado: ${error.message}` };
  return { ok: true, nuevos: imp.nuevos, repetidos: imp.repetidos, facturasDeNotas: imp.facturasDeNotas, notasFacturadas: imp.notasFacturadas, descartadas };
}

/** Cancela un pedido que el agente todavía no tomó. */
export async function cancelarPedidoPuente(id: number): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.rpc("valery_marcar_solicitud", { p_id: id, p_estado: "cancelada" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
