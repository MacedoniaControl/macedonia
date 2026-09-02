"use client";

// Elegir cliente en una nota de entrega o cotización.
//
// Buscador con una píldora «Nuevo cliente» al lado: si el que llegó no está en
// la cartera, se crea ahí mismo y queda seleccionado, SIN perder la nota que se
// estaba armando. Mandar al vendedor a otra pantalla con el cliente enfrente y
// hacerle volver a empezar es la forma más rápida de que deje de usar el sistema.

import { useEffect, useRef, useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { Icon } from "@/components/ui/Icon";
import { buscarClientes, saldoCliente, type Cliente } from "@/lib/directorio/directorio-db";
import { FormularioCliente } from "./FormularioCliente";

const ESPERA_MS = 220;

export function SelectorCliente({
  empresa,
  seleccionado,
  onSelect,
}: {
  empresa: string;
  seleccionado: Cliente | null;
  onSelect: (c: Cliente | null) => void;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const turno = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    // Con menos de 2 letras no se busca. No hace falta limpiar el estado: la
    // lista solo se dibuja cuando hay 2 o mas, asi que un resultado viejo no
    // llega a verse — y llamar setState aqui encadenaria un render de mas.
    if (texto.length < 2) return;

    const mio = ++turno.current;
    const t = setTimeout(async () => {
      // El indicador se enciende DENTRO del temporizador, no de forma sincrona
      // al entrar al efecto: eso encadenaba un render extra antes de que la
      // peticion siquiera saliera.
      if (mio === turno.current) setBuscando(true);
      try {
        const r = await buscarClientes(texto);
        if (mio !== turno.current) return;   // llegó tarde: hay una búsqueda más nueva
        setResultados(r);
        setFallo(null);
      } catch (e) {
        if (mio === turno.current) { setFallo((e as Error).message); setResultados([]); }
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [q]);

  // El aviso de límite se consulta al elegir, no al escribir. Se DERIVA de la
  // carga en vez de guardarse en su propio estado: guardarlo obligaba a un
  // setState síncrono que encadena renders.
  const saldo = useCarga(
    seleccionado ? `${seleccionado.id}:${empresa}` : "",
    () => (seleccionado ? saldoCliente(seleccionado.id, empresa) : Promise.resolve(null)),
  );
  const aviso = saldo.datos?.excedido
    ? `Este cliente debe $${saldo.datos.debe.toFixed(2)} y su límite es $${saldo.datos.limite.toFixed(2)}.`
    : null;

  function elegir(c: Cliente) {
    onSelect(c);
    setQ("");
    setAbierto(false);
    setResultados([]);
  }

  if (seleccionado) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border-strong bg-surface-2 px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-snug text-text">{seleccionado.nombre}</span>
            <span className="font-mono text-xs text-muted">{seleccionado.rif ?? "sin RIF"}</span>
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex min-h-11 items-center rounded-lg px-2 text-sm text-muted hover:text-danger"
          >
            Cambiar
          </button>
        </div>

        {/* Avisa, no bloquea: el vendedor decide con el cliente enfrente. */}
        {aviso && (
          <p role="alert" className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {aviso} Podés emitir igual.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              placeholder="Buscar cliente…"
              aria-label="Buscar cliente"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-3 text-base text-text
                         outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </label>

          {abierto && q.trim().length >= 2 && (
            <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
              {fallo && <li className="px-3 py-2.5 text-sm text-danger">{fallo}</li>}
              {!fallo && buscando && resultados.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-muted">Buscando…</li>
              )}
              {!fallo && !buscando && resultados.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-muted">
                  No está en la cartera. Usa «Nuevo cliente».
                </li>
              )}
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(c)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="text-sm leading-snug text-text">{c.nombre}</span>
                    <span className="font-mono text-[11px] text-muted">{c.rif ?? "sin RIF"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCreando(true)}
          className="flex h-12 flex-none items-center justify-center gap-1.5 rounded-full
                     border border-brand-strong px-4 text-sm font-medium text-brand
                     transition hover:bg-brand/10"
        >
          <Icon name="plus" size={16} />
          Nuevo cliente
        </button>
      </div>

      {creando && (
        <FormularioCliente
          rifSugerido={/^[a-zA-Z]-?\d/.test(q.trim()) ? q.trim() : ""}
          nombreSugerido={/^[a-zA-Z]-?\d/.test(q.trim()) ? "" : q.trim()}
          onCerrar={() => setCreando(false)}
          onCreado={(c) => { setCreando(false); elegir(c); }}
        />
      )}
    </>
  );
}
