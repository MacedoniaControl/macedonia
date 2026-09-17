"use server";

// Cuentas por cobrar y por pagar. Ver supabase/13-cuentas.sql.
//
// Una sola capa para las dos: la única diferencia es hacia dónde va el dinero.
// Duplicarla serían dos sitios donde arreglar el mismo error.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { retencionDe, claseDeDocumento } from "./retencion.ts";
import type { ClaseCuenta } from "./retencion.ts";
// Las constantes NO se reexportan desde aqui: este archivo es "use server" y
// solo admite exportar funciones asincronas. Quien las necesite importa
// directamente de ./retencion.
export type EstadoCuenta = "abierta" | "liquidada";

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
  clase: ClaseCuenta;
  estado: EstadoCuenta;
};

export type CuentaNueva = {
  tipo: TipoCuenta;
  contraparte: string;
  documento: string;
  /** Lo que se debe. Con desglose sale de BI + IVA - retencion. */
  monto: number;
  vence: string;
  nota?: string;
  // Desglose fiscal, opcional: una cuenta sin factura -un anticipo, un
  // prestamo entre empresas- no tiene ninguno de los tres.
  baseImponible?: number | null;
  iva?: number | null;
  ivaRetenido?: number | null;
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

  type Fila = Omit<Cuenta, "monto" | "abonado" | "saldo" | "dias" | "clase" | "estado"> & {
    monto: number; abonado: number; saldo: number; dias: number;
  };
  return ((data as Fila[] | null) ?? []).map((c) => ({
    ...c,
    monto: Number(c.monto),
    abonado: Number(c.abonado),
    saldo: Number(c.saldo),
    dias: Number(c.dias),
    // La vista `cuentas_saldo` enumera sus columnas, asi que no expone `clase`
    // ni `estado` hasta que la migracion 21 la recree. Mientras tanto la clase
    // se deduce del prefijo -misma regla que la migracion- y la cuenta se
    // muestra abierta, que es su estado por defecto.
    clase: claseDeDocumento(c.documento),
    estado: "abierta" as EstadoCuenta,
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
  // Se comprueba aca ademas de en la pantalla: la pantalla se puede saltar.
  const total = (c.baseImponible ?? 0) + (c.iva ?? 0);
  if (c.ivaRetenido != null && total > 0 && c.ivaRetenido > total) {
    return { ok: false, error: "La retención no puede ser mayor que el total de la operación." };
  }

  const sb = await createClient();
  const { error } = await sb.from("cuentas").insert({
    empresa_id: empresa,
    tipo: c.tipo,
    contraparte: c.contraparte.trim(),
    documento: c.documento.trim() || "—",
    monto: c.monto,
    base_imponible: c.baseImponible ?? null,
    iva: c.iva ?? null,
    iva_retenido: c.ivaRetenido ?? null,
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

// ---------------------------------------------------------------------------
// HISTORIAL DE UNA CUENTA
//
// Pedido por Greeg: cada cuenta tiene que poder abrirse y contar su propia
// historia. Cuanto se abono, cuando, con que comprobante, cuanto queda, y si
// esta cerrada, quien la cerro y por que.
// ---------------------------------------------------------------------------

export type AbonoHist = {
  id: number;
  fecha: string;
  monto: number;
  metodo: string | null;
  referencia: string | null;
  imagenRuta: string | null;
};

export type CuentaDetalle = {
  id: number;
  tipo: TipoCuenta;
  clase: ClaseCuenta;
  contraparte: string;
  documento: string;
  monto: number;
  baseImponible: number | null;
  iva: number | null;
  ivaRetenido: number | null;
  aplicaRetencion: boolean;
  emitida: string;
  vence: string;
  nota: string | null;
  estado: EstadoCuenta;
  liquidadaEn: string | null;
  liquidadaComo: "abono" | "total" | null;
  liquidadaNota: string | null;
  abonos: AbonoHist[];
  abonado: number;
  saldo: number;
  /**
   * El total menos lo retenido. Es la plata que de verdad cambia de manos:
   * lo que se le entrega al proveedor si la cuenta es por pagar, o lo que
   * entra del cliente si es por cobrar -en ese caso el que retiene es el
   * cliente, y ese IVA se lo entera el al SENIAT, no tu-.
   */
  neto: number;
};

export async function detalleCuenta(id: number): Promise<CuentaDetalle | null> {
  const sb = await createClient();

  const BASE = "id, tipo, contraparte, documento, monto, base_imponible, iva, iva_retenido, emitida, vence, nota";
  const NUEVAS = "clase, aplica_retencion, estado, liquidada_en, liquidada_como, liquidada_nota";

  // eslint-disable-next-line prefer-const
  let { data: c, error } = await sb
    .from("cuentas").select(`${BASE}, ${NUEVAS}`).eq("id", id).maybeSingle();

  // 42703 = la columna no existe. Pasa mientras no se corra la migracion 21:
  // la pantalla tiene que poder verse igual, con los valores por defecto.
  if (error?.code === "42703") {
    ({ data: c, error } = await sb.from("cuentas").select(BASE).eq("id", id).maybeSingle());
  }

  if (error) throw new Error(`No se pudo leer la cuenta: ${error.message}`);
  if (!c) return null;

  const sinMigrar = !("clase" in c);

  const { data: ab } = await sb
    .from("abonos")
    .select("id, fecha, monto, metodo, referencia, imagen_ruta")
    .eq("cuenta_id", id)
    .order("fecha", { ascending: true })
    .order("id", { ascending: true });

  const abonos: AbonoHist[] = (ab ?? []).map((a) => ({
    id: a.id as number,
    fecha: a.fecha as string,
    monto: Number(a.monto),
    metodo: (a.metodo as string) ?? null,
    referencia: (a.referencia as string) ?? null,
    imagenRuta: (a.imagen_ruta as string) ?? null,
  }));

  const monto = Number(c.monto);
  const abonado = abonos.reduce((t, a) => t + a.monto, 0);
  const iva = c.iva === null ? null : Number(c.iva);
  // Si la cuenta trae retencion guardada se respeta: una cuenta vieja tiene
  // que seguir diciendo lo que se retuvo entonces, aunque cambie el porcentaje.
  const aplica = sinMigrar ? true : Boolean(c.aplica_retencion);
  const ret = c.iva_retenido != null ? Number(c.iva_retenido) : retencionDe(iva, aplica);

  return {
    id: c.id as number,
    tipo: c.tipo as TipoCuenta,
    clase: (c.clase as ClaseCuenta) ?? claseDeDocumento(c.documento as string),
    contraparte: c.contraparte as string,
    documento: c.documento as string,
    monto,
    baseImponible: c.base_imponible === null ? null : Number(c.base_imponible),
    iva,
    ivaRetenido: c.iva_retenido == null ? null : Number(c.iva_retenido),
    aplicaRetencion: aplica,
    emitida: c.emitida as string,
    vence: c.vence as string,
    nota: (c.nota as string) ?? null,
    estado: (c.estado as EstadoCuenta) ?? "abierta",
    liquidadaEn: (c.liquidada_en as string) ?? null,
    liquidadaComo: (c.liquidada_como as "abono" | "total") ?? null,
    liquidadaNota: (c.liquidada_nota as string) ?? null,
    abonos,
    abonado: Math.round(abonado * 100) / 100,
    saldo: Math.round((monto - abonado) * 100) / 100,
    neto: Math.round((monto - ret) * 100) / 100,
  };
}

/** Corrige una cuenta ya cargada. Existe porque la gente se equivoca al teclear. */
export async function editarCuenta(
  id: number,
  c: {
    contraparte: string;
    documento: string;
    clase: ClaseCuenta;
    monto: number;
    baseImponible: number | null;
    iva: number | null;
    ivaRetenido: number | null;
    aplicaRetencion: boolean;
    emitida: string;
    vence: string;
    nota?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!c.contraparte.trim()) return { ok: false, error: "Falta el nombre." };
  if (!(c.monto > 0)) return { ok: false, error: "El monto debe ser mayor que cero." };
  if (c.vence < c.emitida) return { ok: false, error: "No puede vencer antes de emitirse." };

  const sb = await createClient();

  // Bajar el monto por debajo de lo ya abonado dejaria un saldo negativo, que
  // no significa nada y esconde el error en vez de mostrarlo.
  const { data: saldo } = await sb
    .from("cuentas_saldo").select("abonado").eq("id", id).maybeSingle();
  const abonado = saldo ? Number(saldo.abonado) : 0;
  if (c.monto < abonado) {
    return { ok: false, error: `Ya se abonaron $${abonado.toFixed(2)}: el monto no puede ser menor.` };
  }

  const { error } = await sb
    .from("cuentas")
    .update({
      contraparte: c.contraparte.trim(),
      documento: c.documento.trim() || "—",
      clase: c.clase,
      monto: c.monto,
      base_imponible: c.baseImponible,
      iva: c.iva,
      iva_retenido: c.ivaRetenido,
      aplica_retencion: c.aplicaRetencion,
      emitida: c.emitida,
      vence: c.vence,
      nota: c.nota?.trim() || null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cierra una cuenta.
 *
 * `como` dice si se pago completo o si se cierra con un abono parcial: se
 * negocio, se condono, se cruzo con otra deuda. El saldo por si solo no sabe
 * eso, y por eso cerrar es una decision de una persona y queda firmada.
 */
export async function liquidarCuenta(
  id: number,
  como: "abono" | "total",
  nota?: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const sb = await createClient();
  const { data: s } = await sb.from("cuentas_saldo").select("saldo").eq("id", id).maybeSingle();
  const saldo = s ? Number(s.saldo) : 0;

  if (como === "total" && saldo > 0.009) {
    return { ok: false, error: `Todavía quedan $${saldo.toFixed(2)}. Cerrala como abono parcial o registrá el resto.` };
  }
  if (como === "abono" && !nota?.trim()) {
    // Cerrar debiendo pide explicacion: dentro de seis meses nadie se acuerda.
    return { ok: false, error: "Explicá por qué se cierra con saldo pendiente." };
  }

  const { error } = await sb.from("cuentas").update({
    estado: "liquidada",
    liquidada_en: new Date().toISOString(),
    liquidada_por: usuario.id,
    liquidada_como: como,
    liquidada_nota: nota?.trim() || null,
  }).eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Vuelve a abrir una cuenta cerrada por error. */
export async function reabrirCuenta(id: number): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("cuentas").update({
    estado: "abierta", liquidada_en: null, liquidada_por: null,
    liquidada_como: null, liquidada_nota: null,
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// ABONO CON COMPROBANTE
//
// La imagen va a un bucket PRIVADO cuya ruta arranca con el id de empresa, asi
// que el RLS de Storage la separa igual que el resto. Se lee con una URL
// firmada de corta vida, nunca con un enlace publico: es un comprobante de pago
// con montos y nombres.
// ---------------------------------------------------------------------------

const BUCKET_COMPROBANTES = "comprobantes";

export async function abonarConComprobante(
  cuentaId: number,
  empresa: string,
  monto: number,
  opciones: { fecha?: string; metodo?: string; referencia?: string; imagen?: File | null },
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!(monto > 0)) return { ok: false, error: "El abono debe ser mayor que cero." };

  const sb = await createClient();
  const { data: c } = await sb.from("cuentas_saldo").select("saldo").eq("id", cuentaId).maybeSingle();
  if (!c) return { ok: false, error: "No se encontró la cuenta." };
  if (monto > Number(c.saldo) + 0.009) {
    return { ok: false, error: `El abono supera el saldo pendiente ($${Number(c.saldo).toFixed(2)}).` };
  }

  let ruta: string | null = null;
  if (opciones.imagen) {
    const ext = opciones.imagen.name.split(".").pop()?.toLowerCase() || "jpg";
    ruta = `${empresa}/${cuentaId}/${Date.now()}.${ext}`;
    const { error: errSubida } = await sb.storage
      .from(BUCKET_COMPROBANTES)
      .upload(ruta, opciones.imagen, { contentType: opciones.imagen.type, upsert: false });
    if (errSubida) return { ok: false, error: `No se pudo subir el comprobante: ${errSubida.message}` };
  }

  const { error } = await sb.from("abonos").insert({
    cuenta_id: cuentaId,
    monto,
    fecha: opciones.fecha || undefined,
    metodo: opciones.metodo?.trim() || null,
    referencia: opciones.referencia?.trim() || null,
    imagen_ruta: ruta,
    usuario_id: usuario.id,
  });

  if (error) {
    // Si el abono no entro, la imagen sobra: dejarla crea un comprobante
    // huerfano que nadie va a poder relacionar con nada.
    if (ruta) await sb.storage.from(BUCKET_COMPROBANTES).remove([ruta]);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** URL firmada de corta vida. El bucket es privado: no hay enlace permanente. */
export async function urlComprobante(ruta: string): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta, 60 * 5);
  return data?.signedUrl ?? null;
}
