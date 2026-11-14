// Lo que dice el movimiento del inventario: insights del Master.
//
// Pedido del usuario (14-11-2026): «que el inventario no solo sea para
// verificar existencia». Con las ventas que trae Valery al kardex (desde el
// corte) y la existencia de Macedonia, nueve respuestas:
//
//   1. Lo que más se vende        (US$ o unidades, en la ventana)
//   2. Lo que más rota            (salidas ÷ existencia de hoy)
//   3. Se acaba pronto            (quedan menos de 15 días al ritmo de venta)
//   4. Agotado y se sigue pidiendo (sin existencia y con salidas en la ventana)
//   5. Dormido                    (con existencia y sin una sola salida desde el corte)
//   6. De más                     (más de 180 días de inventario)
//   7. Concentración              (cuántos productos hacen el 80 % de lo vendido)
//   8. Tendencia                  (últimos 15 días contra los 15 anteriores)
//   9. Devoluciones               (lo que más se devolvió)
//
// Reglas:
//   · La ventana son los últimos 30 días, pero nunca antes del corte: antes
//     del corte no hay ventas en el kardex. Si hay menos, se dice cuántos.
//     «Dormido» mira todo lo que se le pasa (desde el corte, o los últimos 60
//     días si el corte es más viejo): `corte` es el primer día que se mira.
//   · Para cuánto se vende (1, 7, 8): solo ventas a clientes. Lo que va a la
//     otra empresa del grupo y el consumo propio no es venta (claseVenta).
//   · Para cuánto dura la existencia (2, 3, 4, 6): toda salida por venta,
//     también la del grupo: igual se lleva la mercancía.
//   · La devolución resta de lo vendido y de lo que salió.
//   · Fletes y servicios no son mercancía: no entran.
//   · Sin montos (quien no puede ver Ventas) se ordena por unidades.
//   · Nada se rellena: si no hay con qué calcular algo, va vacío y se dice.
//
// Pura, para probarla: el servidor le pasa los movimientos y los productos.

import { claseVenta } from "../valery/ventas.ts";
import type { EmpresaId } from "../ux/empresas.ts";

export const VENTANA_DIAS = 30;
export const DIAS_SE_ACABA = 15;
export const DIAS_DE_MAS = 180;
/** Lo que se considera inventario sano para 3 meses de venta (para calcular cuánto sobra). */
export const DIAS_SANO = 90;

export type MovVentaInv = {
  fecha: string;               // aaaa-mm-dd
  tipo: string;                // FAC | NET | DEV
  codigo: string;
  nombre: string;
  cantidad: number;            // en la unidad principal, siempre positiva
  montoUsd: number | null;     // neto sin IVA; null si no se puede ver o no vino
  cliente: string;
};

export type ProductoInv = { codigo: string; nombre: string; unidad: string; existencia: number; costo: number | null };

export type ItemInsight = {
  codigo: string; nombre: string; unidad: string;
  existencia: number;
  /** Ventas a clientes en la ventana (sin el grupo), netas de devoluciones. */
  unidades: number; ventaUsd: number | null;
  /** Toda salida por venta en la ventana (con el grupo), neta de devoluciones. */
  salidas: number;
  /** Días que dura la existencia al ritmo de salida (null: no sale o no hay existencia). */
  cobertura: number | null;
  /** Veces que la salida de la ventana cubre la existencia de hoy. */
  rotacion: number | null;
  /** Última salida por venta desde el corte (null: ninguna). */
  ultimaVenta: string | null;
  /** Existencia × costo (null sin costo). */
  valor: number | null;
  devueltas: number;
  /** Lo vendido en la ventana antes de restar devoluciones (todas las salidas por venta). */
  brutas: number;
  /** Lo devuelto en la ventana, en US$ (solo ventas a clientes; null sin montos). */
  devueltoUsd: number | null;
  /** Tendencia: ventas de los últimos 15 días menos las de los 15 anteriores (US$ o unidades). */
  cambio: number | null;
  /** Lo que sobra sobre 90 días de venta, a costo (null sin costo). */
  sobra: number | null;
  /** Parte de lo vendido (0–1). */
  parte: number | null;
};

export type Insights = {
  hoy: string; desde: string; diasVentana: number; conMontos: boolean; conCosto: boolean;
  /** Primer día de ventas que se mira (el corte, o 60 días atrás) y cuántos días van de ahí a hoy. */
  inicioDatos: string; diasConDatos: number;
  totalVendido: number;          // US$ o unidades, según conMontos
  productosConVenta: number;
  masVendido: ItemInsight[];
  rotacion: ItemInsight[];
  seAcaba: ItemInsight[];
  agotado: ItemInsight[];
  agotadoVendido: number;        // lo que se vendió de lo agotado en la ventana (US$ o unidades)
  dormido: ItemInsight[];
  dormidoValor: number | null;
  deMas: ItemInsight[];
  deMasSobra: number | null;
  /** Cuántos productos hacen el 80 % de lo vendido, y la lista hasta ahí. */
  pareto: ItemInsight[];
  sube: ItemInsight[]; baja: ItemInsight[];
  /** Hay al menos 30 días de ventas para comparar dos quincenas. */
  conTendencia: boolean;
  devoluciones: ItemInsight[];
  totalDevuelto: number;         // US$ (o unidades sin montos)
};

const MS_DIA = 86_400_000;
const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const menos = (iso: string, n: number) => new Date(dia(iso) - n * MS_DIA).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Fletes y servicios: se venden, pero no son mercancía con existencia. */
export const esServicio = (nombre: string) => /^\s*(FLETE|SERVICIO|TRANSPORTE)\b/i.test(nombre);

export function calcularInsights(
  movs: MovVentaInv[], productos: ProductoInv[],
  { hoy, corte, empresa, conMontos }: { hoy: string; corte: string; empresa: EmpresaId; conMontos: boolean },
): Insights {
  const inicioVentana = [menos(hoy, VENTANA_DIAS - 1), corte].reduce((a, b) => (a > b ? a : b));
  const diasVentana = Math.max(1, Math.round((dia(hoy) - dia(inicioVentana)) / MS_DIA) + 1);
  const diasConDatos = Math.max(0, Math.round((dia(hoy) - dia(corte)) / MS_DIA) + 1);
  const conTendencia = diasConDatos >= 30;
  const mitad = menos(hoy, 14);          // últimos 15 días: [mitad, hoy]
  const antes = menos(hoy, 29);          // los 15 anteriores: [antes, mitad)
  const conCosto = productos.some((p) => p.costo !== null);

  type Acum = { unidades: number; usd: number; salidas: number; devueltas: number; brutas: number; devUsd: number; ultima: string | null; reciente: number; previo: number };
  const acum = new Map<string, Acum>();
  const nombreDe = new Map<string, string>();
  const de = (c: string) => {
    let a = acum.get(c);
    if (!a) { a = { unidades: 0, usd: 0, salidas: 0, devueltas: 0, brutas: 0, devUsd: 0, ultima: null, reciente: 0, previo: 0 }; acum.set(c, a); }
    return a;
  };

  // Un servicio se reconoce por su nombre en el catálogo o en el movimiento.
  const servicios = new Set(productos.filter((p) => esServicio(p.nombre)).map((p) => p.codigo));
  for (const m of movs) {
    if (m.fecha < corte || m.fecha > hoy || esServicio(m.nombre) || servicios.has(m.codigo)) continue;
    const tipo = m.tipo.toUpperCase();
    if (!["FAC", "NET", "DEV"].includes(tipo)) continue;
    nombreDe.set(m.codigo, m.nombre);
    const a = de(m.codigo);
    const signo = tipo === "DEV" ? -1 : 1;
    if (signo > 0 && (!a.ultima || m.fecha > a.ultima)) a.ultima = m.fecha;
    const cliente = claseVenta(m.cliente, empresa) === "venta";
    const medida = conMontos ? (m.montoUsd ?? 0) : m.cantidad;
    // Tendencia: dos quincenas, solo ventas a clientes.
    if (cliente && m.fecha >= mitad) a.reciente += signo * medida;
    else if (cliente && m.fecha >= antes) a.previo += signo * medida;
    if (m.fecha < inicioVentana) continue;
    a.salidas += signo * m.cantidad;
    if (signo < 0) a.devueltas += m.cantidad; else a.brutas += m.cantidad;
    if (cliente) { a.unidades += signo * m.cantidad; a.usd += signo * (m.montoUsd ?? 0); if (signo < 0) a.devUsd += m.montoUsd ?? 0; }
  }

  const items: ItemInsight[] = [];
  const vistos = new Set<string>();
  const armar = (codigo: string, nombre: string, unidad: string, existencia: number, costo: number | null): ItemInsight => {
    const a = acum.get(codigo);
    const salidas = a ? Math.max(0, a.salidas) : 0;
    const diaria = salidas / diasVentana;
    const cobertura = diaria > 0 && existencia > 0 ? existencia / diaria : null;
    return {
      codigo, nombre, unidad, existencia,
      unidades: r4(a?.unidades ?? 0), ventaUsd: conMontos ? r2(a?.usd ?? 0) : null,
      salidas: r4(salidas),
      cobertura: cobertura === null ? null : Math.round(cobertura),
      rotacion: existencia > 0 && salidas > 0 ? Math.round((salidas / existencia) * 100) / 100 : null,
      ultimaVenta: a?.ultima ?? null,
      valor: costo !== null && existencia > 0 ? r2(existencia * costo) : null,
      devueltas: r4(a?.devueltas ?? 0),
      brutas: r4(a?.brutas ?? 0),
      devueltoUsd: conMontos ? r2(a?.devUsd ?? 0) : null,
      cambio: conTendencia && a ? r2(a.reciente - a.previo) : null,
      sobra: costo !== null && cobertura !== null && cobertura > DIAS_DE_MAS ? r2((existencia - diaria * DIAS_SANO) * costo) : null,
      parte: null,
    };
  };
  for (const p of productos) {
    if (esServicio(p.nombre)) continue;
    vistos.add(p.codigo);
    items.push(armar(p.codigo, p.nombre, p.unidad, p.existencia, p.costo));
  }
  // Lo vendido que no está en el catálogo de Macedonia también cuenta como venta.
  for (const [codigo] of acum) if (!vistos.has(codigo)) items.push(armar(codigo, nombreDe.get(codigo) ?? codigo, "", 0, null));

  const vendido = (i: ItemInsight) => (conMontos ? i.ventaUsd ?? 0 : i.unidades);
  const conVenta = items.filter((i) => vendido(i) > 0);
  const totalVendido = r2(conVenta.reduce((s, i) => s + vendido(i), 0));
  for (const i of conVenta) i.parte = totalVendido > 0 ? vendido(i) / totalVendido : null;
  const porVenta = [...conVenta].sort((a, b) => vendido(b) - vendido(a) || a.nombre.localeCompare(b.nombre, "es"));

  // Concentración: los que juntos hacen el 80 % de lo vendido.
  const pareto: ItemInsight[] = [];
  let acumulado = 0;
  for (const i of porVenta) {
    if (acumulado >= 0.8 * totalVendido) break;
    pareto.push(i); acumulado += vendido(i);
  }

  const agotado = items.filter((i) => i.existencia <= 0 && i.salidas > 0)
    .sort((a, b) => vendido(b) - vendido(a) || b.salidas - a.salidas);
  const dormido = items.filter((i) => i.existencia > 0 && i.ultimaVenta === null)
    .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || b.existencia - a.existencia);
  const deMas = items.filter((i) => i.cobertura !== null && i.cobertura > DIAS_DE_MAS)
    .sort((a, b) => (b.sobra ?? -1) - (a.sobra ?? -1) || (b.cobertura ?? 0) - (a.cobertura ?? 0));
  const suma = (xs: (number | null)[]) => (conCosto ? r2(xs.reduce<number>((s, x) => s + (x ?? 0), 0)) : null);

  return {
    hoy, desde: inicioVentana, diasVentana, conMontos, conCosto, inicioDatos: corte, diasConDatos,
    totalVendido, productosConVenta: conVenta.length,
    masVendido: porVenta,
    rotacion: items.filter((i) => i.rotacion !== null).sort((a, b) => (b.rotacion ?? 0) - (a.rotacion ?? 0)),
    seAcaba: items.filter((i) => i.cobertura !== null && i.cobertura < DIAS_SE_ACABA).sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0)),
    agotado, agotadoVendido: r2(agotado.reduce((s, i) => s + Math.max(0, vendido(i)), 0)),
    dormido, dormidoValor: suma(dormido.map((i) => i.valor)),
    deMas, deMasSobra: suma(deMas.map((i) => i.sobra)),
    pareto,
    sube: conTendencia ? items.filter((i) => (i.cambio ?? 0) > 0).sort((a, b) => (b.cambio ?? 0) - (a.cambio ?? 0)) : [],
    baja: conTendencia ? items.filter((i) => (i.cambio ?? 0) < 0).sort((a, b) => (a.cambio ?? 0) - (b.cambio ?? 0)) : [],
    conTendencia,
    // Lo que más se devolvió (en US$, o en unidades sin montos).
    devoluciones: items.filter((i) => i.devueltas > 0)
      .sort((a, b) => (conMontos ? (b.devueltoUsd ?? 0) - (a.devueltoUsd ?? 0) : b.devueltas - a.devueltas) || b.devueltas - a.devueltas),
    totalDevuelto: conMontos ? r2(items.reduce((s, i) => s + (i.devueltoUsd ?? 0), 0)) : r4(items.reduce((s, i) => s + i.devueltas, 0)),
  };
}
