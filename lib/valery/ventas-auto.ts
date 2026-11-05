// Ventas automáticas por el Puente Valery (docs/decisions/puente-valery.md).
//
// Cada hora (o al pulsar «Actualizar ahora» en Ventas) se le pide al agente
// las ventas de los últimos días; cuando las entrega, el servidor las aplica
// al kardex con las mismas reglas y claves que el Excel. Nadie tiene que
// pulsar «Aplicar»: lo que ya entró no se repite.
//
// Sin "use server" a propósito: estas funciones reciben el cliente de base
// (el de la sesión o el de servicio) y no deben quedar expuestas como acciones
// que el navegador pueda llamar. Las usan app/api/valery/agente (con la clave
// de servicio, después de comprobar la huella del agente) y lib/valery/ventas-db.ts
// (con la sesión de quien pulsa el botón).

import type { SupabaseClient } from "@supabase/supabase-js";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { facturasAjenas, planVentas, renglonesParaLaBase, SERIE_FAC, type NotaPrevia } from "@/lib/inventory/ventas-valery";
import { CADA_MIN_POR_DEFECTO, rangoAuto, renglonesDesdePuente, tocaActualizar, versionAlMenos, type FilaVentaPuente } from "./puente.ts";

export const restarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
export const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

/** Primer día que se puede importar (null = la empresa todavía no tiene corte). */
export async function corteDe(sb: SupabaseClient, empresa: string): Promise<string | null> {
  const { data, error } = await sb.from("cortes_inventario").select("desde").eq("empresa_id", empresa).maybeSingle();
  if (error) throw new Error(`No se pudo leer el corte: ${error.message}`);
  return (data?.desde as string | undefined) ?? null;
}

/** Las notas de entrega ya importadas desde `desde`: para reconocer la factura que las factura. */
export async function notasPreviasDe(sb: SupabaseClient, empresa: string, desde: string): Promise<NotaPrevia[]> {
  type Fila = { renglon: string; fecha: string; cliente: string | null; codigo: string; cantidad: number; monto_usd: number | null; documento: string | null; facturada_con: string | null };
  const filas = await todasLasFilas<Fila>((a, b, contar) =>
    sb.from("movimientos_inventario")
      .select("renglon, fecha, cliente, codigo, cantidad, monto_usd, documento, facturada_con", contar ? { count: "exact" } : undefined)
      .eq("empresa_id", empresa).eq("tipo_doc", "NET").gte("fecha", desde).not("renglon", "is", null)
      .order("id").range(a, b));
  return filas.map((f) => ({
    clave: f.renglon, fecha: f.fecha, cliente: f.cliente ?? "", codigo: f.codigo, cantidad: Number(f.cantidad),
    ventaUsd: Number(f.monto_usd ?? 0), documento: (f.documento ?? "").replace(/^NET\s+/, ""), facturadaCon: f.facturada_con,
  }));
}

/**
 * Si la empresa trae sus ventas sola y cada cuánto. Sin fila: encendido, cada hora.
 * `facturasRellenas` null: la migración 51 no se ha corrido (no hay dónde
 * guardar las facturas de notas).
 */
export async function ajustesVentasDe(sb: SupabaseClient, empresa: string): Promise<{ auto: boolean; cadaMin: number; horasRellenas: boolean; facturasRellenas: boolean | null; devolucionesRellenas: boolean | null }> {
  const { data } = await sb.from("valery_ajustes").select("ventas_auto, cada_min").eq("empresa_id", empresa).maybeSingle();
  // Aparte: si la migración 50 o la 51 no se han corrido, la columna no existe y no debe apagar lo demás.
  const { data: h } = await sb.from("valery_ajustes").select("horas_rellenas").eq("empresa_id", empresa).maybeSingle();
  const { data: f, error: ef } = await sb.from("valery_ajustes").select("facturas_rellenas").eq("empresa_id", empresa).maybeSingle();
  const { data: d, error: ed } = await sb.from("valery_ajustes").select("devoluciones_rellenas").eq("empresa_id", empresa).maybeSingle();
  return {
    auto: data?.ventas_auto ?? true, cadaMin: data?.cada_min ?? CADA_MIN_POR_DEFECTO, horasRellenas: h?.horas_rellenas ?? false,
    facturasRellenas: ef ? null : (f?.facturas_rellenas ?? false),
    devolucionesRellenas: ed ? null : (d?.devoluciones_rellenas ?? false),
  };
}

/**
 * La hora de cada venta llega desde el agente 1.0.4. Lo que entró antes no la
 * tiene: la primera actualización con un agente que ya la manda pide todo
 * desde el corte, una sola vez, y el importador le pone la hora a lo que ya
 * estaba (migración 50). Al aplicarla bien, `horas_rellenas` queda en true.
 */
export const VERSION_CON_HORA = "1.0.4";

/**
 * Lo mismo con lo que devuelve cada DEV (agente 1.0.5, migración 52): la
 * primera actualización con ese agente pide todo desde el corte, una vez, y el
 * importador se lo pone a las devoluciones que ya estaban.
 */
export const VERSION_CON_DEVOLUCION = "1.0.5";

export type Programacion =
  | { ok: true; id: number; desde: string; hasta: string }
  | { ok: false; motivo: "apagado" | "no_toca" | "sin_corte" | "en_curso" | "error"; mensaje: string };

/**
 * Pide al agente las ventas de los últimos días, si toca (o siempre, con
 * `forzar`: el botón). Una sola actualización automática en curso por empresa:
 * lo garantiza un índice único en la base, no esta comprobación.
 */
export async function programarVentasAuto(
  sb: SupabaseClient, empresa: string, opciones: { forzar?: boolean; usuario?: { id: string; nombre: string } } = {},
): Promise<Programacion> {
  const { forzar = false, usuario } = opciones;
  const ajustes = await ajustesVentasDe(sb, empresa);
  if (!forzar && !ajustes.auto) return { ok: false, motivo: "apagado", mensaje: "La actualización automática está apagada." };

  const { data: ultima } = await sb.from("valery_solicitudes").select("creado_en")
    .eq("empresa_id", empresa).eq("automatica", true).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!forzar && !tocaActualizar(ultima?.creado_en ?? null, ajustes.cadaMin)) return { ok: false, motivo: "no_toca", mensaje: "Todavía no toca." };

  const { data: enCurso } = await sb.from("valery_solicitudes").select("id")
    .eq("empresa_id", empresa).eq("automatica", true).in("estado", ["pendiente", "en_proceso"]).limit(1).maybeSingle();
  if (enCurso) return { ok: false, motivo: "en_curso", mensaje: "Ya se están trayendo las ventas." };

  const corte = await corteDe(sb, empresa);
  if (!corte) return { ok: false, motivo: "sin_corte", mensaje: "Esta empresa todavía no tiene corte de inventario: sus ventas no se pueden aplicar al kardex." };

  // Hasta dónde llegó la última que TRAJO algo. Una que volvió vacía no
  // cuenta: si el agente leía una base vieja (pasó el 2-nov-2026), tomarla
  // como buena dejaba fuera para siempre todo lo anterior a ese día.
  const { data: buenas } = await sb.from("valery_solicitudes").select("parametros, resumen")
    .eq("empresa_id", empresa).eq("automatica", true).eq("estado", "aplicada").order("id", { ascending: false }).limit(50);
  const buena = (buenas ?? []).find((b) => Number((b.resumen as { renglones?: number } | null)?.renglones ?? 0) > 0);
  const ultimaHasta = ((buena?.parametros as { hasta?: string } | null)?.hasta) ?? null;
  const { data: agente } = await sb.from("valery_agentes").select("version").eq("empresa_id", empresa).is("revocado_en", null).eq("en_espera", false).maybeSingle();
  const rellenarHoras = !ajustes.horasRellenas && versionAlMenos(agente?.version, VERSION_CON_HORA);
  // Las facturas de notas que pasaron antes de la migración 51 no están en
  // ninguna parte: una vez, todo desde el corte para traerlas.
  const rellenarFacturas = ajustes.facturasRellenas === false;
  const rellenarDevoluciones = ajustes.devolucionesRellenas === false && versionAlMenos(agente?.version, VERSION_CON_DEVOLUCION);
  const rango = rangoAuto(hoyCaracas(), corte, rellenarHoras || rellenarFacturas || rellenarDevoluciones ? null : ultimaHasta);

  const { data, error } = await sb.from("valery_solicitudes").insert({
    empresa_id: empresa, tipo: "ventas", automatica: true,
    parametros: {
      ...rango, ...(rellenarHoras ? { rellenarHoras: true } : {}), ...(rellenarFacturas ? { rellenarFacturas: true } : {}),
      ...(rellenarDevoluciones ? { rellenarDevoluciones: true } : {}),
    },
    creado_por: usuario?.id ?? null, creado_nombre: usuario?.nombre ?? "Automático",
  }).select("id").single();
  if (error?.code === "23505") return { ok: false, motivo: "en_curso", mensaje: "Ya se están trayendo las ventas." };
  if (error || !data) return { ok: false, motivo: "error", mensaje: `No se pudo pedir: ${error?.message}` };
  return { ok: true, id: data.id, ...rango };
}

/**
 * Aplica al kardex lo que el agente entregó para una actualización automática.
 * Corre en el servidor con la clave de servicio, justo cuando llega la última
 * parte. Si algo falla, el pedido queda en «error» con el motivo, y Ventas y el
 * panel lo muestran. Las filas crudas se borran al terminar: lo que queda es
 * el kardex y el resumen.
 */
export async function aplicarVentasAuto(admin: SupabaseClient, id: number, empresa: string): Promise<void> {
  const marcar = (campos: Record<string, unknown>) => admin.from("valery_solicitudes").update(campos).eq("id", id);
  const { data: s } = await admin.from("valery_solicitudes").select("resumen, parametros").eq("id", id).maybeSingle();
  const resumen = (s?.resumen as Record<string, unknown> | null) ?? {};
  const parametros = (s?.parametros as { rellenarHoras?: boolean; rellenarFacturas?: boolean; rellenarDevoluciones?: boolean } | null) ?? {};
  try {
    const { data: partes, error } = await admin.from("valery_resultados").select("datos").eq("solicitud_id", id).order("parte");
    if (error) throw new Error(`No se pudo leer lo que entregó el agente: ${error.message}`);
    const filas = (partes ?? []).flatMap((p) => (p.datos as FilaVentaPuente[]) ?? []);
    const { renglones, descartadas } = renglonesDesdePuente(filas);

    const ajenas = facturasAjenas(renglones, empresa);
    if (ajenas.length) {
      const otra = Object.entries(SERIE_FAC).find(([e]) => e !== empresa)?.[1].nombre ?? "la otra empresa";
      throw new Error(`El agente entregó facturas de ${otra} (${ajenas.slice(0, 3).join(", ")}). ¿Está instalado en el servidor de la otra empresa?`);
    }
    const corte = await corteDe(admin, empresa);
    if (!corte) throw new Error("Esta empresa todavía no tiene corte de inventario.");
    const fechas = renglones.map((r) => r.fecha).sort();
    const previas = fechas.length ? await notasPreviasDe(admin, empresa, restarDias(fechas[0], 60)) : [];
    const plan = planVentas(renglones, corte, previas);
    const ajustes = await ajustesVentasDe(admin, empresa);
    const conFacturas = ajustes.facturasRellenas !== null;
    const aLaBase = renglonesParaLaBase(plan, conFacturas);

    let r = { importacion_id: null as number | null, nuevos: 0, repetidos: aLaBase.length, notas_facturadas: 0, productos_creados: [] as string[] | null };
    if (aLaBase.length || plan.notasPrevias.length) {
      const { data, error: e } = await admin.rpc("importar_ventas_puente", {
        p_solicitud: id, p_renglones: aLaBase, p_notas: plan.notasPrevias,
      });
      if (e) throw new Error(e.message);
      r = (Array.isArray(data) ? data[0] : data) as typeof r;
    }
    await marcar({
      estado: "aplicada", aplicado_en: new Date().toISOString(), importacion_id: r.importacion_id,
      resumen: { ...resumen, renglones: renglones.length, nuevos: r.nuevos, repetidos: r.repetidos, facturasDeNotas: plan.facturasDeNotas, notasFacturadas: r.notas_facturadas, descartadas,
        // Los que se dieron de alta en el catálogo (migración 49), sin precio ni costo.
        productosNuevos: r.productos_creados ?? [] },
    });
    // Las horas de lo anterior ya se pusieron: no se vuelve a pedir todo desde el corte.
    if (parametros.rellenarHoras && versionAlMenos(String(resumen.agente ?? ""), VERSION_CON_HORA)) {
      await admin.from("valery_ajustes").upsert({ empresa_id: empresa, horas_rellenas: true }, { onConflict: "empresa_id" });
    }
    // Y las facturas de notas de antes, igual: una sola vez.
    if (parametros.rellenarFacturas && conFacturas) {
      await admin.from("valery_ajustes").upsert({ empresa_id: empresa, facturas_rellenas: true }, { onConflict: "empresa_id" });
    }
    // Y lo que devuelve cada DEV de antes: solo si lo entregó un agente que lo manda y la base tiene dónde guardarlo.
    if (parametros.rellenarDevoluciones && ajustes.devolucionesRellenas !== null && versionAlMenos(String(resumen.agente ?? ""), VERSION_CON_DEVOLUCION)) {
      await admin.from("valery_ajustes").upsert({ empresa_id: empresa, devoluciones_rellenas: true }, { onConflict: "empresa_id" });
    }
  } catch (e) {
    await marcar({ estado: "error", error: (e as Error).message.slice(0, 2000) });
  } finally {
    await admin.from("valery_resultados").delete().eq("solicitud_id", id);
  }
}
