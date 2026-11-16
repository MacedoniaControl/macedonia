"use server";

// Puente Valery: lo que hace el panel de Macedonia (docs/decisions/puente-valery.md).
//
// Todo lo lee y lo pide la sesión de quien mira, así que la base (RLS de la
// migración 47) decide: el Owner y los Administradores de esa empresa. Solo
// crear o revocar el agente usa la clave de servicio, porque su tabla no tiene
// política de escritura; antes se comprueba lo mismo que comprobaría la base.

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, puedeEntrarAEmpresa, sesionPuede } from "@/lib/auth/sesion-servidor";
import { importarVentasValery } from "@/lib/inventory/ventas-valery-db";
import {
  errorDeRango, filasDeParte, renglonesDesdePuente, TIPOS_CON_COSTO, TIPOS_CON_RANGO, TIPOS_SOLICITUD,
  type EstadoSolicitud, type FilaVentaPuente, type TipoSolicitud,
} from "./puente.ts";
import { mesesCompletos, mesesDesdeValery, type MesValery } from "./cierre-valery.ts";
import { mesesPorCerrar } from "@/lib/ux/historico-meses";
import { guardarMesCargado } from "@/lib/ux/historico-meses-db";
import { HISTORY } from "@/lib/ux/history-data";
import { isEmpresaId } from "@/lib/ux/empresas";

const SIN_COSTOS = "Esta lectura trae costos de Valery: la ve quien tiene el permiso «Ver costos».";

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
  // El activo: uno «en espera» (instalador generado que todavía no se conectó) no cuenta.
  const { data, error } = await sb.from("valery_agentes").select("creado_en, ultimo_contacto, version, info")
    .eq("empresa_id", empresa).is("revocado_en", null).eq("en_espera", false).maybeSingle();
  if (error) throw new Error(`No se pudo leer el puente: ${error.message}`);
  if (!data) return null;
  return { creadoEn: data.creado_en, ultimoContacto: data.ultimo_contacto, version: data.version, info: (data.info as Record<string, unknown>) ?? {} };
}

/**
 * Crea la clave de un agente nuevo. La clave se devuelve UNA vez, para meterla
 * en el instalador; la base guarda solo su huella. La anterior NO se revoca
 * aquí: la nueva nace «en espera» y el cambio lo hace el servidor cuando el
 * agente nuevo pasa su prueba y se conecta (migración 50). Si la instalación
 * falla, el agente de antes sigue funcionando. Lo que ya no sirve es un
 * instalador generado antes y sin usar: se revoca.
 */
export async function crearAgentePuente(empresa: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const g = await gerenciaDe(empresa);
  if ("error" in g) return { ok: false, error: g.error as string };
  const token = `mvp_${randomBytes(32).toString("base64url")}`;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const { error: e1 } = await admin.from("valery_agentes").update({ revocado_en: ahora })
    .eq("empresa_id", empresa).is("revocado_en", null).eq("en_espera", true);
  if (e1) return { ok: false, error: `No se pudo anular el instalador anterior: ${e1.message}` };
  const { error: e2 } = await admin.from("valery_agentes").insert({
    empresa_id: empresa, token_hash: createHash("sha256").update(token, "utf8").digest("hex"), creado_por: g.u.id, en_espera: true,
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
  if (!TIPOS_SOLICITUD.includes(tipo)) return { ok: false, error: "Pedido desconocido." };
  if (TIPOS_CON_COSTO.includes(tipo) && !sesionPuede(g.u, "ver_costos")) return { ok: false, error: SIN_COSTOS };
  const p: Record<string, string> = {};
  if (TIPOS_CON_RANGO.includes(tipo)) {
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
    // Las actualizaciones automáticas de ventas se ven en Ventas, no aquí: serían 24 al día.
    .eq("empresa_id", empresa).eq("automatica", false).order("id", { ascending: false }).limit(limite);
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
  // La base ya no se los da (migración 57); se dice por qué en vez de mostrar una lista vacía.
  if (TIPOS_CON_COSTO.includes(s.tipo as TipoSolicitud)) {
    const u = await getUsuarioSesion();
    if (!u || !sesionPuede(u, "ver_costos")) return { ok: false, error: SIN_COSTOS };
  }
  const { data, error } = await sb.from("valery_resultados").select("parte, datos").eq("solicitud_id", id).order("parte");
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo: s.tipo as TipoSolicitud, filas: (data ?? []).flatMap((p) => (p.datos as Record<string, unknown>[]) ?? []) };
}

export type CarteraDeValery = {
  agente: AgentePuente | null;
  /** El último pedido de esta cartera, en el estado que esté (para saber si hay uno en camino). */
  ultimo: SolicitudPuente | null;
  /** La última lectura que llegó: sus filas y cuándo se copió la base. */
  lectura: { id: number; terminadoEn: string | null; copiaEn: string | null; filas: unknown[] } | null;
};

/**
 * Las cuentas por cobrar o por pagar tal como están en Valery, según la última
 * lectura del agente. Con la sesión de quien mira: la base solo se las da al
 * Owner y a los Administradores de esa empresa (RLS de la migración 47).
 */
export async function carteraDeValery(empresa: string, tipo: "cxc" | "cxp"): Promise<CarteraDeValery> {
  const sb = await createClient();
  const columnas = "id, tipo, parametros, estado, creado_nombre, creado_en, terminado_en, resumen, error, aplicado_en, importacion_id";
  const [agente, { data: ultimos, error }] = await Promise.all([
    agentePuente(empresa),
    sb.from("valery_solicitudes").select(columnas).eq("empresa_id", empresa).eq("tipo", tipo).order("id", { ascending: false }).limit(20),
  ]);
  if (error) throw new Error(`No se pudieron leer los pedidos: ${error.message}`);
  const aSolicitud = (s: NonNullable<typeof ultimos>[number]): SolicitudPuente => ({
    id: s.id, tipo: s.tipo, parametros: (s.parametros as Record<string, unknown>) ?? {}, estado: s.estado,
    creadoNombre: s.creado_nombre, creadoEn: s.creado_en, terminadoEn: s.terminado_en,
    resumen: (s.resumen as Record<string, unknown>) ?? null, error: s.error, aplicadoEn: s.aplicado_en, importacionId: s.importacion_id,
  });
  const ultimo = ultimos?.[0] ? aSolicitud(ultimos[0]) : null;
  const buena = (ultimos ?? []).find((s) => s.estado === "lista");
  if (!buena) return { agente, ultimo, lectura: null };
  const { data: partes, error: e } = await sb.from("valery_resultados").select("parte, datos").eq("solicitud_id", buena.id).order("parte");
  if (e) throw new Error(`No se pudo leer lo que entregó el agente: ${e.message}`);
  const resumen = (buena.resumen as Record<string, unknown> | null) ?? {};
  return {
    agente, ultimo,
    lectura: {
      id: buena.id, terminadoEn: buena.terminado_en, copiaEn: typeof resumen.copiaEn === "string" ? resumen.copiaEn : null,
      // filasDeParte: el agente 1.0.1 entregaba una parte de una sola fila como objeto suelto.
      filas: (partes ?? []).flatMap((p) => filasDeParte(p.datos) ?? []),
    },
  };
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

/**
 * Cierra meses del histórico con lo que trajo un pedido «cierre» (agente
 * 1.0.8): ventas y costo de cada renglón, y compras, en los dólares de Valery
 * (lib/valery/cierre-valery.ts). Solo los meses que el pedido cubre enteros y
 * que todavía se pueden cerrar: terminados y posteriores al último mes del
 * histórico de Valery. Un mes ya cerrado se corrige con lo nuevo.
 */
export async function cerrarMesesDesdeValery(id: number): Promise<
  { ok: true; cerrados: MesValery[]; fuera: string[] } | { ok: false; error: string }
> {
  const sb = await createClient();
  const { data: s } = await sb.from("valery_solicitudes").select("empresa_id, tipo, estado, parametros").eq("id", id).maybeSingle();
  if (!s) return { ok: false, error: "No existe ese pedido." };
  if (s.tipo !== "cierre") return { ok: false, error: "Solo un pedido «Cierre de mes» cierra meses." };
  const g = await gerenciaDe(s.empresa_id);
  if ("error" in g) return { ok: false, error: g.error as string };
  if (!isEmpresaId(s.empresa_id)) return { ok: false, error: "Empresa desconocida." };
  const r = await resultadoPuente(id);
  if (!r.ok) return r;
  const p = (s.parametros as { desde?: string; hasta?: string }) ?? {};
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  const cerrables = new Set(mesesPorCerrar(HISTORY[s.empresa_id].meta.hasta, hoy));
  const enteros = mesesCompletos(p.desde ?? "", p.hasta ?? "");
  const meses = mesesDesdeValery(r.filas, s.empresa_id).filter((m) => enteros.includes(m.ym));
  const cerrados: MesValery[] = [], fuera: string[] = [];
  for (const m of meses) {
    if (!cerrables.has(m.ym)) { fuera.push(m.ym); continue; }
    const nota = `Leído de Valery por el Puente (pedido ${id}): ${m.renglones} renglones de venta con su costo y ${m.compras} compras, en los dólares de Valery.`
      + (m.facturasDeNotas ? ` Facturas de notas ya contadas: $${m.facturasDeNotas.toLocaleString("es-VE")}.` : "")
      + (m.sinMonto ? ` ${m.sinMonto} fila(s) sin monto en dólares no se contaron.` : "");
    const g2 = await guardarMesCargado({
      empresa: s.empresa_id, ym: m.ym, venta: m.venta, costo: m.costo, compra: Math.max(0, m.compra),
      ventaBs: m.ventaBs, costoBs: m.costoBs, compraBs: Math.max(0, m.compraBs), nota,
    });
    if (!g2.ok) return { ok: false, error: `${m.ym}: ${g2.error}` };
    cerrados.push(m);
  }
  if (cerrados.length && s.estado === "lista") await sb.rpc("valery_marcar_solicitud", { p_id: id, p_estado: "aplicada" });
  return { ok: true, cerrados, fuera };
}
