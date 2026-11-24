"use client";

// Lee una vez, al entrar al panel, los meses del histórico cerrados o leídos de
// Valery, para que Dashboard, ROI, Reportes y Matrices los cuenten
// (lib/ux/historico-meses.ts). Si la lectura falla, reintenta; si sigue
// fallando, las pantallas lo dicen en vez de mostrar las cifras del Excel.

import { useEffect } from "react";
import { marcarFalloMeses } from "@/lib/ux/historico-meses";
import { recargarMesesCargados } from "@/lib/ux/use-meses-cargados";

const ESPERAS_MS = [2000, 5000, 10000];

export function CargarMesesHistorico() {
  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const intentar = async (n: number) => {
      try {
        await recargarMesesCargados();
      } catch {
        if (!vivo) return;
        if (n < ESPERAS_MS.length) reloj = setTimeout(() => void intentar(n + 1), ESPERAS_MS[n]);
        else marcarFalloMeses();
      }
    };
    void intentar(0);
    return () => { vivo = false; clearTimeout(reloj); };
  }, []);
  return null;
}
