// Ventas: lo que Valery facturó, leído del kardex (la parte pura).
//
// Las ventas entran al kardex por el Puente Valery (cada hora) o por el Excel,
// con el mismo importador (lib/inventory/ventas-valery.ts). Cada renglón queda
// en movimientos_inventario con su tipo, documento, cliente y monto en dólares
// (neto sin IVA a la tasa de su día). Aquí se resumen para el apartado Ventas.
//
// Mismas reglas que el histórico (scripts/historico-valery.py):
//   · FAC y NET suman; la DEV resta;
//   · la factura de una nota no está en el kardex (no descuenta dos veces), así
//     que tampoco se cuenta dos veces aquí;
//   · lo que la empresa le vende a la otra del grupo, o a sí misma (consumo
//     interno), NO es venta: se aparta y se dice cuánto fue.

import type { TipoDoc } from "../inventory/ventas-valery.ts";
import { clienteNormal } from "../inventory/ventas-valery.ts";
import { EMPRESAS, type EmpresaId } from "../ux/empresas.ts";

/** Un renglón de venta tal como está en el kardex. */
export type MovVenta = {
  fecha: string;
  tipo: TipoDoc;
  /** Como lo guarda el importador: «FAC 0000001433». */
  documento: string;
  cliente: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Sin signo, como en el kardex: la DEV resta por ser tipo DEV. Null = cargado sin monto. */
  montoUsd: number | null;
};

export type ClaseVenta = "venta" | "entre_empresas" | "consumo_propio";

/** ¿Es una venta de verdad, una venta a la otra empresa del grupo o consumo interno? */
export function claseVenta(cliente: string, empresa: EmpresaId): ClaseVenta {
  const c = clienteNormal(cliente);
  if (EMPRESAS[empresa].clienteEnValery.test(c)) return "consumo_propio";
  const otra = (Object.keys(EMPRESAS) as EmpresaId[]).find((e) => e !== empresa);
  if (otra && EMPRESAS[otra].clienteEnValery.test(c)) return "entre_empresas";
  return "venta";
}

export type DocVenta = {
  clave: string;
  fecha: string;
  tipo: TipoDoc;
  documento: string;
  cliente: string;
  renglones: number;
  /** Con signo: la devolución en negativo. */
  totalUsd: number;
};

export type ProdVenta = { codigo: string; nombre: string; cantidad: number; totalUsd: number; documentos: number };
export type CliVenta = { cliente: string; documentos: number; totalUsd: number; ultima: string };
export type Apartado = { renglones: number; documentos: number; totalUsd: number };

export type ResumenVentas = {
  /** Facturas y notas menos devoluciones. */
  netoUsd: number;
  brutoUsd: number;
  devolucionesUsd: number;
  /** Facturas y notas (sin las devoluciones). */
  ventas: number;
  clientes: number;
  documentos: DocVenta[];
  productos: ProdVenta[];
  porCliente: CliVenta[];
  entreEmpresas: Apartado;
  consumoPropio: Apartado;
  /** Renglones sin monto en dólares: no suman a nada y se avisa cuántos son. */
  sinMonto: number;
};

const signo = (t: TipoDoc) => (t === "DEV" ? -1 : 1);

export function resumirVentas(movs: MovVenta[], empresa: EmpresaId): ResumenVentas {
  const docs = new Map<string, DocVenta>();
  const prods = new Map<string, ProdVenta & { docs: Set<string> }>();
  const clis = new Map<string, CliVenta & { docs: Set<string> }>();
  const apartados = { entre_empresas: { renglones: 0, docs: new Set<string>(), totalUsd: 0 }, consumo_propio: { renglones: 0, docs: new Set<string>(), totalUsd: 0 } };
  let bruto = 0, devoluciones = 0, sinMonto = 0;

  for (const m of movs) {
    const clave = `${m.tipo}|${m.documento}`;
    const usd = (m.montoUsd ?? 0) * signo(m.tipo);
    const clase = claseVenta(m.cliente, empresa);
    if (clase !== "venta") {
      const a = apartados[clase];
      a.renglones++; a.docs.add(clave); a.totalUsd += usd;
      continue;
    }
    if (m.montoUsd === null) sinMonto++;
    if (m.tipo === "DEV") devoluciones += m.montoUsd ?? 0; else bruto += m.montoUsd ?? 0;

    const d = docs.get(clave) ?? { clave, fecha: m.fecha, tipo: m.tipo, documento: m.documento.replace(/^(FAC|NET|DEV)\s+/, ""), cliente: m.cliente, renglones: 0, totalUsd: 0 };
    d.renglones++; d.totalUsd += usd;
    docs.set(clave, d);

    const p = prods.get(m.codigo) ?? { codigo: m.codigo, nombre: m.nombre, cantidad: 0, totalUsd: 0, documentos: 0, docs: new Set<string>() };
    p.cantidad += m.cantidad * signo(m.tipo); p.totalUsd += usd; p.docs.add(clave);
    prods.set(m.codigo, p);

    const nc = clienteNormal(m.cliente) || "(sin cliente)";
    const c = clis.get(nc) ?? { cliente: m.cliente || "(sin cliente)", documentos: 0, totalUsd: 0, ultima: m.fecha, docs: new Set<string>() };
    c.totalUsd += usd; c.docs.add(clave); if (m.fecha > c.ultima) c.ultima = m.fecha;
    clis.set(nc, c);
  }

  const documentos = [...docs.values()];
  const ventas = documentos.filter((d) => d.tipo !== "DEV");
  const ap = (a: (typeof apartados)["entre_empresas"]): Apartado => ({ renglones: a.renglones, documentos: a.docs.size, totalUsd: a.totalUsd });
  return {
    netoUsd: bruto - devoluciones,
    brutoUsd: bruto,
    devolucionesUsd: devoluciones,
    ventas: ventas.length,
    clientes: new Set(ventas.map((d) => clienteNormal(d.cliente))).size,
    documentos,
    productos: [...prods.values()].map(({ docs: s, ...p }) => ({ ...p, documentos: s.size })),
    porCliente: [...clis.values()].map(({ docs: s, ...c }) => ({ ...c, documentos: s.size })),
    entreEmpresas: ap(apartados.entre_empresas),
    consumoPropio: ap(apartados.consumo_propio),
    sinMonto,
  };
}
