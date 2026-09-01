"use client";

// Cargar un conteo físico, desde una píldora.
//
// Se diseña para el TELÉFONO EN EL GALPÓN, que es donde se cuenta — no para el
// escritorio. De ahí las decisiones que parecen exageradas en una pantalla
// grande:
//
//   · el escáner primero, porque tipear un código con guantes es el cuello de
//     botella real;
//   · un solo producto a la vez, no una grilla: quien cuenta mira la estantería,
//     no la pantalla;
//   · el campo de cantidad grande y numérico, para acertarle sin mirar;
//   · lo anotado queda a la vista, porque perder la cuenta es volver a empezar.

import { useEffect, useRef, useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { escanear, mensajeDeEscaneo } from "@/lib/inventory/escanear";
import { beep } from "@/lib/inventory/scan-feedback";
import { ScanBar } from "@/components/inventory/ScanBar";
import { ProductSearch } from "@/components/inventory/ProductSearch";
import {
  abrirConteo, anotar, borrarRenglon, cerrarConteo, lineasDe, conteoAbierto,
  type LineaConteo,
} from "@/lib/inventory/conteos-db";

export function PanelConteo({ empresa, onCerrado }: { empresa: string; onCerrado: () => void }) {
  const [recarga, setRecarga] = useState(0);
  const sesion = useCarga(`${empresa}:${recarga}`, () => conteoAbierto(empresa));
  const abierto = sesion.datos;

  return (
    <PildoraPanel etiqueta="Cargar conteo" icono="inventory" ancho="w-[30rem]">
      {(cerrar) =>
        abierto ? (
          <Contando
            conteoId={abierto.id}
            zona={abierto.zona}
            empresa={empresa}
            onTerminado={() => { setRecarga((n) => n + 1); onCerrado(); cerrar(); }}
          />
        ) : (
          <Abrir empresa={empresa} onAbierto={() => setRecarga((n) => n + 1)} />
        )
      }
    </PildoraPanel>
  );
}

// ---------------------------------------------------------------- abrir

function Abrir({ empresa, onAbierto }: { empresa: string; onAbierto: () => void }) {
  const [zona, setZona] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">Nuevo conteo</p>
      <p className="text-xs text-muted">
        Se cuenta por zonas, no todo de una vez. Lo que no se cuente hoy queda
        como <strong>no contado</strong>, no como cero.
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Zona o sector *</span>
        <input
          className="sumi-campo"
          placeholder="Galpón 2, rampa, estantería A…"
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          autoFocus
        />
      </label>

      {msg && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

      <Button icon="inventory" className="w-full" disabled={yendo}
        onClick={async () => {
          setMsg(null);
          if (!zona.trim()) return setMsg("Poné la zona: sin eso, después nadie sabe qué se contó.");
          setYendo(true);
          try {
            const r = await abrirConteo(empresa, zona);
            if (!r.ok) return setMsg(r.error);
            onAbierto();
          } finally { setYendo(false); }
        }}>
        {yendo ? "Abriendo…" : "Empezar a contar"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- contando

function Contando({
  conteoId, zona, empresa, onTerminado,
}: { conteoId: number; zona: string | null; empresa: string; onTerminado: () => void }) {
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${conteoId}:${recarga}`, () => lineasDe(conteoId));
  const lineas: LineaConteo[] = carga.datos ?? [];

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const campoCantidad = useRef<HTMLInputElement>(null);

  // Al elegir producto, el foco salta solo a la cantidad: con el teléfono en una
  // mano, un toque de menos es un toque que no se erra.
  useEffect(() => {
    if (codigo) campoCantidad.current?.focus();
  }, [codigo]);

  function elegir(cod: string, nom: string) {
    setCodigo(cod);
    setNombre(nom);
    const ya = lineas.find((l) => l.codigo === cod);
    setCantidad(ya ? String(ya.cantidad) : "");
    setAviso(ya ? { ok: true, text: `Ya contado: ${ya.cantidad}. Lo que pongas lo reemplaza.` } : null);
  }

  async function guardar() {
    const n = Number(cantidad);
    if (!codigo) return setAviso({ ok: false, text: "Elegí o escaneá un producto." });
    if (cantidad === "" || !Number.isFinite(n) || n < 0) {
      return setAviso({ ok: false, text: "Poné cuántos hay. Cero también vale." });
    }
    const r = await anotar(conteoId, codigo, n);
    if (!r.ok) return setAviso({ ok: false, text: r.error ?? "No se pudo anotar." });

    setAviso({ ok: true, text: `${nombre || codigo}: ${n}` });
    setCodigo(""); setNombre(""); setCantidad("");
    setRecarga((x) => x + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text">Contando{zona ? ` · ${zona}` : ""}</p>
          <p className="text-xs text-muted">{lineas.length} producto(s) anotados</p>
        </div>
      </div>

      <ScanBar onScan={async (cod) => {
        const r = await escanear(cod, empresa);
        if (r.estado !== "encontrado") { beep(false); setAviso(mensajeDeEscaneo(r)); return; }
        beep(true);
        elegir(r.producto.codigo, r.producto.nombre);
      }} hint="Dispará el lector y poné cuántos hay." />

      <ProductSearch onPick={(p) => elegir(p.codigo, p.nombre)} />

      {codigo && (
        <div className="rounded-xl border border-brand-strong bg-brand-soft/40 p-3">
          <p className="text-sm font-medium text-text">{nombre || codigo}</p>
          <p className="font-mono text-xs text-muted">{codigo}</p>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-medium text-muted">¿Cuántos hay?</span>
            <input
              ref={campoCantidad}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void guardar(); }}
              placeholder="0"
              // Más alto y más grande que un campo normal: se teclea de pie,
              // con una mano, mirando la estantería.
              className="sumi-campo h-14 text-center text-2xl font-semibold tabular-nums"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <Button icon="check" className="flex-1" onClick={guardar}>Anotar</Button>
            <Button variant="secondary" onClick={() => { setCodigo(""); setNombre(""); setCantidad(""); }}>
              Otro
            </Button>
          </div>
        </div>
      )}

      {aviso && (
        <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
          <Icon name={aviso.ok ? "check" : "alert"} size={14} /> {aviso.text}
        </p>
      )}

      {lineas.length > 0 && (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/60">
              {lineas.map((l) => (
                <tr key={l.codigo}>
                  <td className="py-2 pl-3 font-mono text-xs text-muted">{l.codigo}</td>
                  <td className="py-2 pr-2 text-right font-semibold tabular-nums text-text">{l.cantidad}</td>
                  <td className="py-2 pr-2 text-right">
                    <button
                      type="button"
                      aria-label={`Quitar ${l.codigo} del conteo`}
                      onClick={async () => { await borrarRenglon(conteoId, l.codigo); setRecarga((x) => x + 1); }}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-danger"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 border-t border-border pt-3">
        <Button icon="check" className="flex-1" disabled={cerrando || lineas.length === 0}
          onClick={async () => {
            setCerrando(true);
            try {
              const r = await cerrarConteo(conteoId);
              if (!r.ok) return setAviso({ ok: false, text: r.error ?? "No se pudo cerrar." });
              onTerminado();
            } finally { setCerrando(false); }
          }}>
          {cerrando ? "Cerrando…" : "Cerrar conteo"}
        </Button>
      </div>
      <p className="text-[11px] text-muted">
        Al cerrar, lo contado entra al Master. Mientras esté abierto podés seguir
        agregando: nadie más lo ve todavía.
      </p>
    </div>
  );
}
