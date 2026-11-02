"use server";

// Ventas (app/admin/revenue): lo que se lee y lo que se pide desde la pantalla.
//
// Todo con la sesión de quien mira: la base decide (RLS, migración 48). Las
// ventas son las del kardex —entran por el Puente Valery cada hora o por el
// Excel—, así que el apartado y el inventario nunca cuentan cosas distintas.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, puedeEntrarAEmpresa } from "@/lib/auth/sesion-servidor";
import { todasLasFilas } from "@/lib/supabase/paginar";
import type { TipoDoc } from "@/lib/inventory/ventas-valery";
import { ajustesVentasDe, corteDe, programarVentasAuto } from "./ventas-auto";
import type { EstadoSolicitud } from "./puente.ts";
import type { MovVenta } from "./ventas.ts";

/** Los renglones de venta del kardex entre dos fechas (inclusive). */
export async function ventasDelPeriodo(empresa: string, desde: string, hasta: string): Promise<MovVenta[]> {
  const sb = await createClient();
  type Fila = { fecha: string; tipo_doc: TipoDoc; documento: string | null; cliente: string | null; codigo: string; nombre: string; cantidad: number; monto_usd: number | null };
  const filas = await todasLasFilas<Fila>((a, b, contar) =>
    sb.from("movimientos_inventario")
      .select("fecha, tipo_doc, documento, cliente, codigo, nombre, cantidad, monto_usd", contar ? { count: "exact" } : undefined)
      .eq("empresa_id", empresa).eq("origen", "venta").in("tipo_doc", ["FAC", "NET", "DEV"])
      .gte("fecha", desde).lte("fecha", hasta)
      .order("id").range(a, b));
  return filas.map((f) => ({
    fecha: f.fecha, tipo: f.tipo_doc, documento: f.documento ?? "", cliente: f.cliente ?? "", codigo: f.codigo, nombre: f.nombre,
    cantidad: Number(f.cantidad), montoUsd: f.monto_usd === null ? null : Number(f.monto_usd),
  }));
}

export type Actualizacion = {
  id: number;
  estado: EstadoSolicitud;
  creadoEn: string;
  creadoNombre: string | null;
  terminadoEn: string | null;
  aplicadoEn: string | null;
  desde: string | null;
  hasta: string | null;
  nuevos: number | null;
  /** Cuántos renglones entregó Valery para el rango (repetidos incluidos). */
  renglones: number | null;
  error: string | null;
};

export type EstadoVentas = {
  /** Owner o Administrador: puede actualizar y encender o apagar lo automático. */
  gerencia: boolean;
  corte: string | null;
  auto: boolean;
  cadaMin: number;
  /** `ultimaVentaBase`: la última venta en la copia que leyó el agente (la informa desde la 1.0.1). */
  agente: { ultimoContacto: string | null; base: string | null; ultimaVentaBase: string | null } | null;
  /** La última actualización automática (en curso, buena o con error). */
  ultima: Actualizacion | null;
  /** La última que entró bien: hasta dónde están las ventas. */
  ultimaBuena: Actualizacion | null;
};

type FilaSolicitud = {
  id: number; estado: EstadoSolicitud; creado_en: string; creado_nombre: string | null; terminado_en: string | null;
  aplicado_en: string | null; parametros: { desde?: string; hasta?: string } | null; resumen: { nuevos?: number; renglones?: number } | null; error: string | null;
};
const COLS = "id, estado, creado_en, creado_nombre, terminado_en, aplicado_en, parametros, resumen, error";
const actualizacion = (s: FilaSolicitud | null): Actualizacion | null => s && ({
  id: s.id, estado: s.estado, creadoEn: s.creado_en, creadoNombre: s.creado_nombre, terminadoEn: s.terminado_en, aplicadoEn: s.aplicado_en,
  desde: s.parametros?.desde ?? null, hasta: s.parametros?.hasta ?? null,
  nuevos: typeof s.resumen?.nuevos === "number" ? s.resumen.nuevos : null,
  renglones: typeof s.resumen?.renglones === "number" ? s.resumen.renglones : null, error: s.error,
});

export async function estadoVentas(empresa: string): Promise<EstadoVentas> {
  const u = await getUsuarioSesion();
  const gerencia = !!u && (u.rol === "owner" || u.rol === "admin") && puedeEntrarAEmpresa(u, empresa);
  const sb = await createClient();
  const [corte, ajustes, agente, ultima, buena] = await Promise.all([
    corteDe(sb, empresa),
    ajustesVentasDe(sb, empresa),
    sb.from("valery_agentes").select("ultimo_contacto, info").eq("empresa_id", empresa).is("revocado_en", null).maybeSingle(),
    sb.from("valery_solicitudes").select(COLS).eq("empresa_id", empresa).eq("automatica", true).order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("valery_solicitudes").select(COLS).eq("empresa_id", empresa).eq("automatica", true).eq("estado", "aplicada").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    gerencia, corte, auto: ajustes.auto, cadaMin: ajustes.cadaMin,
    agente: agente.data ? {
      ultimoContacto: agente.data.ultimo_contacto,
      base: ((agente.data.info as Record<string, unknown> | null)?.base as string | undefined) ?? null,
      ultimaVentaBase: ((agente.data.info as Record<string, unknown> | null)?.ultimaVenta as string | undefined) ?? null,
    } : null,
    ultima: actualizacion(ultima.data as FilaSolicitud | null),
    ultimaBuena: actualizacion(buena.data as FilaSolicitud | null),
  };
}

async function gerenciaDe(empresa: string) {
  const u = await getUsuarioSesion();
  if (!u) return { error: "Sin sesión." } as const;
  if (!(u.rol === "owner" || u.rol === "admin") || !puedeEntrarAEmpresa(u, empresa)) return { error: "Solo el Owner o un Administrador de esta empresa." } as const;
  return { u } as const;
}

/** «Actualizar ahora»: le pide al agente las ventas de los últimos días, sin esperar la hora. */
export async function actualizarVentasAhora(empresa: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gerenciaDe(empresa);
  if ("error" in g) return { ok: false, error: g.error as string };
  const r = await programarVentasAuto(await createClient(), empresa, { forzar: true, usuario: { id: g.u.id, nombre: g.u.nombre } });
  return r.ok ? { ok: true } : { ok: false, error: r.mensaje };
}

/** Enciende o apaga la actualización automática de la empresa. */
export async function cambiarVentasAuto(empresa: string, auto: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gerenciaDe(empresa);
  if ("error" in g) return { ok: false, error: g.error as string };
  const sb = await createClient();
  const { error } = await sb.from("valery_ajustes").upsert({
    empresa_id: empresa, ventas_auto: auto, actualizado_por: g.u.id, actualizado_en: new Date().toISOString(),
  });
  return error ? { ok: false, error: `No se pudo guardar: ${error.message}` } : { ok: true };
}
