"use client";

// Gastos — alimentan el Estado de Resultado.
// Catálogo de PARTIDAS y CATEGORÍAS extraído del EdR real de Sumigases 2024
// ("III PARTE MATRIZ EDO DE RESULTADO.xlsx"). El mapeo partida→categoría se dedujo
// verificando que las partidas sumaran exactamente cada categoría de la hoja GLOBAL.
//
//   VENTAS − COSTO DE VENTA = UTILIDAD BRUTA − GASTOS = UTILIDAD − BONO = UTILIDAD TOTAL

import { useEffect, useState } from "react";

export type CategoriaGasto =
  | "Alquileres"
  | "Gastos operativos"
  | "Gastos de vehículos"
  | "Sueldos, salarios y comisiones"
  | "Impuestos y gastos bancarios";

export const CATEGORIAS: CategoriaGasto[] = [
  "Alquileres",
  "Gastos operativos",
  "Gastos de vehículos",
  "Sueldos, salarios y comisiones",
  "Impuestos y gastos bancarios",
];

/** Partidas del EdR, cada una con su categoría. */
export const PARTIDAS: { nombre: string; categoria: CategoriaGasto }[] = [
  { nombre: "Alquiler tienda", categoria: "Alquileres" },

  { nombre: "Actualizaciones, permisologías e informes", categoria: "Gastos operativos" },
  { nombre: "Aparatos o dispositivos electrónicos", categoria: "Gastos operativos" },
  { nombre: "Artículos de limpieza y suministros", categoria: "Gastos operativos" },
  { nombre: "Artículos de oficina, papelería y consumibles", categoria: "Gastos operativos" },
  { nombre: "Asistencia tecnológica", categoria: "Gastos operativos" },
  { nombre: "Comida y refrigerios", categoria: "Gastos operativos" },
  { nombre: "Consumo interno", categoria: "Gastos operativos" },
  { nombre: "Dotación uniformes", categoria: "Gastos operativos" },
  { nombre: "Gastos caja", categoria: "Gastos operativos" },
  { nombre: "Gastos de publicidad", categoria: "Gastos operativos" },
  { nombre: "Gastos médicos", categoria: "Gastos operativos" },
  { nombre: "Gastos de representación", categoria: "Gastos operativos" },
  { nombre: "Honorarios profesionales", categoria: "Gastos operativos" },
  { nombre: "Implementos de seguridad e higiene", categoria: "Gastos operativos" },
  { nombre: "Mantenimiento y reparación de tienda", categoria: "Gastos operativos" },
  { nombre: "Otros gastos", categoria: "Gastos operativos" },
  { nombre: "Pólizas", categoria: "Gastos operativos" },
  { nombre: "Servicios contratados", categoria: "Gastos operativos" },

  { nombre: "Gastos de vehículos", categoria: "Gastos de vehículos" },
  { nombre: "Gastos de fletes", categoria: "Gastos de vehículos" },

  { nombre: "Nómina directores", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "Nómina personal administrativo y operativo", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "Comisiones vendedores", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "Liquidación", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "Vacaciones", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "Utilidades", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "FAOV", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "IVSS", categoria: "Sueldos, salarios y comisiones" },
  { nombre: "INCES", categoria: "Sueldos, salarios y comisiones" },

  { nombre: "Alcaldía", categoria: "Impuestos y gastos bancarios" },
  { nombre: "SENIAT", categoria: "Impuestos y gastos bancarios" },
  { nombre: "Gastos bancarios", categoria: "Impuestos y gastos bancarios" },
  { nombre: "Gastos IGTF", categoria: "Impuestos y gastos bancarios" },
];

export function categoriaDe(partida: string): CategoriaGasto {
  return PARTIDAS.find((p) => p.nombre === partida)?.categoria ?? "Gastos operativos";
}

export const TIPOS_TRANSACCION = ["Transferencia", "Efectivo", "Punto de venta", "Cheque", "Otro"];

export type Gasto = {
  id: string;
  fecha: string; // ISO
  empresa: string;
  partida: string;
  categoria: CategoriaGasto;
  /** Importe en la moneda capturada. */
  monto: number;
  moneda: "USD" | "BS";
  /** Tasa usada para convertir cuando la moneda es BS. */
  tasa?: number;
  montoUsd: number;
  beneficiario?: string;
  tipoTransaccion?: string;
  documento?: string;
  nota?: string;
  usuario: string;
};

const KEY = "sumi:gastos";
const EV = "sumi:gastos";

export function getGastos(): Gasto[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Gasto[];
  } catch {
    return [];
  }
}

function save(list: Gasto[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EV));
}

export function addGasto(g: Omit<Gasto, "id" | "categoria" | "montoUsd">): Gasto {
  const montoUsd = g.moneda === "USD" ? g.monto : g.tasa && g.tasa > 0 ? g.monto / g.tasa : 0;
  const nuevo: Gasto = {
    ...g,
    id: `gto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    categoria: categoriaDe(g.partida),
    montoUsd: Math.round(montoUsd * 100) / 100,
  };
  save([nuevo, ...getGastos()]);
  return nuevo;
}

export function removeGasto(id: string) {
  save(getGastos().filter((g) => g.id !== id));
}

/** Total en USD por categoría, para el bloque GASTOS del Estado de Resultado. */
export function totalesPorCategoria(gastos: Gasto[]): Record<CategoriaGasto, number> {
  const out = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<CategoriaGasto, number>;
  gastos.forEach((g) => {
    out[g.categoria] = (out[g.categoria] ?? 0) + g.montoUsd;
  });
  return out;
}

export function useGastos(empresa?: string) {
  const [state, setState] = useState<{ gastos: Gasto[]; ready: boolean }>({ gastos: [], ready: false });
  useEffect(() => {
    const load = () => {
      const all = getGastos();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ gastos: empresa ? all.filter((g) => g.empresa === empresa) : all, ready: true });
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
