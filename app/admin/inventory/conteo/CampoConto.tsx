"use client";

// «Contó»: se elige de la lista de usuarios, o se escribe el nombre de otra
// persona en su recuadro. Lo mismo en la planilla y al cerrar.

import { useId } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { contadoresDe } from "@/lib/inventory/contadores";

const OTRA = "__otra";

export function CampoConto({ empresa, valor, onCambio }: { empresa: string; valor: string; onCambio: (v: string) => void }) {
  const id = useId();
  const lista = useCarga(`contadores:${empresa}`, () => contadoresDe(empresa));
  const nombres = lista.datos ?? [];
  // Un nombre que no está en la lista (o vacío habiendo elegido «otra») va en el recuadro.
  const enLista = nombres.includes(valor);
  const elegido = enLista ? valor : valor ? OTRA : "";
  const otra = elegido === OTRA || (!enLista && valor !== "");
  return (
    <div className="space-y-2">
      <label className="block" htmlFor={id}>
        <span className="mb-1 block text-xs font-medium text-muted">Contó <span className="text-danger">*</span></span>
        <select id={id} className="sumi-campo" value={otra ? OTRA : elegido} disabled={lista.cargando}
          onChange={(e) => onCambio(e.target.value === OTRA ? (enLista ? "" : valor) || " " : e.target.value)}>
          <option value="">{lista.cargando ? "Cargando…" : "Elige quién contó…"}</option>
          {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value={OTRA}>Otra persona (escribir el nombre)</option>
        </select>
      </label>
      {otra && (
        <input className="sumi-campo" value={valor.trim() ? valor : ""} onChange={(e) => onCambio(e.target.value || " ")}
          placeholder="Nombre y apellido de quien contó" aria-label="Nombre de quien contó" autoComplete="off" autoFocus />
      )}
    </div>
  );
}
