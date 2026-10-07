"use server";

// Liquidar varias cuentas de un cliente (por cobrar) o de un proveedor (por
// pagar) con un solo pago (migraciones 33 y 34).
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
  tipo: "cobrar" | "pagar" = "cobrar",
  /** Lo que sobra del pago, abonado a otra nota en la misma liquidación (migración 41). */
  restante?: { cuentaId: number; monto: number } | null,
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
    p_referencia: pago.referencia ?? null, p_nota: pago.nota ?? null, p_imagen_ruta: ruta, p_tipo: tipo,
    p_abono_cuenta: restante?.cuentaId ?? null, p_abono_monto: restante?.monto ?? null,
  });
  if (error) {
    if (ruta) await sb.storage.from(BUCKET).remove([ruta]);
    return { ok: false, error: error.message };
  }
  const r = (Array.isArray(data) ? data[0] : data) as { numero: string; total: number; cuentas: number };
  return { ok: true, numero: r.numero, total: Number(r.total), cuentas: r.cuentas };
}

/** Una nota (o factura) que entró en una liquidación, con lo que se le abonó. */
export type DocumentoLiquidado = {
  cuentaId: number; documento: string; emitida: string | null; vence: string | null; monto: number;
  /** false = la liquidación solo le abonó el restante del pago: la nota sigue abierta. */
  saldada: boolean;
};

export type Liquidacion = {
  id: number; numero: string; contraparte: string; fecha: string; total: number; cuentas: number;
  metodo: string | null; referencia: string | null; nota: string | null; imagenRuta: string | null;
  creadoNombre: string; creadoEn: string;
  anuladaEn: string | null; anuladaNombre: string | null; anuladaMotivo: string | null;
  /** Los documentos que liquidó y cuánto se le abonó a cada uno (vacío si se anuló). */
  documentos: DocumentoLiquidado[];
};

/** Las últimas liquidaciones de la empresa, con sus documentos. */
export async function listarLiquidaciones(empresa: string, tipo: "cobrar" | "pagar" = "cobrar", limite = 50): Promise<Liquidacion[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("liquidaciones")
    .select("id, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, imagen_ruta, creado_nombre, creado_en, anulada_en, anulada_nombre, anulada_motivo")
    .eq("empresa_id", empresa).eq("tipo", tipo).order("id", { ascending: false }).limit(limite);
  if (error) {
    // Sin la migración 33 la tabla no existe: la sección simplemente no se muestra.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`No se pudieron leer las liquidaciones: ${error.message}`);
  }
  const filas = data ?? [];
  const ids = filas.map((l) => l.id);
  const docs = new Map<number, DocumentoLiquidado[]>();
  if (ids.length) {
    const { data: ab } = await sb.from("abonos").select("liquidacion_id, cuenta_id, monto, cuentas(documento, emitida, vence, estado, liquidada_nota)").in("liquidacion_id", ids);
    type Fila = { liquidacion_id: number; cuenta_id: number; monto: number; cuentas: { documento: string; emitida: string | null; vence: string | null; estado: string; liquidada_nota: string | null } | null };
    const numero = new Map(filas.map((l) => [l.id, l.numero]));
    for (const a of (ab ?? []) as unknown as Fila[]) {
      docs.set(a.liquidacion_id, [...(docs.get(a.liquidacion_id) ?? []), {
        cuentaId: Number(a.cuenta_id), documento: a.cuentas?.documento ?? "—",
        emitida: a.cuentas?.emitida ?? null, vence: a.cuentas?.vence ?? null, monto: Number(a.monto),
        saldada: a.cuentas?.estado === "liquidada" && (a.cuentas.liquidada_nota ?? "").startsWith(`Liquidación ${numero.get(a.liquidacion_id)}`),
      }]);
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
