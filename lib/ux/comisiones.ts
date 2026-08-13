"use client";

// Comisiones y bonos.
//
// COMISIÓN: cada vendedor cobra un % sobre SUS PROPIAS ventas (no sobre el total de la
// tienda). Las ventas se le asignan por código de documento (NET / FAC).
//   · Vendedor Junior : 0,5 % fijo
//   · Vendedor Senior : 4 % de referencia, ajustable a mano por Admin/Owner
//
// BONO: % sobre la UTILIDAD del período (después de gastos). No es fijo; se define
// por trabajador y lo ajustan Admin/Owner. Aplica a todos los empleados.

import { useEffect, useState } from "react";

export type TipoTrabajador = "junior" | "senior" | "otro";

export const PCT_DEFECTO: Record<TipoTrabajador, number> = {
  junior: 0.5,
  senior: 4,
  otro: 0,
};

export type Trabajador = {
  id: string;
  nombre: string;
  empresa: string;
  tipo: TipoTrabajador;
  /** % de comisión sobre sus propias ventas. */
  pctComision: number;
  /** % de bono sobre la utilidad del período. */
  pctBono: number;
  activo: boolean;
};

/** Venta asignada a un vendedor, identificada por su documento (NET/FAC). */
export type VentaAsignada = {
  id: string;
  trabajadorId: string;
  empresa: string;
  tipoDoc: "NET" | "FAC";
  documento: string;
  fecha: string; // ISO
  montoUsd: number;
  cliente?: string;
};

const K_TRAB = "sumi:trabajadores";
const K_VENT = "sumi:ventas-asignadas";
const EV = "sumi:comisiones";

function read<T>(k: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(k) || "[]") as T[];
  } catch {
    return [];
  }
}
function write<T>(k: string, v: T[]) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EV));
}

export const getTrabajadores = () => read<Trabajador>(K_TRAB);
export const getVentasAsignadas = () => read<VentaAsignada>(K_VENT);

export function addTrabajador(t: Omit<Trabajador, "id">): Trabajador {
  const nuevo = { ...t, id: `trb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  write(K_TRAB, [nuevo, ...getTrabajadores()]);
  return nuevo;
}
export function updateTrabajador(id: string, patch: Partial<Trabajador>) {
  write(K_TRAB, getTrabajadores().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}
export function removeTrabajador(id: string) {
  write(K_TRAB, getTrabajadores().filter((t) => t.id !== id));
  write(K_VENT, getVentasAsignadas().filter((v) => v.trabajadorId !== id));
}

export function addVentaAsignada(v: Omit<VentaAsignada, "id">): { ok: boolean; error?: string } {
  const todas = getVentasAsignadas();
  // Un mismo documento no puede asignarse dos veces (evita comisión doble).
  const dup = todas.find((x) => x.empresa === v.empresa && x.tipoDoc === v.tipoDoc && x.documento === v.documento);
  if (dup) return { ok: false, error: `El documento ${v.tipoDoc} ${v.documento} ya está asignado.` };
  write(K_VENT, [{ ...v, id: `vta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }, ...todas]);
  return { ok: true };
}
export function removeVentaAsignada(id: string) {
  write(K_VENT, getVentasAsignadas().filter((v) => v.id !== id));
}

export type CalculoTrabajador = {
  trabajador: Trabajador;
  ventas: number;
  docs: number;
  comision: number;
  bono: number;
  total: number;
};

/** Comisión = ventas propias × %. Bono = utilidad del período × %. */
export function calcular(
  trabajadores: Trabajador[],
  ventas: VentaAsignada[],
  utilidadPeriodo: number,
  mes?: string,
): CalculoTrabajador[] {
  return trabajadores
    .filter((t) => t.activo)
    .map((t) => {
      const suyas = ventas.filter((v) => v.trabajadorId === t.id && (!mes || v.fecha.startsWith(mes)));
      const total = suyas.reduce((a, v) => a + v.montoUsd, 0);
      const comision = (total * t.pctComision) / 100;
      const bono = (Math.max(0, utilidadPeriodo) * t.pctBono) / 100;
      return {
        trabajador: t,
        ventas: Math.round(total * 100) / 100,
        docs: suyas.length,
        comision: Math.round(comision * 100) / 100,
        bono: Math.round(bono * 100) / 100,
        total: Math.round((comision + bono) * 100) / 100,
      };
    });
}

export function useComisiones(empresa?: string) {
  const [state, setState] = useState<{ trabajadores: Trabajador[]; ventas: VentaAsignada[]; ready: boolean }>({
    trabajadores: [],
    ventas: [],
    ready: false,
  });
  useEffect(() => {
    const load = () => {
      const t = getTrabajadores();
      const v = getVentasAsignadas();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        trabajadores: empresa ? t.filter((x) => x.empresa === empresa) : t,
        ventas: empresa ? v.filter((x) => x.empresa === empresa) : v,
        ready: true,
      });
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
