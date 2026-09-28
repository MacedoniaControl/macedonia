"use client";

// La tasa BCV en la pantalla: la de la BASE, la misma para todos.
//
// Antes cada navegador consultaba el BCV y guardaba la tasa en su propio
// almacenamiento: cada computadora y cada teléfono podía tener una distinta,
// y si nadie abría las pantallas que la piden se quedaba vieja. Ahora la base
// la trae sola cada 30 minutos (migración 30) y aquí solo se lee: una vez por
// página, compartida entre todos los componentes, y de nuevo cada 5 minutos.

import { useEffect, useState } from "react";
import { actualizarTasaAhora, tasaVigente, type TasaBcv } from "@/lib/bcv/tasa-db";

export type BcvRate = {
  tasa: number;
  /** Fecha valor (YYYY-MM-DD): el día para el que vale. */
  fecha: string;
  /** Cuándo la confirmó el BCV por última vez (ISO). */
  fetchedAt: string;
  error: string | null;
  proxima: TasaBcv["proxima"];
};

const CADA = 5 * 60_000;
let actual: BcvRate | null = null;
let pedido: Promise<void> | null = null;
let ultimaLectura = 0;
const oyentes = new Set<(v: BcvRate | null) => void>();

// El BCV publica ocho decimales; aquí se usan dos, como en Valery y en el
// papel: así la tasa que se ve es la misma con la que se convierte.
const dos = (n: number) => Math.round(n * 100) / 100;
const aRate = (t: TasaBcv | null): BcvRate | null =>
  t ? { tasa: dos(t.tasa), fecha: t.fechaValor, fetchedAt: t.actualizada, error: t.error,
        proxima: t.proxima ? { ...t.proxima, tasa: dos(t.proxima.tasa) } : null } : null;

function publicar(v: BcvRate | null) {
  actual = v;
  for (const o of oyentes) o(v);
}

function leer(forzar = false): Promise<void> {
  if (pedido) return pedido;
  if (!forzar && Date.now() - ultimaLectura < CADA && actual) return Promise.resolve();
  pedido = tasaVigente()
    .then((t) => { ultimaLectura = Date.now(); publicar(aRate(t)); })
    .catch(() => {})
    .finally(() => { pedido = null; });
  return pedido;
}

/** La última tasa leída en esta página (null si todavía no llegó). */
export function getBcvRate(): BcvRate | null {
  return actual;
}

/** El botón «Tasa BCV»: pide al servidor que consulte ya al BCV. */
export async function fetchBcvRate(): Promise<{ ok: boolean; error?: string; rate?: BcvRate }> {
  try {
    const r = await actualizarTasaAhora();
    const rate = aRate(r.tasa);
    ultimaLectura = Date.now();
    publicar(rate);
    return r.ok ? { ok: true, rate: rate ?? undefined } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function useBcvRate(): BcvRate | null {
  const [v, setV] = useState<BcvRate | null>(actual);
  useEffect(() => {
    oyentes.add(setV);
    leer().then(() => setV(actual));
    const t = setInterval(() => { leer(); }, CADA);
    return () => { oyentes.delete(setV); clearInterval(t); };
  }, []);
  return v;
}

/** Solo la cifra, para convertir a bolívares. null mientras no llegue. */
export function useTasaViva(): number | null {
  return useBcvRate()?.tasa ?? null;
}
