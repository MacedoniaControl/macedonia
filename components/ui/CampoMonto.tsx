"use client";

// Campo de dinero.
//
// No usa <input type="number">: ese control solo entiende el formato del locale
// del navegador y devuelve cadena vacia cuando no lo entiende. Escribiendo como
// se escribe aquí, "1.500,50" se perdia y "1.500" se guardaba como 1,5 -sin
// error y con cara de numero correcto-.
//
// Aquí se escribe libre, se interpreta con parseMonto, y se DEVUELVE el monto
// formateado debajo. Ese eco es lo que permite cazar una ambigüedad: quien
// escribio "1,500" ve "1,50" y lo corrige antes de guardar.

import { useId } from "react";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";

export function CampoMonto({
  etiqueta,
  valor,
  onChange,
  moneda = "USD",
  requerido = false,
  className = "",
}: {
  etiqueta: string;
  /** Lo que la persona escribio, tal cual. El padre guarda el texto. */
  valor: string;
  onChange: (texto: string) => void;
  moneda?: string;
  requerido?: boolean;
  className?: string;
}) {
  const id = useId();
  const n = parseMonto(valor);
  const escrito = valor.trim().length > 0;
  const invalido = escrito && n === null;

  return (
    <label className={`block ${className}`} htmlFor={id}>
      <span className="mb-1 block text-xs font-medium text-muted">
        {etiqueta} {moneda ? `(${moneda})` : ""}
      </span>
      <input
        id={id}
        // `text`, no `number`: el control nativo no acepta coma decimal.
        // `inputMode="decimal"` igual saca el teclado numerico en el telefono.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalido || undefined}
        aria-describedby={`${id}-eco`}
        placeholder="0,00"
        className="sumi-campo tabular-nums"
        required={requerido}
      />
      {/* El eco ocupa lugar siempre, para que la caja no salte al escribir. */}
      <span id={`${id}-eco`} className="mt-1 block min-h-4 text-xs">
        {invalido ? (
          <span className="text-danger">No se entiende ese monto. Ejemplo: 1.500,50</span>
        ) : n !== null ? (
          <span className="text-muted tabular-nums">
            Son <strong className="text-text">{fmtMonto(n)}</strong>
          </span>
        ) : null}
      </span>
    </label>
  );
}
