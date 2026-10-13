"use client";

// Lee una vez, al entrar al panel, los meses del histórico cerrados a mano,
// para que Dashboard, ROI, Reportes y Matrices los cuenten (lib/ux/historico-meses.ts).

import { useEffect } from "react";
import { recargarMesesCargados } from "@/lib/ux/use-meses-cargados";

export function CargarMesesHistorico() {
  useEffect(() => { void recargarMesesCargados(); }, []);
  return null;
}
