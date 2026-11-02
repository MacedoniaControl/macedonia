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
import { corteDe, notasPreviasDe, restarDias } from "@/lib/valery/ventas-auto";
import { facturasAjenas, paraLaBase, planVentas, SERIE_FAC, type RenglonVenta } from "./ventas-valery";

/** Primer día que se puede importar (null = la empresa todavía no tiene corte). */
export async function corteVentas(empresa: string): Promise<string | null> {
  return corteDe(await createClient(), empresa);
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
    const sb = await createClient();
    const previas = fechas.length ? await notasPreviasDe(sb, empresa, restarDias(fechas[0], 60)) : [];
    const plan = planVentas(renglones, corte, previas);
    if (!plan.movimientos.length && !plan.notasPrevias.length) {
      return { ok: false, error: `No hay ventas desde el ${corte.split("-").reverse().join("-")} (el corte): lo anterior ya está en la existencia.` };
    }
    const { data, error } = await sb.rpc("importar_ventas_valery", {
      p_empresa: empresa, p_archivo: archivo, p_hash: hash,
      p_renglones: plan.movimientos.map(paraLaBase),
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
