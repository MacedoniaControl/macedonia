"use client";

// Barra de escaneo compacta, reutilizable dentro de formularios.
// Mismo patrón que el captador del módulo Inventario: input siempre enfocado
// (los lectores HID teclean el código + Enter) y estado ACTIVO/PAUSADO visible,
// porque si el campo pierde el foco la lectura se pierde en silencio.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function ScanBar({
  onScan,
  hint = "Dispara el lector sobre el código del producto.",
}: {
  onScan: (codigo: string) => void;
  hint?: string;
}) {
  const [valor, setValor] = useState("");
  const [enfocado, setEnfocado] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function procesar(raw: string) {
    const codigo = raw.trim();
    if (!codigo) return;
    onScan(codigo);
    setValor("");
    // Sin esto el escáner queda PAUSADO y se pierde la siguiente lectura.
    ref.current?.focus();
  }

  return (
    <div
      onClick={() => ref.current?.focus()}
      className={`rounded-xl border-2 p-3 transition ${enfocado ? "border-ok bg-ok/5" : "border-warn bg-warn/5"}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-3 w-3 shrink-0">
          {enfocado && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${enfocado ? "bg-ok" : "bg-warn"}`} />
        </span>
        <span className={`text-xs font-bold tracking-wide ${enfocado ? "text-ok" : "text-warn"}`}>
          {enfocado ? "ESCANEO ACTIVO" : "PAUSADO — haz clic aquí para reanudar"}
        </span>
      </div>
      <input
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          // El lector HID cierra la lectura con Enter.
          if (e.key === "Enter") {
            e.preventDefault();
            procesar(e.currentTarget.value);
          }
        }}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        placeholder="Esperando lectura…"
        aria-label="Escanear código de producto"
        autoComplete="off"
        className={`h-11 w-full rounded-lg border-2 bg-surface-2 px-3 font-mono text-base text-text transition ${enfocado ? "border-ok" : "border-border"}`}
      />
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="alert" size={12} /> {enfocado ? hint : "El campo perdió el foco: los escaneos NO se registran."}
      </p>
    </div>
  );
}
