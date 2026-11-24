"use client";

import { useSyncExternalStore } from "react";
import { estadoMeses, fijarMesesCargados, suscribirMesesCargados, versionMesesCargados, type EstadoMeses } from "./historico-meses";
import { listarMesesCargados } from "./historico-meses-db";

/**
 * Para las pantallas que muestran el histórico: se vuelven a dibujar cuando
 * llegan o cambian los meses cerrados a mano. Devuelve un número que cambia
 * con ellos (sirve de dependencia en useMemo).
 */
export function useMesesCargados(): number {
  return useSyncExternalStore(suscribirMesesCargados, versionMesesCargados, () => 0);
}

/** «listo» cuando ya llegaron los meses de la base; antes, el histórico no se muestra. */
export function useEstadoHistorico(): EstadoMeses {
  return useSyncExternalStore(suscribirMesesCargados, estadoMeses, () => "cargando");
}

/** Vuelve a leer los meses cerrados desde la base (al entrar y después de guardar). */
export async function recargarMesesCargados() {
  fijarMesesCargados(await listarMesesCargados());
}
