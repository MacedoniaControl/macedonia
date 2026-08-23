"use server";

// Cuentas por cobrar y por pagar. Ver supabase/13-cuentas.sql.
//
// Una sola capa para las dos: la única diferencia es hacia dónde va el dinero.
// Duplicarla serían dos sitios donde arreglar el mismo error.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type TipoCuenta = "cobrar" | "pagar";

export type Cuenta = {
  id: number;
  tipo: TipoCuenta;
  contraparte: string;
  documento: string;
  monto: number;
  abonado: number;
  saldo: number;
  emitida: string;
  vence: string;
  /** Días hasta el vencimiento. Negativo = vencida. Sale de la fecha de HOY. */
  dias: number;
  nota: string | null;
};

export type CuentaNueva = {
  tipo: TipoCuenta;
  contraparte: string;
  documento: string;
  monto: number;
  vence: string;
  nota?: string;
};

export async function listarCuentas(empresa: string, tipo: TipoCuenta): Promise<Cuenta[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("cuentas_saldo")
    .select("id, tipo, contraparte, documento, monto, abonado, saldo, emitida, vence, dias, nota")
    .eq("empresa_id", empresa)
    .eq("tipo", tipo)
    .order("vence");

  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);

  type Fila = Omit<Cuenta, "monto" | "abonado" | "saldo" | "dias"> & {
    monto: number; abonado: number; saldo: number; dias: number;
  };
  return ((data as Fila[] | null) ?? []).map((c) => ({
    ...c,
    monto: Number(c.monto),
    abonado: Number(c.abonado),
    saldo: Number(c.saldo),
    dias: Number(c.dias),
  }));
}

export async function crearCuenta(
  c: CuentaNueva,
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!c.contraparte.trim()) {
    return { ok: false, error: c.tipo === "cobrar" ? "Falta el cliente." : "Falta el proveedor." };
  }
  if (!(c.monto > 0)) return { ok: false, error: "El monto debe ser mayor que cero." };
  if (!c.vence) return { ok: false, error: "Falta la fecha de vencimiento." };

  const sb = await createClient();
  const { error } = await sb.from("cuentas").insert({
    empresa_id: empresa,
    tipo: c.tipo,
    contraparte: c.contraparte.trim(),
    documento: c.documento.trim() || "—",
    monto: c.monto,
    vence: c.vence,
    nota: c.nota?.trim() || null,
    usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Registra un abono.
 *
 * No se permite abonar más de lo que se debe: un saldo negativo no significa
 * nada y esconde un error de carga en vez de mostrarlo.
 */
export async function abonar(
  cuentaId: number,
  monto: number,
  metodo?: string,
  referencia?: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!(monto > 0)) return { ok: false, error: "El abono debe ser mayor que cero." };

  const sb = await createClient();
  const { data: c } = await sb
    .from("cuentas_saldo").select("saldo").eq("id", cuentaId).maybeSingle();

  if (!c) return { ok: false, error: "No se encontró la cuenta." };
  if (monto > Number(c.saldo)) {
    return { ok: false, error: `El abono supera el saldo pendiente ($${Number(c.saldo).toFixed(2)}).` };
  }

  const { error } = await sb.from("abonos").insert({
    cuenta_id: cuentaId,
    monto,
    metodo: metodo?.trim() || null,
    referencia: referencia?.trim() || null,
    usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
