"use server";

// Ventas (app/admin/revenue): lo que se lee y lo que se pide desde la pantalla.
//
// Todo con la sesión de quien mira: la base decide (RLS, migración 48). Las
// ventas son las del kardex —entran por el Puente Valery cada hora o por el
// Excel—, así que el apartado y el inventario nunca cuentan cosas distintas.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, puedeEntrarAEmpresa, sesionPuede } from "@/lib/auth/sesion-servidor";
import { todasLasFilas } from "@/lib/supabase/paginar";
import type { TipoDoc } from "@/lib/inventory/ventas-valery";
import { ajustesVentasDe, corteDe, programarVentasAuto } from "./ventas-auto";
import type { EstadoSolicitud } from "./puente.ts";
import { estadoDevoluciones, marcarDevoluciones, marcarNotas, type MovVenta, type RenglonDevuelto, type RenglonVendido } from "./ventas.ts";

/**
 * Los renglones de venta entre dos fechas (inclusive): los del kardex y las
 * facturas que cobran notas (ventas_facturas_notas, migración 51), con cada
 * nota marcada (lib/valery/ventas.ts → marcarNotas) y cada devolución con lo
 * que devuelve (marcarDevoluciones).
 */
export async function ventasDelPeriodo(empresa: string, desde: string, hasta: string): Promise<MovVenta[]> {
  const sb = await createClient();
  type Fila = { fecha: string; hora: string | null; tipo_doc: TipoDoc; documento: string | null; cliente: string | null; codigo: string; nombre: string; cantidad: number; monto_usd: number | null; facturada_con: string | null };
  type FilaFac = { fecha: string; hora: string | null; documento: string; cliente: string | null; codigo: string; nombre: string; cantidad: number; monto_usd: number | null };
  const [filas, deNotas, enCxc] = await Promise.all([
    todasLasFilas<Fila>((a, b, contar) =>
      sb.from("movimientos_inventario")
        .select("fecha, hora, tipo_doc, documento, cliente, codigo, nombre, cantidad, monto_usd, facturada_con", contar ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).eq("origen", "venta").in("tipo_doc", ["FAC", "NET", "DEV"])
        .gte("fecha", desde).lte("fecha", hasta)
        .order("id").range(a, b)),
    // Sin la migración 51 la tabla no existe: no hay facturas de notas que sumar.
    todasLasFilas<FilaFac>((a, b, contar) =>
      sb.from("ventas_facturas_notas")
        .select("fecha, hora, documento, cliente, codigo, nombre, cantidad, monto_usd", contar ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).gte("fecha", desde).lte("fecha", hasta)
        .order("id").range(a, b)).catch(() => [] as FilaFac[]),
    notasEnCxc(sb, empresa),
  ]);
  const movs: MovVenta[] = [
    ...filas.map((f) => ({
      fecha: f.fecha, hora: f.hora, tipo: f.tipo_doc, documento: f.documento ?? "", cliente: f.cliente ?? "", codigo: f.codigo, nombre: f.nombre,
      cantidad: Number(f.cantidad), montoUsd: f.monto_usd === null ? null : Number(f.monto_usd), facturadaCon: f.facturada_con,
    })),
    ...deNotas.map((f) => ({
      fecha: f.fecha, hora: f.hora, tipo: "FAC" as const, documento: f.documento, cliente: f.cliente ?? "", codigo: f.codigo, nombre: f.nombre,
      cantidad: Number(f.cantidad), montoUsd: f.monto_usd === null ? null : Number(f.monto_usd), deNotas: true,
    })),
  ];
  const [facturas, notasDe, dev] = await Promise.all([
    facturasRegistradas(sb, empresa, movs), notasDeFacturas(sb, empresa, deNotas.map((f) => f.documento)), devolucionesDe(sb, empresa, movs),
  ]);
  return marcarDevoluciones(marcarNotas(movs, facturas, enCxc, notasDe), dev.devuelveDe, dev.estado);
}

/**
 * Las devoluciones de lo que se ve, de cualquier fecha: qué devuelve cada DEV
 * del período, y qué DEV devolvieron cada nota o factura (las del período y
 * las que nombran sus DEV, para saber si se devolvieron toda o en parte).
 * Sin la migración 52 no hay columna «devuelve»: ninguna marca.
 */
async function devolucionesDe(sb: Sb, empresa: string, movs: MovVenta[]) {
  const vacio = { devuelveDe: new Map<string, string[]>(), estado: new Map() as ReturnType<typeof estadoDevoluciones> };
  const devsDelPeriodo = [...new Set(movs.filter((m) => m.tipo === "DEV").map((m) => m.documento))];
  const devuelveDe = new Map<string, string[]>();
  try {
    for (let i = 0; i < devsDelPeriodo.length; i += 100) {
      const filas = await todasLasFilas<{ documento: string; devuelve: string }>((a, b, contar) =>
        sb.from("movimientos_inventario").select("documento, devuelve", contar ? { count: "exact" } : undefined)
          .eq("empresa_id", empresa).eq("tipo_doc", "DEV").in("documento", devsDelPeriodo.slice(i, i + 100)).not("devuelve", "is", null)
          .order("id").range(a, b));
      for (const f of filas) devuelveDe.set(f.documento, [...(devuelveDe.get(f.documento) ?? []), f.devuelve]);
    }
    const vendidas = [...new Set([...movs.filter((m) => m.tipo !== "DEV").map((m) => m.documento), ...[...devuelveDe.values()].flat()])];
    const enPeriodo = new Set(movs.map((m) => m.documento));
    const devueltos: RenglonDevuelto[] = [];
    const vendidos: RenglonVendido[] = [];
    for (let i = 0; i < vendidas.length; i += 100) {
      const lote = vendidas.slice(i, i + 100);
      const fuera = lote.filter((x) => !enPeriodo.has(x));
      const [d, v] = await Promise.all([
        todasLasFilas<RenglonDevuelto>((a, b, contar) =>
          sb.from("movimientos_inventario").select("documento, devuelve, codigo, cantidad", contar ? { count: "exact" } : undefined)
            .eq("empresa_id", empresa).eq("tipo_doc", "DEV").in("devuelve", lote).order("id").range(a, b)),
        // Lo vendido de las nombradas que no están en el período (las del período ya están en `movs`).
        fuera.length ? todasLasFilas<RenglonVendido>((a, b, contar) =>
          sb.from("movimientos_inventario").select("documento, codigo, cantidad", contar ? { count: "exact" } : undefined)
            .eq("empresa_id", empresa).in("tipo_doc", ["NET", "FAC"]).in("documento", fuera)
            .order("id").range(a, b)) : Promise.resolve([] as RenglonVendido[]),
      ]);
      devueltos.push(...d.map((r) => ({ ...r, cantidad: Number(r.cantidad) })));
      vendidos.push(...v.map((r) => ({ ...r, cantidad: Number(r.cantidad) })));
    }
    for (const m of movs) if (m.tipo !== "DEV") vendidos.push({ documento: m.documento, codigo: m.codigo, cantidad: m.cantidad });
    return { devuelveDe, estado: estadoDevoluciones(vendidos, devueltos) };
  } catch {
    return vacio;
  }
}

/** Qué notas cobró cada factura de notas («FAC …» → sus «NET …»), de cualquier fecha. */
async function notasDeFacturas(sb: Sb, empresa: string, facturas: string[]): Promise<Map<string, string[]>> {
  const buscadas = [...new Set(facturas)];
  const de = new Map<string, string[]>();
  for (let i = 0; i < buscadas.length; i += 100) {
    const filas = await todasLasFilas<{ documento: string | null; facturada_con: string }>((a, b, contar) =>
      sb.from("movimientos_inventario").select("documento, facturada_con", contar ? { count: "exact" } : undefined)
        .eq("empresa_id", empresa).eq("tipo_doc", "NET").in("facturada_con", buscadas.slice(i, i + 100))
        .order("id").range(a, b)).catch(() => []);
    for (const f of filas) if (f.documento) de.set(f.facturada_con, [...(de.get(f.facturada_con) ?? []), f.documento]);
  }
  return de;
}

type Sb = Awaited<ReturnType<typeof createClient>>;

/** De las facturas que cobraron las notas del período, las que están registradas (pueden ser de otro período). */
async function facturasRegistradas(sb: Sb, empresa: string, movs: MovVenta[]): Promise<Set<string>> {
  const buscadas = [...new Set(movs.map((m) => m.facturadaCon).filter((f): f is string => !!f))];
  const hay = new Set<string>();
  for (let i = 0; i < buscadas.length; i += 100) {
    const { data, error } = await sb.from("ventas_facturas_notas").select("documento")
      .eq("empresa_id", empresa).in("documento", buscadas.slice(i, i + 100));
    if (error) return new Set();
    for (const f of data ?? []) hay.add(f.documento as string);
  }
  return hay;
}

/** Número de cada nota de entrega en Cuentas por Cobrar → si ya se cobró. Sin la migración 51: ninguna. */
async function notasEnCxc(sb: Sb, empresa: string): Promise<Map<string, boolean>> {
  const { data, error } = await sb.rpc("ventas_notas_en_cxc", { p_empresa: empresa });
  if (error) return new Map();
  return new Map(((data ?? []) as { numero: string; cobrada: boolean }[]).map((n) => [n.numero, n.cobrada]));
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
  /** Productos que esta actualización dio de alta en el catálogo (sin precio ni costo). */
  productosNuevos: string[];
  error: string | null;
};

export type EstadoVentas = {
  /** Owner o Administrador: puede actualizar y encender o apagar lo automático. */
  gerencia: boolean;
  /** Puede pasar una nota de entrega a Cuentas por Cobrar (permiso de la cartera). */
  puedeCxc: boolean;
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
  aplicado_en: string | null; parametros: { desde?: string; hasta?: string } | null; resumen: { nuevos?: number; renglones?: number; productosNuevos?: string[] } | null; error: string | null;
};
const COLS = "id, estado, creado_en, creado_nombre, terminado_en, aplicado_en, parametros, resumen, error";
const actualizacion = (s: FilaSolicitud | null): Actualizacion | null => s && ({
  id: s.id, estado: s.estado, creadoEn: s.creado_en, creadoNombre: s.creado_nombre, terminadoEn: s.terminado_en, aplicadoEn: s.aplicado_en,
  desde: s.parametros?.desde ?? null, hasta: s.parametros?.hasta ?? null,
  nuevos: typeof s.resumen?.nuevos === "number" ? s.resumen.nuevos : null,
  renglones: typeof s.resumen?.renglones === "number" ? s.resumen.renglones : null,
  productosNuevos: Array.isArray(s.resumen?.productosNuevos) ? s.resumen.productosNuevos : [], error: s.error,
});

export async function estadoVentas(empresa: string): Promise<EstadoVentas> {
  const u = await getUsuarioSesion();
  const gerencia = !!u && (u.rol === "owner" || u.rol === "admin") && puedeEntrarAEmpresa(u, empresa);
  const puedeCxc = !!u && puedeEntrarAEmpresa(u, empresa) && sesionPuede(u, "receivables");
  const sb = await createClient();
  const [corte, ajustes, agente, ultima, buena] = await Promise.all([
    corteDe(sb, empresa),
    ajustesVentasDe(sb, empresa),
    sb.from("valery_agentes").select("ultimo_contacto, info").eq("empresa_id", empresa).is("revocado_en", null).eq("en_espera", false).maybeSingle(),
    sb.from("valery_solicitudes").select(COLS).eq("empresa_id", empresa).eq("automatica", true).order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("valery_solicitudes").select(COLS).eq("empresa_id", empresa).eq("automatica", true).eq("estado", "aplicada").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    gerencia, puedeCxc, corte, auto: ajustes.auto, cadaMin: ajustes.cadaMin,
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
