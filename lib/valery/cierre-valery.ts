// Cerrar un mes del histórico con lo que dice Valery (agente 1.0.8).
//
// Pedido del usuario (13-11-2026): la «Utilidad del período» se quedaba en
// agosto porque el histórico de Valery (scripts/historico-valery.py) se armó
// con exportes de Excel y nadie tenía los costos de septiembre y octubre. El
// agente 1.0.8 los lee de la copia de Valery: cada renglón de venta con su
// costo y cada compra con su monto, en los dólares de Valery (las tablas *_RM,
// moneda 02, las mismas del reporte «Reexpresado»).
//
// Reglas (verificadas con la copia de Valery de marzo de 2026):
//   · Venta y costo: FAC y NET suman, DEV resta. Sin IVA (el neto del renglón).
//   · Lo que una FAC factura de una nota de entrega ya se contó con la nota:
//     no se cuenta otra vez. Valery dice cuánto de cada renglón viene de una
//     nota (VENTAS_DETALLES_REL_CANT): se descuenta esa parte. El histórico de
//     Excel lo adivinaba (notas de hasta 60 días antes, mismos códigos y
//     montos) y se le escapaban las facturas de notas viejas: en febrero de
//     2026 contó dos veces las notas de 2025 que se facturaron ese mes.
//   · Lo anulado en Valery no cuenta.
//   · Lo que se venden Sumigases y Sudematin entre sí, y el consumo propio, no
//     es venta (claseVenta, la misma regla de Ventas).
//   · Compras, por fecha de registro (como el resumen mensual de Valery):
//     recepción (RCM), factura (FCM) y nota de débito (NDB) suman; devolución
//     (DCM) y nota de crédito (NCR) restan. La recepción que ya tiene su
//     factura cuenta una vez, en la factura. Neto = total − IVA − IGTF.
//   · Lo que Sudematin le compra a Sumigases no cuenta (es del grupo). Lo que
//     Sumigases registra a nombre de Sudematin SÍ es compra: son compras a
//     terceros que llegan por medio de Sudematin (confirmado por el usuario
//     para el histórico; aquí se mantiene).
//   · Un renglón sin monto en dólares no se inventa: se cuenta aparte.

import { claseVenta } from "./ventas.ts";
import { EMPRESAS, type EmpresaId } from "../ux/empresas.ts";

export type MesValery = {
  ym: string;
  venta: number; costo: number; compra: number;
  ventaBs: number; costoBs: number; compraBs: number;
  /** Renglones de venta que cuentan y documentos de compra que cuentan. */
  renglones: number; compras: number;
  /** Lo que se apartó, en dólares: facturas de notas ya contadas, ventas del grupo y consumo propio. */
  facturasDeNotas: number; entreEmpresas: number; consumoPropio: number;
  /** Filas sin monto en dólares en Valery (no se cuentan). */
  sinMonto: number;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const r2 = (n: number) => Math.round(n * 100) / 100;
const rifNormal = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Las compras a estos RIF no cuentan para la empresa (ver la cabecera). */
const COMPRA_DEL_GRUPO: Record<EmpresaId, Set<string>> = {
  sumigases: new Set(),
  sudematin: new Set([rifNormal(EMPRESAS.sumigases.rif)]),
};

const vacio = (ym: string): MesValery => ({
  ym, venta: 0, costo: 0, compra: 0, ventaBs: 0, costoBs: 0, compraBs: 0,
  renglones: 0, compras: 0, facturasDeNotas: 0, entreEmpresas: 0, consumoPropio: 0, sinMonto: 0,
});

/** Lo que un pedido «cierre» trajo, mes por mes (solo los meses con alguna fila). */
export function mesesDesdeValery(filas: Record<string, unknown>[], empresa: EmpresaId): MesValery[] {
  const meses = new Map<string, MesValery>();
  const mes = (fecha: string) => {
    const ym = fecha.slice(0, 7);
    let m = meses.get(ym);
    if (!m) { m = vacio(ym); meses.set(ym, m); }
    return m;
  };

  for (const f of filas) {
    const fecha = texto(f.fecha).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const tipo = texto(f.tipo).toUpperCase();
    const origen = texto(f.origen);

    if (origen === "venta") {
      if (!["FAC", "NET", "DEV"].includes(tipo)) continue;
      if (texto(f.anulado).toUpperCase() === "T") continue;
      const m = mes(fecha);
      const usd = num(f.neto_usd), costo = num(f.costo_usd);
      if (usd === null || costo === null) { m.sinMonto++; continue; }
      const signo = tipo === "DEV" ? -1 : 1;
      // La parte de una FAC que factura una nota de entrega ya se contó con la nota.
      const cantidad = num(f.cantidad) ?? 0;
      const deNotas = tipo === "FAC" ? Math.max(0, num(f.de_notas) ?? 0) : 0;
      const parteNota = deNotas > 0 ? (cantidad > 0 ? Math.min(1, deNotas / cantidad) : 1) : 0;
      const cuenta = 1 - parteNota;
      const clase = claseVenta(texto(f.cliente), empresa);
      if (clase === "entre_empresas") { m.entreEmpresas += signo * usd; continue; }
      if (clase === "consumo_propio") { m.consumoPropio += signo * usd; continue; }
      if (parteNota > 0) m.facturasDeNotas += usd * parteNota;
      if (cuenta <= 0) continue;
      m.venta += signo * cuenta * usd;
      m.costo += signo * cuenta * costo;
      m.ventaBs += signo * cuenta * (num(f.neto_bs) ?? 0);
      m.costoBs += signo * cuenta * (num(f.costo_bs) ?? 0);
      m.renglones++;
      continue;
    }

    if (origen === "compra") {
      const signo = tipo === "RCM" || tipo === "FCM" || tipo === "NDB" ? 1 : tipo === "DCM" || tipo === "NCR" ? -1 : 0;
      if (!signo) continue;
      if (tipo === "RCM" && texto(f.facturada).toUpperCase() === "T") continue;
      if (COMPRA_DEL_GRUPO[empresa].has(rifNormal(texto(f.rif)))) continue;
      const m = mes(fecha);
      const usd = num(f.neto_usd);
      if (usd === null) { m.sinMonto++; continue; }
      m.compra += signo * usd;
      m.compraBs += signo * (num(f.neto_bs) ?? 0);
      m.compras++;
    }
  }

  return [...meses.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((m) => ({
    ...m,
    venta: r2(m.venta), costo: r2(m.costo), compra: r2(m.compra),
    ventaBs: r2(m.ventaBs), costoBs: r2(m.costoBs), compraBs: r2(m.compraBs),
    facturasDeNotas: r2(m.facturasDeNotas), entreEmpresas: r2(m.entreEmpresas), consumoPropio: r2(m.consumoPropio),
  }));
}

/** Los meses que un rango cubre ENTEROS: del 1 al último día. Un mes a medias no se cierra. */
export function mesesCompletos(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  let [y, m] = desde.slice(0, 7).split("-").map(Number);
  if (Number(desde.slice(8, 10)) !== 1) { if (m === 12) { y++; m = 1; } else m++; }
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (ultimo > hasta) break;
    salida.push(ym);
    if (m === 12) { y++; m = 1; } else m++;
  }
  return salida;
}
