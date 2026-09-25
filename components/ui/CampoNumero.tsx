"use client";

// Campo de cantidad entera. Guarda el TEXTO mientras se escribe y solo avisa
// el número cuando es válido: con `Math.max(1, Number(v) || 1)` el campo
// volvía a 1 cada vez que se borraba y no había forma de escribir otro número.

import { useState } from "react";
import { leerCantidad } from "@/lib/cilindros/rampa";

export function CampoNumero({
  valor, onChange, className = "", max, ...resto
}: {
  valor: number;
  onChange: (n: number) => void;
  max?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "max">) {
  const [texto, setTexto] = useState(String(valor));
  const [previo, setPrevio] = useState(valor);

  // Si el valor cambia desde afuera (botones +/−, limpiar el formulario),
  // el texto lo sigue; mientras se escribe, no se pisa lo tecleado.
  if (valor !== previo) {
    setPrevio(valor);
    if ((leerCantidad(texto) ?? 0) !== valor) setTexto(String(valor));
  }

  return (
    <input
      {...resto}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={texto}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, "");
        const n = leerCantidad(t) ?? 0;
        const tope = max !== undefined ? Math.min(n, max) : n;
        // Pasado del máximo, el campo muestra el máximo: no un número que no vale.
        setTexto(tope !== n ? String(tope) : t);
        onChange(tope);
      }}
      onBlur={() => setTexto(String(valor))}
      className={`${className} tabular-nums`}
    />
  );
}
