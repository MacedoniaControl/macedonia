"use server";

// Órdenes de compra. Ver supabase/14-compras.sql.
//
// El estado (abierta / parcial / recibida) NO se guarda: se deduce de cuánto
// llegó. Nadie tiene que acordarse de cambiarlo, y por lo tanto nadie puede
// olvidarse.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { registrarMovimiento } from "@/lib/inventory/movimientos-db";

export type EstadoOrden = "abierta" | "parcial" | "recibida";

export type Orden = {
  id: number;
  correlativo: string;
  proveedor: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  costoUsd: number;
  recibido: number;
  pendiente: number;
  estado: EstadoOrden;
  fecha: string;
};

export async function listarOrdenes(empresa: string): Promise<Orden[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("ordenes_estado")
    .select("id, correlativo, proveedor, codigo, descripcion, cantidad, costo_usd, recibido, pendiente, estado, fecha")
    .eq("empresa_id", empresa)
    .order("id", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las órdenes: ${error.message}`);

  type Fila = {
    id: number; correlativo: string; proveedor: string; codigo: string;
    descripcion: string; cantidad: number; costo_usd: number;
    recibido: number; pendiente: number; estado: EstadoOrden; fecha: string;
  };

  return ((data as Fila[] | null) ?? []).map((o) => ({
    id: o.id,
    correlativo: o.correlativo,
    proveedor: o.proveedor,
    codigo: o.codigo,
    descripcion: o.descripcion,
    cantidad: Number(o.cantidad),
    costoUsd: Number(o.costo_usd),
    recibido: Number(o.recibido),
    pendiente: Number(o.pendiente),
    estado: o.estado,
    fecha: o.fecha,
  }));
}

export async function crearOrden(
  o: { proveedor: string; codigo: string; descripcion: string; cantidad: number; costoUsd: number },
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!o.proveedor.trim()) return { ok: false, error: "Falta el proveedor." };
  if (!o.codigo.trim()) return { ok: false, error: "Falta el código del producto." };
  if (!(o.cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };

  const sb = await createClient();
  const correlativo = await sb.rpc("siguiente_correlativo", {
    p_empresa: empresa,
    p_tipo: "orden_compra",
  });

  const { error } = await sb.from("ordenes_compra").insert({
    empresa_id: empresa,
    correlativo: (correlativo.data as string) ?? `OC-${Date.now()}`,
    proveedor: o.proveedor.trim(),
    codigo: o.codigo.trim(),
    descripcion: o.descripcion.trim() || o.codigo.trim(),
    cantidad: o.cantidad,
    costo_usd: o.costoUsd,
    usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Registra que llegó parte (o todo) de una orden.
 *
 * Genera además un movimiento de ENTRADA en el kardex: lo que llega al almacén
 * tiene que aparecer en la existencia, o el inventario quedaría corto y nadie
 * sabría por qué.
 */
export async function recibir(
  ordenId: number,
  cantidad: number,
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };

  const sb = await createClient();
  const { data: o } = await sb
    .from("ordenes_estado")
    .select("correlativo, codigo, descripcion, pendiente")
    .eq("id", ordenId)
    .maybeSingle();

  if (!o) return { ok: false, error: "No se encontró la orden." };
  if (cantidad > Number(o.pendiente)) {
    return { ok: false, error: `Solo quedan ${Number(o.pendiente)} por recibir.` };
  }

  const { error } = await sb.from("recepciones").insert({
    orden_id: ordenId,
    cantidad,
    usuario_id: usuario.id,
  });
  if (error) return { ok: false, error: error.message };

  // La mercancía entra al kardex. Si esto fallara, la orden diría "recibida" y
  // el inventario no la tendría: por eso se avisa en vez de callar.
  const mov = await registrarMovimiento({
    direccion: "entrada",
    origen: "compra",
    codigo: o.codigo,
    nombre: o.descripcion,
    cantidad,
    documento: o.correlativo,
  }, empresa);

  if (!mov.ok) {
    return { ok: false, error: `Se registró la recepción pero NO entró al inventario: ${mov.error}` };
  }
  return { ok: true };
}
