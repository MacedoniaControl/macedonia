"use client";

import { useEffect, useState } from "react";

export type BcvRate = { tasa: number; fecha: string; fetchedAt: string };

const KEY = "sumi:bcvrate";
const EV = "sumi:bcvrate";

export function getBcvRate(): BcvRate | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const r = localStorage.getItem(KEY);
    return r ? (JSON.parse(r) as BcvRate) : null;
  } catch {
    return null;
  }
}

function save(v: BcvRate) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EV));
}

/** Llama a la API interna que consulta el BCV y guarda el resultado con la marca de tiempo del call. */
export async function fetchBcvRate(): Promise<{ ok: boolean; error?: string; rate?: BcvRate }> {
  try {
    const r = await fetch("/api/bcv", { cache: "no-store" });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || "No disponible" };
    const rate: BcvRate = { tasa: d.tasa, fecha: d.fecha || "", fetchedAt: new Date().toISOString() };
    save(rate);
    return { ok: true, rate };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function useBcvRate() {
  const [v, setV] = useState<BcvRate | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(getBcvRate());
    const h = () => setV(getBcvRate());
    window.addEventListener(EV, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EV, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return v;
}

/**
 * La tasa del BCV, traída del servidor al montar.
 *
 * `useBcvRate` solo LEE lo que alguien haya guardado antes; si nadie la
 * refrescó, devuelve null y la pantalla se queda con una constante vieja. Acá
 * se pide de verdad. Devuelve `null` mientras no haya respuesta, para que quien
 * la use decida qué mostrar en vez de inventar un número.
 */
export function useTasaViva(): number | null {
  const guardada = useBcvRate();
  const [tasa, setTasa] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    fetchBcvRate().then((r) => {
      if (vigente && r.ok && r.rate) setTasa(r.rate.tasa);
    });
    return () => { vigente = false; };
  }, []);

  return tasa ?? guardada?.tasa ?? null;
}
