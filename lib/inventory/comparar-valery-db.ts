"use server";

// Inventario contra Valery: lo que se lee de la base (lib/inventory/comparar-valery.ts
// tiene las cuentas). Solo Owner y Administrador, como todo lo que viene del
// Puente Valery; la base lo vuelve a comprobar (RLS).

import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { getUsuarioSesion, puedeEntrarAEmpresa } from "@/lib/auth/sesion-servidor";
import { compararConValery, type Comparacion, type ExistenciaValery } from "./comparar-valery.ts";

/** El último pedido de existencias, para saber si sigue en camino o falló. */
export type UltimoPedido = { id: number; estado: string; error: string | null } | null;

export type LecturaComparacion =
  | { ok: true; solicitud: number; leidoEn: string | null; corte: string | null; comparacion: Comparacion; ultimo: UltimoPedido }
  | { ok: true; solicitud: null; ultimo: UltimoPedido }
  | { ok: false; error: string };

async function gerencia(empresa: string) {
  const u = await getUsuarioSesion();
  if (!u) return "Sin sesión.";
  if (!(u.rol === "owner" || u.rol === "admin") || !puedeEntrarAEmpresa(u, empresa)) return "Solo el Owner o un Administrador de esta empresa.";
  return null;
}

/**
 * La última lectura de existencias de Valery comparada con el kardex de hoy.
 * Sin lectura todavía: `solicitud` null (y si hay una pedida, `enCamino`).
 */
export async function compararInventarioValery(empresa: string): Promise<LecturaComparacion> {
  const no = await gerencia(empresa);
  if (no) return { ok: false, error: no };
  const sb = await createClient();

  const { data: ultimas, error: es } = await sb.from("valery_solicitudes").select("id, estado, terminado_en, error")
    .eq("empresa_id", empresa).eq("tipo", "existencias").order("id", { ascending: false }).limit(5);
  if (es) return { ok: false, error: `No se pudieron leer los pedidos: ${es.message}` };
  const u = ultimas?.[0];
  const ultimo: UltimoPedido = u ? { id: u.id, estado: u.estado, error: u.error } : null;
  const lista = (ultimas ?? []).find((s) => s.estado === "lista" || s.estado === "aplicada");
  if (!lista) return { ok: true, solicitud: null, ultimo };

  try {
    const { data: corte } = await sb.from("cortes_inventario").select("desde").eq("empresa_id", empresa).maybeSingle();
    const desde = (corte?.desde as string | undefined) ?? null;
    const todo = <T,>(armar: (a: number, b: number, contar: boolean) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>) => todasLasFilas<T>(armar);
    const [partes, macedonia, productos, ajustes] = await Promise.all([
      todo<{ parte: number; datos: ExistenciaValery[] }>((a, b, contar) =>
        sb.from("valery_resultados").select("parte, datos", contar ? { count: "exact" } : undefined).eq("solicitud_id", lista.id).order("parte").range(a, b)),
      todo<{ codigo: string; existencia: number }>((a, b, contar) =>
        sb.from("existencias").select("codigo, existencia", contar ? { count: "exact" } : undefined).eq("empresa_id", empresa).order("codigo").range(a, b)),
      todo<{ codigo: string; nombre: string }>((a, b, contar) =>
        sb.from("productos").select("codigo, nombre", contar ? { count: "exact" } : undefined).eq("empresa_id", empresa).order("codigo").range(a, b)),
      // Lo que Macedonia movió por su cuenta desde el corte: los conteos (ajustes «manual»).
      desde
        ? todo<{ codigo: string; direccion: "entrada" | "salida"; cantidad: number }>((a, b, contar) =>
          sb.from("movimientos_inventario").select("codigo, direccion, cantidad", contar ? { count: "exact" } : undefined)
            .eq("empresa_id", empresa).eq("origen", "manual").gte("fecha", desde).order("id").range(a, b))
        : Promise.resolve([]),
    ]);
    const valery = partes.flatMap((p) => p.datos ?? []).map((f) => ({ codigo: String(f.codigo ?? "").trim(), nombre: f.nombre, existencia: Number(f.existencia) }))
      .filter((f) => f.codigo);
    const comparacion = compararConValery(
      macedonia.map((e) => ({ codigo: e.codigo, existencia: Number(e.existencia) })),
      valery,
      new Map(productos.map((p) => [p.codigo, p.nombre])),
      ajustes.map((m) => ({ codigo: m.codigo, cantidad: (m.direccion === "entrada" ? 1 : -1) * Number(m.cantidad) })),
    );
    return { ok: true, solicitud: lista.id, leidoEn: lista.terminado_en, corte: desde, comparacion, ultimo };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
