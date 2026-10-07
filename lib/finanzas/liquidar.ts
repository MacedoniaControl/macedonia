// Qué cuentas se pueden liquidar juntas y cuánto suman. La base lo vuelve a
// comprobar (liquidar_cuentas, migración 33); esto es para la pantalla.

import { aMonto, CASI_CERO } from "../ux/decimales.ts";

export type CuentaLiquidable = {
  id: number; contraparte: string; documento: string; estado: "abierta" | "liquidada";
  vence: string; emitida: string; saldo: number; saldoNeto: number;
};

/** Lo que falta de una cuenta: el saldo neto (sin el IVA retenido), que es lo que se abona. */
export const pendiente = (c: Pick<CuentaLiquidable, "saldo" | "saldoNeto">) => aMonto(c.saldoNeto ?? c.saldo);

/** Las cuentas abiertas con saldo, que son las únicas que se pueden liquidar. */
export const liquidables = <C extends CuentaLiquidable>(cuentas: C[]) =>
  cuentas.filter((c) => c.estado === "abierta" && pendiente(c) > CASI_CERO);

/** Los clientes con algo que liquidar, de mayor a menor deuda. */
export function clientesConDeuda<C extends CuentaLiquidable>(cuentas: C[]) {
  const m = new Map<string, { cliente: string; cuentas: C[]; total: number }>();
  for (const c of liquidables(cuentas)) {
    const k = c.contraparte.trim().toUpperCase();
    const g = m.get(k) ?? { cliente: c.contraparte.trim(), cuentas: [], total: 0 };
    g.cuentas.push(c); g.total += pendiente(c);
    m.set(k, g);
  }
  return [...m.values()]
    .map((g) => ({ ...g, total: aMonto(g.total), cuentas: g.cuentas.sort((a, b) => a.vence.localeCompare(b.vence) || a.documento.localeCompare(b.documento)) }))
    .sort((a, b) => b.total - a.total);
}

/** Total de lo elegido. */
export const totalElegido = <C extends CuentaLiquidable>(cuentas: C[], ids: Set<number>) =>
  aMonto(cuentas.filter((c) => ids.has(c.id)).reduce((a, c) => a + pendiente(c), 0));
