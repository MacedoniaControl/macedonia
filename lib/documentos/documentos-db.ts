"use server";

// Documentos (notas de entrega, cotizaciones, devoluciones) en Supabase.
//
// Reemplaza a los contadores y listas que vivían en localStorage. El cambio de
// fondo no es dónde se guardan, sino QUIÉN da el número de documento: un
// contador en el navegador le entrega el mismo correlativo a dos vendedores que
// generan a la vez, y salen dos documentos con el mismo número hacia clientes
// distintos. Ahora lo entrega la base, con bloqueo de fila.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type TipoDoc = "nota_entrega" | "cotizacion" | "devolucion";

export type LineaDoc = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
  precio: number;
  descuento?: number;
};

export type DocumentoNuevo = {
  tipo: TipoDoc;
  cliente: string;
  clienteRif?: string;
  clienteDireccion?: string;
  moneda?: "USD" | "BS";
  lineas: LineaDoc[];
};

export type DocumentoGuardado = {
  id: number;
  correlativo: string;
  fecha: string;
  tipo: TipoDoc;
  cliente: string;
  clienteRif: string | null;
  total: number;
  lineas: LineaDoc[];
};

const totalDe = (lineas: LineaDoc[]) =>
  lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - (l.descuento ?? 0) / 100), 0);

/**
 * Guarda un documento y devuelve el correlativo que le tocó.
 *
 * El número se pide a la base DENTRO de la misma operación: si el guardado
 * falla, el número igual queda consumido. Es a propósito — un correlativo
 * saltado es un hueco explicable; un correlativo repetido es un problema con el
 * cliente y con el SENIAT.
 */
export async function guardarDocumento(
  doc: DocumentoNuevo,
  empresa: string,
): Promise<{ ok: true; documento: DocumentoGuardado } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!doc.cliente.trim()) return { ok: false, error: "Falta el cliente." };
  if (doc.lineas.length === 0) return { ok: false, error: "El documento no tiene renglones." };

  const sb = await createClient();

  const { data: correlativo, error: errNum } = await sb.rpc("siguiente_correlativo", {
    p_empresa: empresa,
    p_tipo: doc.tipo,
  });
  if (errNum || !correlativo) {
    return { ok: false, error: `No se pudo obtener el número: ${errNum?.message ?? "sin respuesta"}` };
  }

  const { data: cabecera, error: errDoc } = await sb
    .from("documentos")
    .insert({
      empresa_id: empresa,
      tipo: doc.tipo,
      correlativo,
      fecha: new Date().toISOString().slice(0, 10),
      cliente: doc.cliente.trim(),
      cliente_rif: doc.clienteRif?.trim() || null,
      cliente_direccion: doc.clienteDireccion?.trim() || null,
      moneda: doc.moneda ?? "USD",
      total_usd: totalDe(doc.lineas),
      estado: "emitido",
      vendedor_id: usuario.id,
      creado_por: usuario.id,
    })
    .select("id, correlativo, fecha, tipo, cliente, cliente_rif, total_usd")
    .single();

  if (errDoc || !cabecera) {
    return { ok: false, error: `No se pudo guardar el documento: ${errDoc?.message}` };
  }

  const { error: errLineas } = await sb.from("documento_lineas").insert(
    doc.lineas.map((l) => ({
      documento_id: cabecera.id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad ?? null,
      precio_usd: l.precio,
      descuento_pct: l.descuento ?? 0,
    })),
  );

  if (errLineas) {
    // Una cabecera sin renglones no sirve para nada y ensucia el correlativo:
    // se deshace para no dejar un documento fantasma en la lista.
    await sb.from("documentos").delete().eq("id", cabecera.id);
    return { ok: false, error: `No se pudieron guardar los renglones: ${errLineas.message}` };
  }

  return {
    ok: true,
    documento: {
      id: cabecera.id,
      correlativo: cabecera.correlativo,
      fecha: cabecera.fecha,
      tipo: cabecera.tipo as TipoDoc,
      cliente: cabecera.cliente,
      clienteRif: cabecera.cliente_rif,
      total: Number(cabecera.total_usd) || 0,
      lineas: doc.lineas,
    },
  };
}

/** Documentos de una empresa, del más nuevo al más viejo. */
export async function listarDocumentos(
  empresa: string,
  tipo: TipoDoc,
  limite = 100,
): Promise<DocumentoGuardado[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("documentos")
    .select("id, correlativo, fecha, tipo, cliente, cliente_rif, total_usd, documento_lineas(codigo, descripcion, cantidad, unidad, precio_usd, descuento_pct)")
    .eq("empresa_id", empresa)
    .eq("tipo", tipo)
    .order("id", { ascending: false })
    .limit(limite);

  if (error) throw new Error(`No se pudieron leer los documentos: ${error.message}`);

  type FilaLinea = { codigo: string; descripcion: string; cantidad: number; unidad: string | null; precio_usd: number; descuento_pct: number };
  type Fila = { id: number; correlativo: string; fecha: string; tipo: string; cliente: string; cliente_rif: string | null; total_usd: number; documento_lineas: FilaLinea[] | null };

  return ((data as Fila[] | null) ?? []).map((d) => ({
    id: d.id,
    correlativo: d.correlativo,
    fecha: d.fecha,
    tipo: d.tipo as TipoDoc,
    cliente: d.cliente,
    clienteRif: d.cliente_rif,
    total: Number(d.total_usd) || 0,
    lineas: (d.documento_lineas ?? []).map((l) => ({
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      unidad: l.unidad,
      precio: Number(l.precio_usd),
      descuento: Number(l.descuento_pct),
    })),
  }));
}

/** El próximo número que se va a usar, solo para mostrarlo antes de generar. */
export async function correlativoPrevisto(empresa: string, tipo: TipoDoc): Promise<string> {
  const sb = await createClient();
  const { data } = await sb
    .from("correlativos")
    .select("siguiente")
    .eq("empresa_id", empresa)
    .eq("tipo", tipo)
    .maybeSingle();

  // Es una PREVISIÓN, no una reserva: si otro vendedor genera antes, el número
  // real será el siguiente. Por eso el número definitivo solo se conoce después
  // de guardar.
  // Mismo arranque que la base (supabase/10-correlativos.sql): si aquí quedara
  // un 1, la pantalla anunciaría "0000000001" antes de guardar.
  return String(data?.siguiente ?? 45200).padStart(10, "0");
}
