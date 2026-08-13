"use client";

import { useEffect, useState } from "react";

export type Notif = {
  id: string;
  tipo: string; // "cilindro"
  titulo: string;
  mensaje: string;
  para: string; // usuario autorizador (owner/admin)
  estado: "pendiente" | "aprobada" | "rechazada";
  applied?: boolean;
  hora: string;
  payload?: Record<string, unknown>;
};

const KEY = "sumi:notifs";
const EV = "sumi:notifs";

export function getNotifs(): Notif[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Notif[];
  } catch {
    return [];
  }
}

function save(list: Notif[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EV));
}

export function addNotif(n: Notif) {
  save([n, ...getNotifs()]);
}

export function updateNotif(id: string, patch: Partial<Notif>) {
  save(getNotifs().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function subscribe(cb: () => void) {
  const h = () => cb();
  window.addEventListener(EV, h);
  window.addEventListener("storage", h); // sincroniza entre pestañas
  return () => {
    window.removeEventListener(EV, h);
    window.removeEventListener("storage", h);
  };
}

export function useNotifications() {
  const [list, setList] = useState<Notif[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(getNotifs());
    return subscribe(() => setList(getNotifs()));
  }, []);
  return list;
}
