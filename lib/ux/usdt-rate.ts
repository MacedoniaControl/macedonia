"use client";

// La tasa USDT en la pantalla: la de la BASE, la misma para todos (igual que
// la Tasa BCV, lib/ux/bcv-rate.ts). La base la trae cada 30 minutos; aquí se
// lee una vez por página, compartida entre componentes, y de nuevo cada 5.

import { useEffect, useState } from "react";
import { actualizarUsdtAhora, tasaUsdtVigente, type TasaUsdt } from "@/lib/usdt/tasa-db";

const CADA = 5 * 60_000;
/** La base la pide cada 30 minutos: con más de hora y media sin leerse, se avisa. */
const VIEJA = 90 * 60_000;

/** La tasa, y si ya está vieja (se calcula al leerla, no al dibujar). */
export type UsdtRate = TasaUsdt & { vieja: boolean };
const conVieja = (t: TasaUsdt | null): UsdtRate | null => (t ? { ...t, vieja: Date.now() - new Date(t.leidaEn).getTime() > VIEJA } : null);

let actual: UsdtRate | null = null;
let pedido: Promise<void> | null = null;
let ultimaLectura = 0;
const oyentes = new Set<(v: UsdtRate | null) => void>();

function publicar(t: TasaUsdt | null) {
  const v = conVieja(t);
  actual = v;
  for (const o of oyentes) o(v);
}

function leer(): Promise<void> {
  if (pedido) return pedido;
  if (Date.now() - ultimaLectura < CADA && actual) return Promise.resolve();
  pedido = tasaUsdtVigente()
    .then((t) => { ultimaLectura = Date.now(); publicar(t); })
    .catch(() => {})
    .finally(() => { pedido = null; });
  return pedido;
}

/** El botón «USDT»: pide al servidor que consulte ya. */
export async function fetchUsdtRate(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await actualizarUsdtAhora();
    ultimaLectura = Date.now();
    publicar(r.tasa);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function useUsdtRate(): UsdtRate | null {
  const [v, setV] = useState<UsdtRate | null>(actual);
  useEffect(() => {
    oyentes.add(setV);
    leer().then(() => setV(actual));
    // Cada 5 minutos: se vuelve a leer (y a ver si quedó vieja).
    const t = setInterval(() => { ultimaLectura = 0; leer(); }, CADA);
    return () => { oyentes.delete(setV); clearInterval(t); };
  }, []);
  return v;
}
