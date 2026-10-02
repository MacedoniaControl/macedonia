"use server";

// Liquidar varias cuentas por cobrar de un cliente con un solo pago.
//
// El comprobante (foto o PDF) va al bucket privado de comprobantes, bajo la
// carpeta de la empresa, ANTES de llamar a la base; si la base rechaza la
// liquidación, se borra para no dejar archivos sueltos. La base hace todo lo
// demás en una transacción (liquidar_cuentas, migración 33).

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

const BUCKET = "comprobantes";

export type ResultadoLiquidacion = { ok: true; numero: string; total: number; cuentas: number } | { ok: false; error: string };

export async function liquidarCuentas(
  empresa: string,
  ids: number[],
  pago: { fecha: string; metodo?: string; referencia?: string; nota?: string; imagen?: File | null },
): Promise<ResultadoLiquidacion> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!ids.length) return { ok: false, error: "Elige al menos una cuenta." };
  const sb = await createClient();

  let ruta: string | null = null;
  if (pago.imagen) {
    const ext = pago.imagen.name.split(".").pop()?.toLowerCase() || "jpg";
    ruta = `${empresa}/liquidaciones/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(ruta, pago.imagen, { contentType: pago.imagen.type, upsert: false });
    if (error) return { ok: false, error: `No se pudo subir el comprobante: ${error.message}` };
  }

  const { data, error } = await sb.rpc("liquidar_cuentas", {
    p_empresa: empresa, p_ids: ids, p_fecha: pago.fecha, p_metodo: pago.metodo ?? null,
    p_referencia: pago.referencia ?? null, p_nota: pago.nota ?? null, p_imagen_ruta: ruta,
  });
  if (error) {
    if (ruta) await sb.storage.from(BUCKET).remove([ruta]);
    return { ok: false, error: error.message };
  }
  const r = (Array.isArray(data) ? data[0] : data) as { numero: string; total: number; cuentas: number };
  return { ok: true, numero: r.numero, total: Number(r.total), cuentas: r.cuentas };
}

export type Liquidacion = {
  id: number; numero: string; contraparte: string; fecha: string; total: number; cuentas: number;
  metodo: string | null; referencia: string | null; nota: string | null; imagenRuta: string | null;
  creadoNombre: string; creadoEn: string;
  anuladaEn: string | null; anuladaNombre: string | null; anuladaMotivo: string | null;
  /** Los documentos que liquidó y cuánto se le abonó a cada uno (vacío si se anuló). */
  documentos: { documento: string; monto: number }[];
};

/** Las últimas liquidaciones de la empresa, con sus documentos. */
export async function listarLiquidaciones(empresa: string, limite = 50): Promise<Liquidacion[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("liquidaciones")
    .select("id, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, imagen_ruta, creado_nombre, creado_en, anulada_en, anulada_nombre, anulada_motivo")
    .eq("empresa_id", empresa).eq("tipo", "cobrar").order("id", { ascending: false }).limit(limite);
  if (error) {
    // Sin la migración 33 la tabla no existe: la sección simplemente no se muestra.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`No se pudieron leer las liquidaciones: ${error.message}`);
  }
  const filas = data ?? [];
  const ids = filas.map((l) => l.id);
  const docs = new Map<number, { documento: string; monto: number }[]>();
  if (ids.length) {
    const { data: ab } = await sb.from("abonos").select("liquidacion_id, monto, cuentas(documento)").in("liquidacion_id", ids);
    for (const a of (ab ?? []) as unknown as { liquidacion_id: number; monto: number; cuentas: { documento: string } | null }[]) {
      docs.set(a.liquidacion_id, [...(docs.get(a.liquidacion_id) ?? []), { documento: a.cuentas?.documento ?? "—", monto: Number(a.monto) }]);
    }
  }
  return filas.map((l) => ({
    id: l.id, numero: l.numero, contraparte: l.contraparte, fecha: l.fecha, total: Number(l.total), cuentas: l.cuentas,
    metodo: l.metodo, referencia: l.referencia, nota: l.nota, imagenRuta: l.imagen_ruta,
    creadoNombre: l.creado_nombre, creadoEn: l.creado_en,
    anuladaEn: l.anulada_en, anuladaNombre: l.anulada_nombre, anuladaMotivo: l.anulada_motivo,
    documentos: (docs.get(l.id) ?? []).sort((a, b) => a.documento.localeCompare(b.documento)),
  }));
}

/** Anula una liquidación hecha por error: sus notas vuelven a quedar abiertas. */
export async function anularLiquidacion(id: number, motivo: string): Promise<{ ok: true; abonos: number } | { ok: false; error: string }> {
  if (!motivo.trim()) return { ok: false, error: "Indica por qué se anula: queda en el registro." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("anular_liquidacion", { p_id: id, p_motivo: motivo.trim() });
  return error ? { ok: false, error: error.message } : { ok: true, abonos: Number(data) || 0 };
}
