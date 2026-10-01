"use server";

// Importar las ventas de Valery al kardex (la parte que toca la base).
//
// La pantalla lee el archivo y manda los renglones desde 60 días antes del
// corte (los anteriores solo sirven para reconocer facturas de notas viejas).
// Aquí se buscan las notas ya importadas, se decide qué entra (planVentas) y
// la base lo guarda en una transacción (importar_ventas_valery, migración 32),
// que vuelve a comprobar permisos, corte, catálogo y repetidos.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { facturasAjenas, planVentas, SERIE_FAC, type NotaPrevia, type RenglonVenta } from "./ventas-valery";

/** Primer día que se puede importar (null = la empresa todavía no tiene corte). */
export async function corteVentas(empresa: string): Promise<string | null> {
  const sb = await createClient();
  const { data, error } = await sb.from("cortes_inventario").select("desde").eq("empresa_id", empresa).maybeSingle();
  if (error) throw new Error(`No se pudo leer el corte: ${error.message}`);
  return (data?.desde as string | undefined) ?? null;
}

const restarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

async function notasPrevias(empresa: string, desde: string): Promise<NotaPrevia[]> {
  const sb = await createClient();
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

export type ResultadoImportacion =
  | { ok: true; importacionId: number; nuevos: number; repetidos: number; facturasDeNotas: number; notasFacturadas: number; desde: string | null; hasta: string | null }
  | { ok: false; error: string };

export async function importarVentasValery(
  empresa: string, archivo: string, hash: string, renglones: RenglonVenta[],
): Promise<ResultadoImportacion> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  try {
    const corte = await corteVentas(empresa);
    if (!corte) return { ok: false, error: "Todavía no se pueden importar ventas de esta empresa: primero hay que alinear su existencia con Valery." };
    const ajenas = facturasAjenas(renglones, empresa);
    if (ajenas.length) {
      const otra = Object.entries(SERIE_FAC).find(([e]) => e !== empresa)?.[1].nombre ?? "la otra empresa";
      return { ok: false, error: `Este archivo trae facturas de ${otra} (${ajenas.slice(0, 3).join(", ")}). Impórtalo en su empresa.` };
    }
    const fechas = renglones.map((r) => r.fecha).sort();
    const previas = fechas.length ? await notasPrevias(empresa, restarDias(fechas[0], 60)) : [];
    const plan = planVentas(renglones, corte, previas);
    if (!plan.movimientos.length && !plan.notasPrevias.length) {
      return { ok: false, error: `No hay ventas desde el ${corte.split("-").reverse().join("-")} (el corte): lo anterior ya está en la existencia.` };
    }
    const sb = await createClient();
    const { data, error } = await sb.rpc("importar_ventas_valery", {
      p_empresa: empresa, p_archivo: archivo, p_hash: hash,
      p_renglones: plan.movimientos.map((m) => ({
        renglon: m.renglon, fecha: m.fecha, direccion: m.direccion, tipo: m.tipo, documento: m.documento, cliente: m.cliente,
        codigo: m.codigo, nombre: m.nombre, cantidad: m.cantidad, monto_usd: m.montoUsd, facturada_con: m.facturadaCon,
      })),
      p_notas: plan.notasPrevias,
    });
    if (error) return { ok: false, error: error.message };
    const r = (Array.isArray(data) ? data[0] : data) as { importacion_id: number; nuevos: number; repetidos: number; notas_facturadas: number };
    return {
      ok: true, importacionId: r.importacion_id, nuevos: r.nuevos, repetidos: r.repetidos,
      facturasDeNotas: plan.facturasDeNotas, notasFacturadas: r.notas_facturadas, desde: plan.desde, hasta: plan.hasta,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type ImportacionVentas = {
  id: number; archivo: string; filas: number; desde: string | null; hasta: string | null; creada: string;
  /** Hecha desde la pantalla (sus renglones traen clave): se puede deshacer. Las cargas viejas por script, no. */
  deshacible: boolean;
};

/** Las últimas importaciones de ventas de la empresa. */
export async function importacionesVentas(empresa: string, limite = 10): Promise<ImportacionVentas[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("importaciones")
    .select("id, archivo, filas, periodo_desde, periodo_hasta, created_at")
    .eq("empresa_id", empresa).eq("tipo", "ventas").order("id", { ascending: false }).limit(limite);
  if (error) throw new Error(`No se pudieron leer las importaciones: ${error.message}`);
  const filas = data ?? [];
  const deshacibles = await Promise.all(filas.map(async (i) => {
    const { count } = await sb.from("movimientos_inventario").select("id", { count: "exact", head: true })
      .eq("importacion_id", i.id).not("renglon", "is", null).limit(1);
    return (count ?? 0) > 0;
  }));
  return filas.map((i, k) => ({
    id: i.id, archivo: i.archivo, filas: i.filas, desde: i.periodo_desde, hasta: i.periodo_hasta, creada: i.created_at, deshacible: deshacibles[k],
  }));
}

/** Deshace una importación hecha desde la pantalla: sus movimientos se borran con ella. */
export async function deshacerImportacionVentas(id: number): Promise<{ ok: true; movimientos: number } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("deshacer_importacion_ventas", { p_id: id });
  return error ? { ok: false, error: error.message } : { ok: true, movimientos: Number(data) || 0 };
}
