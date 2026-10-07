// Cuentas por Pagar segmentadas por clase: Facturas, Notas de Entrega (con las
// de débito y crédito, como su pestaña) y lo demás, para el Resumen. Cada
// segmento con su deuda, su parte del total, lo vencido, lo que vence en 7
// días, cuántas están vencidas, proveedores y cuentas.

import { grupoDeClase, type ClaseCuenta } from "./retencion.ts";

type CuentaPagar = { clase: ClaseCuenta; contraparte: string; saldoNeto: number; dias: number };

export type SegmentoClase = {
  id: ClaseCuenta;
  nombre: string;
  total: number;
  vencido: number;
  alerta: number;
  vencidas: number;
  proveedores: number;
  cuentas: number;
  /** Parte del total a pagar, en %. */
  parte: number;
};

const NOMBRE: Partial<Record<ClaseCuenta, string>> = { factura: "Facturas", nota_entrega: "Notas de Entrega", ajuste: "Ajustes" };
const ORDEN: ClaseCuenta[] = ["factura", "nota_entrega", "ajuste"];
const clave = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

export function resumenDe(cs: CuentaPagar[]) {
  const abiertas = cs.filter((c) => c.saldoNeto > 0);
  return {
    total: cs.reduce((a, c) => a + c.saldoNeto, 0),
    vencido: abiertas.filter((c) => c.dias < 0).reduce((a, c) => a + c.saldoNeto, 0),
    alerta: abiertas.filter((c) => c.dias >= 0 && c.dias <= 7).reduce((a, c) => a + c.saldoNeto, 0),
    vencidas: abiertas.filter((c) => c.dias < 0).length,
    proveedores: new Set(cs.map((c) => clave(c.contraparte))).size,
    cuentas: cs.length,
  };
}

/** Un segmento por grupo de clase que tenga cuentas, en el orden de las pestañas. */
export function porClase(cs: CuentaPagar[]): SegmentoClase[] {
  const total = cs.reduce((a, c) => a + c.saldoNeto, 0);
  const grupos = new Map<ClaseCuenta, CuentaPagar[]>();
  for (const c of cs) { const g = grupoDeClase(c.clase); grupos.set(g, [...(grupos.get(g) ?? []), c]); }
  return [...grupos.entries()]
    .sort((a, b) => (ORDEN.indexOf(a[0]) + 1 || 99) - (ORDEN.indexOf(b[0]) + 1 || 99))
    .map(([id, g]) => {
      const r = resumenDe(g);
      return { id, nombre: NOMBRE[id] ?? id, ...r, parte: total ? Math.round((r.total / total) * 1000) / 10 : 0 };
    });
}
