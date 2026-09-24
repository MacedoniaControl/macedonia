"use server";

// Los indicadores del día del Dashboard, de la base.
//
// Antes eran ocho tarjetas escritas en cero en la pantalla ("$0 · 0
// documentos") aunque hubiera 328 cuentas por cobrar cargadas. Cada número
// sale ahora de la misma fuente que su sección, y SOLO si quien mira puede
// ver esa sección: un vendedor no ve las cuentas por pagar, así que para él
// esa tarjeta no existe (null), en vez de mostrarle un cero que no es cierto.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, sesionPuede } from "@/lib/auth/sesion-servidor";
import { listarCuentas } from "@/lib/finanzas/cuentas-db";
import { listarOrdenes } from "@/lib/compras/compras-db";

export type ResumenOperativo = {
  ventasHoy: { usd: number; notas: number } | null;
  cobrar: { usd: number; documentos: number; vencido: number } | null;
  pagar: { usd: number; proveedores: number; vencido: number } | null;
  negativos: { productos: number } | null;
  compras: { ordenes: number; usd: number } | null;
};

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

/** Cada parte por separado: si una falla, las demás igual se muestran. */
async function parte<T>(puede: boolean, leer: () => Promise<T>): Promise<T | null> {
  if (!puede) return null;
  try { return await leer(); } catch { return null; }
}

export async function resumenOperativo(empresa: string): Promise<ResumenOperativo> {
  const u = await getUsuarioSesion();
  if (!u) return { ventasHoy: null, cobrar: null, pagar: null, negativos: null, compras: null };
  const sb = await createClient();
  const puede = (clave: string) => sesionPuede(u, clave);

  const [ventasHoy, cobrar, pagar, negativos, compras] = await Promise.all([
    // Ventas de hoy: las notas de entrega emitidas en Macedonia. Las ventas de
    // Valery llegan por importación, no en el día.
    parte(puede("delivery-notes"), async () => {
      const { data, error } = await sb.from("documentos").select("total_usd").eq("empresa_id", empresa)
        .eq("tipo", "nota_entrega").eq("fecha", hoyCaracas());
      if (error) throw error;
      return { usd: (data ?? []).reduce((a, d) => a + Number(d.total_usd ?? 0), 0), notas: data?.length ?? 0 };
    }),
    parte(puede("receivables"), async () => {
      const c = (await listarCuentas(empresa, "cobrar")).filter((x) => x.estado !== "liquidada" && x.saldo > 0);
      return {
        usd: c.reduce((a, x) => a + x.saldo, 0), documentos: c.length,
        vencido: c.filter((x) => x.dias < 0).reduce((a, x) => a + x.saldo, 0),
      };
    }),
    // Por pagar: el neto (sin el IVA retenido, que va al SENIAT), como el panel.
    parte(puede("payables"), async () => {
      const c = (await listarCuentas(empresa, "pagar")).filter((x) => x.estado !== "liquidada" && x.saldoNeto > 0);
      return {
        usd: c.reduce((a, x) => a + x.saldoNeto, 0), proveedores: new Set(c.map((x) => x.contraparte)).size,
        vencido: c.filter((x) => x.dias < 0).reduce((a, x) => a + x.saldoNeto, 0),
      };
    }),
    // No hay mínimos de stock cargados: lo que sí se sabe es qué salió sin
    // entrada registrada (existencia negativa).
    // Solo los del catálogo, como el Master: el kardex trae también 264 códigos
    // viejos que ya no están en el listado de Valery (medido el 24-09-2026).
    parte(puede("inventory"), async () => {
      const { data: neg, error } = await sb.from("existencias").select("codigo").eq("empresa_id", empresa).lt("existencia", 0);
      if (error) throw error;
      const codigos = (neg ?? []).map((x) => x.codigo);
      let productos = 0;
      for (let i = 0; i < codigos.length; i += 150) {
        const { count } = await sb.from("productos").select("codigo", { count: "exact", head: true })
          .eq("empresa_id", empresa).in("codigo", codigos.slice(i, i + 150));
        productos += count ?? 0;
      }
      return { productos };
    }),
    parte(puede("purchases"), async () => {
      const o = (await listarOrdenes(empresa)).filter((x) => x.estado !== "recibida");
      return { ordenes: o.length, usd: o.reduce((a, x) => a + x.pendiente * x.costoUsd, 0) };
    }),
  ]);
  return { ventasHoy, cobrar, pagar, negativos, compras };
}
