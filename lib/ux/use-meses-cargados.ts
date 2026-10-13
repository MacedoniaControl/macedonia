"use client";

import { useSyncExternalStore } from "react";
import { fijarMesesCargados, suscribirMesesCargados, versionMesesCargados } from "./historico-meses";
import { listarMesesCargados } from "./historico-meses-db";

/**
 * Para las pantallas que muestran el histórico: se vuelven a dibujar cuando
 * llegan o cambian los meses cerrados a mano. Devuelve un número que cambia
 * con ellos (sirve de dependencia en useMemo).
 */
export function useMesesCargados(): number {
  return useSyncExternalStore(suscribirMesesCargados, versionMesesCargados, () => 0);
}

/** Vuelve a leer los meses cerrados desde la base (al entrar y después de guardar). */
export async function recargarMesesCargados() {
  fijarMesesCargados(await listarMesesCargados());
}
