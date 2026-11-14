"use server";

// Los insights del Master, con la sesión de quien mira (lib/inventory/insights.ts).
// Los montos de venta, solo si puede ver Ventas; el valor, solo si puede ver
// costos (eso ya lo decide master()). Lo demás va en unidades.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, sesionPuede } from "@/lib/auth/sesion-servidor";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { isEmpresaId } from "@/lib/ux/empresas";
import { master } from "./conteos-db";
import { calcularInsights, VENTANA_DIAS, type Insights } from "./insights.ts";

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const menos = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export async function insightsInventario(empresa: string): Promise<{ ok: true; insights: Insights } | { ok: false; error: string }> {
  const u = await getUsuarioSesion();
  if (!u) return { ok: false, error: "Sin sesión." };
  if (!isEmpresaId(empresa)) return { ok: false, error: "Empresa desconocida." };
  const sb = await createClient();
  const { data: c } = await sb.from("cortes_inventario").select("desde").eq("empresa_id", empresa).maybeSingle();
  if (!c?.desde) return { ok: false, error: "Esta empresa todavía no tiene ventas de Valery en el inventario: falta alinear su existencia (el corte)." };
  const hoy = hoyCaracas();
  // Dos ventanas: la de 30 días y la quincena anterior para la tendencia; desde el corte, nunca antes.
  const desde = [menos(hoy, VENTANA_DIAS * 2), c.desde as string].reduce((a, b) => (a > b ? a : b));
  const conMontos = sesionPuede(u, "revenue");
  try {
    const [movs, filas] = await Promise.all([
      todasLasFilas<{ fecha: string; tipo_doc: string; codigo: string; nombre: string; cantidad: number; monto_usd: number | null; cliente: string | null }>((d, h, contar) =>
        sb.from("movimientos_inventario").select("fecha, tipo_doc, codigo, nombre, cantidad, monto_usd, cliente", contar ? { count: "exact" } : undefined)
          .eq("empresa_id", empresa).eq("origen", "venta").gte("fecha", desde).lte("fecha", hoy).order("id").range(d, h)),
      master(empresa),
    ]);
    const insights = calcularInsights(
      movs.map((m) => ({
        fecha: m.fecha, tipo: m.tipo_doc ?? "", codigo: m.codigo, nombre: m.nombre ?? m.codigo, cantidad: Math.abs(Number(m.cantidad)),
        montoUsd: conMontos && m.monto_usd !== null ? Number(m.monto_usd) : null, cliente: m.cliente ?? "",
      })),
      filas.map((f) => ({ codigo: f.codigo, nombre: f.nombre, unidad: f.unidad, existencia: f.valery, costo: f.costo })),
      { hoy, corte: desde, empresa, conMontos },
    );
    return { ok: true, insights };
  } catch (e) {
    return { ok: false, error: `No se pudieron calcular: ${(e as Error).message}` };
  }
}
