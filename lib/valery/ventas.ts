// Ventas: lo que Valery facturó, leído del kardex (la parte pura).
//
// Las ventas entran al kardex por el Puente Valery (cada hora) o por el Excel,
// con el mismo importador (lib/inventory/ventas-valery.ts). Cada renglón queda
// en movimientos_inventario con su tipo, documento, cliente y monto en dólares
// (neto sin IVA a la tasa de su día). Aquí se resumen para el apartado Ventas.
//
// Las reglas (pedido del Owner, 2026-11-04: «todas las facturas son ventas
// per se» y «no todas las notas de entrega son ventas efectivas»):
//   · toda FAC suma, también la que cobra notas de entrega (esa viene de
//     ventas_facturas_notas: es venta, pero la mercancía salió con la nota);
//   · la NET suma, salvo que:
//       – ya la cobró una factura que está aquí: suma la factura, no la nota;
//       – está en Cuentas por Cobrar y no se ha cobrado: es a crédito. Cuando se
//         cobra (o se factura), cuenta;
//   · la DEV resta. Dice qué nota o factura devuelve, y esa dice que fue
//     devuelta (toda o en parte): marcarDevoluciones. Solo es una marca: lo
//     vendido no cambia;
//   · lo que la empresa le vende a la otra del grupo, o a sí misma (consumo
//     interno), NO es venta: se aparta y se dice cuánto fue.

import type { TipoDoc } from "../inventory/ventas-valery.ts";
import { clienteNormal } from "../inventory/ventas-valery.ts";
import { numeroDocumento } from "../finanzas/valery-cuentas.ts";
import { EMPRESAS, type EmpresaId } from "../ux/empresas.ts";

/** Un renglón de venta tal como está en el kardex. */
export type MovVenta = {
  fecha: string;
  /** hh:mm:ss en que se hizo el documento en Valery. Null: entró por Excel o antes del agente 1.0.4. */
  hora?: string | null;
  tipo: TipoDoc;
  /** Como lo guarda el importador: «FAC 0000001433». */
  documento: string;
  cliente: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Sin signo, como en el kardex: la DEV resta por ser tipo DEV. Null = cargado sin monto. */
  montoUsd: number | null;
  /** FAC: cobra notas de entrega ya registradas (viene de ventas_facturas_notas, no del kardex). */
  deNotas?: boolean;
  /** FAC que cobra notas: cuáles y cómo están en Cuentas por Cobrar (lo pone `marcarNotas`). */
  cobra?: NotaCobrada[];
  /** NET: la factura que la cobró, «FAC 0000001652». */
  facturadaCon?: string | null;
  /** NET: qué es (lo pone `marcarNotas`). Sin marca, una venta como cualquiera. */
  nota?: EstadoNota;
  /** DEV: lo que devuelve y cómo quedó (lo pone `marcarDevoluciones`). */
  devuelve?: Devuelto[];
  /** NET o FAC: las devoluciones que la devolvieron (lo pone `marcarDevoluciones`). */
  devuelta?: Devuelta | null;
};

/**
 * Lo que devuelve una DEV: «NET 0000009511» y si esa nota quedó devuelta toda
 * («total»), en parte, o null si no está en Macedonia (es de antes del corte).
 */
export type Devuelto = { documento: string; estado: "total" | "parcial" | null };

/** Una nota o factura devuelta: por cuáles DEV («752») y si fue toda o en parte. */
export type Devuelta = { devs: string[]; parcial: boolean };

/** Un renglón de una DEV con lo que devuelve, de cualquier fecha. */
export type RenglonDevuelto = { documento: string; devuelve: string; codigo: string; cantidad: number };
/** Un renglón de lo vendido (NET o FAC), de cualquier fecha. */
export type RenglonVendido = { documento: string; codigo: string; cantidad: number };

const sinCeros = (documento: string) => documento.replace(/^(FAC|NET|DEV)\s+0*/, "") || "0";

/**
 * Cómo quedó cada nota o factura devuelta. Toda: cada código vendido volvió
 * completo (los códigos distinguen mayúsculas, como en Valery). En parte: falta
 * algo. Una nota que no está en `vendidos` no tiene con qué compararse: queda
 * fuera (su DEV la nombra sin estado).
 */
export function estadoDevoluciones(vendidos: RenglonVendido[], devueltos: RenglonDevuelto[]): Map<string, Devuelta> {
  const sumar = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const vendido = new Map<string, Map<string, number>>();
  for (const v of vendidos) sumar(vendido.get(v.documento) ?? vendido.set(v.documento, new Map()).get(v.documento)!, v.codigo, v.cantidad);
  const devuelto = new Map<string, { devs: Set<string>; por: Map<string, number> }>();
  for (const d of devueltos) {
    if (!vendido.has(d.devuelve)) continue;
    const e = devuelto.get(d.devuelve) ?? devuelto.set(d.devuelve, { devs: new Set(), por: new Map() }).get(d.devuelve)!;
    e.devs.add(sinCeros(d.documento));
    sumar(e.por, d.codigo, d.cantidad);
  }
  const estado = new Map<string, Devuelta>();
  for (const [doc, e] of devuelto) {
    const parcial = [...vendido.get(doc)!].some(([codigo, cant]) => (e.por.get(codigo) ?? 0) < cant - 1e-9);
    estado.set(doc, { devs: [...e.devs].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)), parcial });
  }
  return estado;
}

/**
 * Marca cada DEV con lo que devuelve (`devuelveDe`: «DEV …» → sus «NET …») y
 * cada nota o factura devuelta con sus DEV (`estado`, de estadoDevoluciones).
 */
export function marcarDevoluciones(movs: MovVenta[], devuelveDe: Map<string, string[]>, estado: Map<string, Devuelta>): MovVenta[] {
  return movs.map((m) => {
    if (m.tipo === "DEV") {
      const refs = devuelveDe.get(m.documento);
      if (!refs?.length) return m;
      const devuelve = [...new Set(refs)].sort().map((documento): Devuelto => {
        const e = estado.get(documento);
        return { documento, estado: e ? (e.parcial ? "parcial" : "total") : null };
      });
      return { ...m, devuelve };
    }
    const e = estado.get(m.documento);
    return e ? { ...m, devuelta: e } : m;
  });
}

/**
 * facturada: la cobró una factura que está registrada (suma la factura).
 * a_credito: está en Cuentas por Cobrar sin cobrar. credito_cobrado: estaba a
 * crédito y ya se cobró: suma.
 */
export type EstadoNota = "facturada" | "a_credito" | "credito_cobrado";

/**
 * Una nota que cobró una factura. `cxc`: saldada (liquidada o en cero en
 * Cuentas por Cobrar), por_liquidar (sigue abierta allá: la factura la cobró,
 * falta liquidarla) o null (nunca estuvo en la cartera).
 */
export type NotaCobrada = { numero: string; cxc: "saldada" | "por_liquidar" | null };

/** «NET 0000009215» → «9215». Sin el «NET »: numeroDocumento prueba «NE» antes que «NET» y daría «T0000009215». */
const numeroNota = (documento: string) => numeroDocumento(documento.replace(/^NET\s+/, ""));

/**
 * Marca cada nota de entrega: si la cobró una factura de `facturas` (solo las
 * que existen: una nota cuya factura no se ha traído todavía sigue sumando,
 * para no perder la venta) y si está en Cuentas por Cobrar (`enCxc`: número
 * de la NE → si ya se cobró). Y a cada factura que cobra notas, cuáles
 * (`notasDe`: «FAC 0000001653» → sus «NET …») y cómo está cada una en la cartera.
 */
export function marcarNotas(movs: MovVenta[], facturas: Set<string>, enCxc: Map<string, boolean>, notasDe: Map<string, string[]> = new Map()): MovVenta[] {
  return movs.map((m) => {
    if (m.tipo === "FAC" && m.deNotas) {
      const cobra = [...new Set((notasDe.get(m.documento) ?? []).map(numeroNota))]
        .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
        .map((numero): NotaCobrada => {
          const c = enCxc.get(numero);
          return { numero, cxc: c === undefined ? null : c ? "saldada" : "por_liquidar" };
        });
      return { ...m, cobra };
    }
    if (m.tipo !== "NET") return m;
    if (m.facturadaCon && facturas.has(m.facturadaCon)) return { ...m, nota: "facturada" };
    const cobrada = enCxc.get(numeroNota(m.documento));
    return cobrada === undefined ? m : { ...m, nota: cobrada ? "credito_cobrado" : "a_credito" };
  });
}

/** Valery guarda «&» como «&amp;» en los nombres. */
export const nombreValery = (s: string) => s.replace(/&amp;/g, "&");

/** «15:42:07» → «3:42 p. m.», como la hora de la tasa BCV. Sin hora (entró por Excel): «—». */
export function horaVista(h: string | null): string {
  if (!h) return "—";
  const [hh, mm] = h.split(":").map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}

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
  hora: string | null;
  tipo: TipoDoc;
  documento: string;
  cliente: string;
  renglones: number;
  /** Con signo: la devolución en negativo. */
  totalUsd: number;
  /** Si suma a lo vendido. Las notas facturadas y las que están a crédito, no. */
  cuenta: boolean;
  nota: EstadoNota | null;
  /** NET facturada: con qué factura. */
  facturadaCon: string | null;
  /** FAC que cobra notas de entrega. */
  deNotas: boolean;
  /** Y cuáles, con su estado en Cuentas por Cobrar. */
  cobra: NotaCobrada[];
  /** DEV: lo que devuelve. */
  devuelve: Devuelto[];
  /** NET o FAC devuelta: por cuáles DEV. */
  devuelta: Devuelta | null;
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
  /** Notas en Cuentas por Cobrar sin cobrar: no son venta todavía. */
  aCredito: Apartado;
  /** Notas que ya cobró una factura del registro: la venta es la factura. */
  facturadas: Apartado;
  /** Renglones sin monto en dólares: no suman a nada y se avisa cuántos son. */
  sinMonto: number;
};

const signo = (t: TipoDoc) => (t === "DEV" ? -1 : 1);

export function resumirVentas(movs: MovVenta[], empresa: EmpresaId): ResumenVentas {
  const docs = new Map<string, DocVenta>();
  const prods = new Map<string, ProdVenta & { docs: Set<string> }>();
  const clis = new Map<string, CliVenta & { docs: Set<string> }>();
  const nuevo = () => ({ renglones: 0, docs: new Set<string>(), totalUsd: 0 });
  const apartados = { entre_empresas: nuevo(), consumo_propio: nuevo(), a_credito: nuevo(), facturada: nuevo() };
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
    const nota = m.nota ?? null;
    const cuenta = nota !== "facturada" && nota !== "a_credito";
    const d = docs.get(clave) ?? {
      clave, fecha: m.fecha, hora: m.hora ?? null, tipo: m.tipo, documento: m.documento.replace(/^(FAC|NET|DEV)\s+/, ""), cliente: m.cliente,
      renglones: 0, totalUsd: 0, cuenta, nota, facturadaCon: m.facturadaCon ?? null, deNotas: !!m.deNotas, cobra: m.cobra ?? [],
      devuelve: m.devuelve ?? [], devuelta: m.devuelta ?? null,
    };
    d.renglones++; d.totalUsd += usd;
    if (m.hora && (!d.hora || m.hora < d.hora)) d.hora = m.hora;
    docs.set(clave, d);
    // La nota que no es venta (todavía): se ve en la lista, pero no suma.
    if (!cuenta) {
      const a = apartados[nota === "a_credito" ? "a_credito" : "facturada"];
      a.renglones++; a.docs.add(clave); a.totalUsd += usd;
      continue;
    }

    if (m.montoUsd === null) sinMonto++;
    if (m.tipo === "DEV") devoluciones += m.montoUsd ?? 0; else bruto += m.montoUsd ?? 0;

    const p = prods.get(m.codigo) ?? { codigo: m.codigo, nombre: m.nombre, cantidad: 0, totalUsd: 0, documentos: 0, docs: new Set<string>() };
    p.cantidad += m.cantidad * signo(m.tipo); p.totalUsd += usd; p.docs.add(clave);
    prods.set(m.codigo, p);

    const nc = clienteNormal(m.cliente) || "(sin cliente)";
    const c = clis.get(nc) ?? { cliente: m.cliente || "(sin cliente)", documentos: 0, totalUsd: 0, ultima: m.fecha, docs: new Set<string>() };
    c.totalUsd += usd; c.docs.add(clave); if (m.fecha > c.ultima) c.ultima = m.fecha;
    clis.set(nc, c);
  }

  const documentos = [...docs.values()];
  const ventas = documentos.filter((d) => d.tipo !== "DEV" && d.cuenta);
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
    aCredito: ap(apartados.a_credito),
    facturadas: ap(apartados.facturada),
    sinMonto,
  };
}
