"use client";

// Movimientos de inventario (kardex). Estructura definida por Greeg:
//
//   MOVIMIENTOS DE INVENTARIO
//   ├── INGRESO          → Compras · Ingresos manuales
//   └── SALIDA           → Ventas  · Salidas manuales
//
// Cada unidad que entra o sale deja rastro (origen, documento, usuario, motivo),
// para que el Owner pueda auditar. Hoy persiste en el navegador; con el backend
// pasa a Postgres sin cambiar la forma de los datos.

import { useEffect, useState } from "react";

export type Direccion = "entrada" | "salida";
/** venta/compra vienen de documentos o del export de Valery; manual lo registra un usuario. */
export type OrigenMov = "venta" | "compra" | "manual";

export type Movimiento = {
  id: string;
  fecha: string; // ISO (YYYY-MM-DD)
  empresa: string;
  direccion: Direccion;
  origen: OrigenMov;
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Obligatorio en movimientos manuales: por qué se ajustó. */
  motivo?: string;
  /** N° de nota de entrega, factura o archivo de importación que lo originó. */
  documento?: string;
  usuario: string;
};

export const MOTIVOS_ENTRADA = [
  "Ingreso manual por compra",
  "Devolución de cliente",
  "Traslado entre almacenes",
  "Corrección de conteo",
  "Otro",
];
export const MOTIVOS_SALIDA = [
  "Salida manual por venta",
  "Merma / daño",
  "Traslado entre almacenes",
  "Consumo interno",
  "Corrección de conteo",
  "Otro",
];

const KEY = "sumi:inv-movs";
const EV = "sumi:inv-movs";

export function getMovimientos(): Movimiento[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Movimiento[];
  } catch {
    return [];
  }
}

function save(list: Movimiento[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EV));
}

export function addMovimiento(m: Omit<Movimiento, "id">): Movimiento {
  const nuevo: Movimiento = { ...m, id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  save([nuevo, ...getMovimientos()]);
  return nuevo;
}

/** Revierte (elimina) un movimiento; se usará al borrar un archivo importado por error. */
export function removeMovimiento(id: string) {
  save(getMovimientos().filter((m) => m.id !== id));
}

/** Efecto neto de los movimientos sobre un código: entradas − salidas. */
export function netoPorCodigo(movs: Movimiento[], codigo: string): number {
  return movs.reduce((acc, m) => {
    if (m.codigo !== codigo) return acc;
    return acc + (m.direccion === "entrada" ? m.cantidad : -m.cantidad);
  }, 0);
}

export function useMovimientos(empresa?: string) {
  const [state, setState] = useState<{ movs: Movimiento[]; ready: boolean }>({ movs: [], ready: false });
  useEffect(() => {
    const load = () => {
      const all = getMovimientos();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ movs: empresa ? all.filter((m) => m.empresa === empresa) : all, ready: true });
    };
    load();
    window.addEventListener(EV, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EV, load);
      window.removeEventListener("storage", load);
    };
  }, [empresa]);
  return state;
}
