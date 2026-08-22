"use server";

// Gastos en Supabase. Reemplaza al store de localStorage.
//
// Regla de negocio: gastos y utilidad son de Owner y Administrador. Quien la
// hace cumplir es el RLS (`puede('expenses')`), no esta capa — si el front
// tuviera un bug, la base seguiría negando las filas.
//
// La conversión a dólares se hace y se GUARDA aquí (monto_usd). No se recalcula
// al leer: la tasa del día en que se cargó el gasto es un hecho de ese día, y
// recalcular con la tasa de hoy cambiaría el pasado.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type Moneda = "USD" | "BS";

export type GastoNuevo = {
  fecha: string;            // YYYY-MM-DD
  partida: string;
  categoria: string;
  monto: number;
  moneda: Moneda;
  /** Obligatoria si la moneda es BS. */
  tasa?: number;
  beneficiario?: string;
  tipoTransaccion?: string;
  documento?: string;
  nota?: string;
};

export type GastoGuardado = {
  id: number;
  fecha: string;
  partida: string;
  categoria: string;
  monto: number;
  moneda: Moneda;
  tasa: number | null;
  montoUsd: number;
  beneficiario: string | null;
  tipoTransaccion: string | null;
  documento: string | null;
  nota: string | null;
  usuario: string;
};

export async function registrarGasto(
  g: GastoNuevo,
  empresa: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  if (!g.partida.trim()) return { ok: false, error: "Falta la partida." };
  if (!(g.monto > 0)) return { ok: false, error: "El monto debe ser mayor que cero." };
  if (g.moneda === "BS" && !(g.tasa && g.tasa > 0)) {
    // La base lo rechaza igual (constraint bs_requiere_tasa); avisar aquí da un
    // mensaje entendible en vez del error crudo de Postgres.
    return { ok: false, error: "Un gasto en bolívares necesita la tasa del día." };
  }

  const montoUsd = g.moneda === "BS" ? g.monto / (g.tasa as number) : g.monto;

  const sb = await createClient();
  const { data, error } = await sb
    .from("gastos")
    .insert({
      empresa_id: empresa,
      fecha: g.fecha,
      partida: g.partida.trim(),
      categoria: g.categoria.trim(),
      monto: g.monto,
      moneda: g.moneda,
      tasa: g.moneda === "BS" ? g.tasa : null,
      monto_usd: Math.round(montoUsd * 100) / 100,
      beneficiario: g.beneficiario?.trim() || null,
      tipo_transaccion: g.tipoTransaccion?.trim() || null,
      documento: g.documento?.trim() || null,
      nota: g.nota?.trim() || null,
      usuario_id: usuario.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: `No se pudo registrar el gasto: ${error?.message}` };
  return { ok: true, id: data.id };
}

export async function listarGastos(empresa: string, limite = 500): Promise<GastoGuardado[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("gastos")
    .select("id, fecha, partida, categoria, monto, moneda, tasa, monto_usd, beneficiario, tipo_transaccion, documento, nota, usuarios(nombre)")
    .eq("empresa_id", empresa)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite);

  if (error) throw new Error(`No se pudieron leer los gastos: ${error.message}`);

  type Fila = {
    id: number; fecha: string; partida: string; categoria: string;
    monto: number; moneda: Moneda; tasa: number | null; monto_usd: number;
    beneficiario: string | null; tipo_transaccion: string | null;
    documento: string | null; nota: string | null;
    usuarios: { nombre: string } | null;
  };

  return ((data as unknown as Fila[] | null) ?? []).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    partida: g.partida,
    categoria: g.categoria,
    monto: Number(g.monto),
    moneda: g.moneda,
    tasa: g.tasa === null ? null : Number(g.tasa),
    montoUsd: Number(g.monto_usd),
    beneficiario: g.beneficiario,
    tipoTransaccion: g.tipo_transaccion,
    documento: g.documento,
    nota: g.nota,
    usuario: g.usuarios?.nombre ?? "—",
  }));
}

export async function eliminarGasto(
  id: number,
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const sb = await createClient();
  const { error } = await sb.from("gastos").delete().eq("id", id).eq("empresa_id", empresa);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Las 34 partidas con su categoría, desde la base. */
export async function partidas(): Promise<{ nombre: string; categoria: string }[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("partidas_gasto")
    .select("nombre, categoria")
    .eq("activa", true)
    .order("categoria")
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer las partidas: ${error.message}`);
  return (data as { nombre: string; categoria: string }[] | null) ?? [];
}
