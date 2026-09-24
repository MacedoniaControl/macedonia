"use client";

// Input de dinero para renglones de documento.
//
// A diferencia de CampoMonto -que entrega texto y lo interpreta el padre-, este
// entrega NUMEROS, porque los renglones de una cotizacion o una nota alimentan
// los totales del documento y esos totales son aritmetica, no texto.
//
// Guarda el texto por dentro mientras se escribe. Sin eso, al teclear "1.500"
// el valor se reinterpretaria en cada tecla y el campo saltaria solo: escribes
// "1." y el input te lo cambia a "1".
//
// El control es `text`, no `number`: el nativo solo entiende el formato del
// locale del navegador, y con coma decimal devolvia vacio o convertia "1.500"
// en 1,5 sin avisar.

import { useEffect, useRef, useState } from "react";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";

export function InputMonto({
  valor,
  onChange,
  className = "",
  "aria-label": ariaLabel,
  id,
}: {
  valor: number;
  onChange: (n: number) => void;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const [texto, setTexto] = useState(() => (valor ? fmtMonto(valor) : ""));
  const enfocado = useRef(false);

  // Si el valor cambia desde afuera -se eligio un producto del catalogo y trae
  // su precio- el campo tiene que reflejarlo. Pero NO mientras se escribe.
  useEffect(() => {
    if (!enfocado.current) setTexto(valor ? fmtMonto(valor) : "");
  }, [valor]);

  const n = parseMonto(texto);
  const invalido = texto.trim() !== "" && n === null;

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={invalido || undefined}
      placeholder="0,00"
      value={texto}
      onFocus={() => { enfocado.current = true; }}
      onChange={(e) => {
        setTexto(e.target.value);
        const v = parseMonto(e.target.value);
        // Vacio vale cero; lo que no se entiende NO se propaga, para no pisar
        // el valor bueno con un cero mientras alguien esta a mitad de escribir.
        if (e.target.value.trim() === "") onChange(0);
        else if (v !== null) onChange(v);
      }}
      onBlur={() => {
        enfocado.current = false;
        // Al salir se normaliza a como se escribe aquí: quien lo escribio ve
        // como quedo, y una ambigüedad ("1,500") se nota en el acto.
        setTexto(n !== null ? fmtMonto(n) : "");
        if (n === null) onChange(0);
      }}
      className={`${className} tabular-nums ${invalido ? "border-danger" : ""}`}
    />
  );
}
