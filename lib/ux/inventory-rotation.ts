// Estado de rotación / cobertura de inventario.
// Meses de stock = existencia actual (Maestro M, en vivo) ÷ venta mensual promedio
// (últimos 12 meses del histórico de Valery). Ver docs/decisions/inventory-model.md.
import seed from "./inventory-rotation-seed.json";

type Row = { v12: number; precio: number };
type Seed = { ventana: { desde: string; hasta: string }; items: Record<string, Row> };
const SEED = seed as Seed;

export const rotacionVentana = SEED.ventana;

/** Unidades vendidas (netas de devoluciones) en los últimos 12 meses. */
export function ventas12m(codigo: string): number {
  return SEED.items[codigo]?.v12 ?? 0;
}
/** Precio de venta promedio ($) del período. */
export function precioProm(codigo: string): number {
  return SEED.items[codigo]?.precio ?? 0;
}

export type Tono = "ok" | "warn" | "danger" | "muted";
export type EstadoRotacion = { tono: Tono; label: string; accion: string; meses: number | null };

// Umbrales (decisión de negocio): 🟡 <3m reponer · 🟢 3–24m · 🔴 0/agotado/sin rotación o >24m sobrestock.
export const UMBRAL_BAJO = 3;
export const UMBRAL_ALTO = 24;

export function estadoRotacion(disponible: number, avgMensual: number): EstadoRotacion {
  if (avgMensual <= 0) {
    // No hay ventas en 12 meses.
    if (disponible > 0) return { tono: "danger", label: "Sin rotación", accion: "Evaluar liquidación", meses: null };
    return { tono: "muted", label: "Sin movimiento", accion: "—", meses: null };
  }
  const meses = disponible / avgMensual;
  if (disponible <= 0) return { tono: "danger", label: "Agotado", accion: "Reponer urgente", meses };
  if (meses < UMBRAL_BAJO) return { tono: "warn", label: "Reponer pronto", accion: "Reponer", meses };
  if (meses > UMBRAL_ALTO) return { tono: "danger", label: "Sobrestock", accion: "Detener compra", meses };
  return { tono: "ok", label: "Saludable", accion: "OK", meses };
}
