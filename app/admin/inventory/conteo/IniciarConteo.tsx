"use client";

// Elegir qué se cuenta, con palabras simples y tres opciones grandes:
//   · Los 75 Más Vendidos;
//   · Un Departamento (y luego cuál, en botones);
//   · Todo el Inventario.
//
// Pedido del usuario (12 y 13-10-2026): que tenga sentido común para quien no
// usa mucho la tecnología. Por eso se usa en dos lugares, nunca a la vez:
//   · sin conteo abierto, ES la pantalla de Conteo (ElegirConteo, sin ventana):
//     no hay nada más que hacer que empezar uno;
//   · con un conteo abierto, sale en una ventana desde «Cambiar qué se cuenta»
//     (CambiarConteo). Sin nada contado, la elección lo cambia sin perder nada;
//     con algo contado solo se puede pasar a Todo el Inventario, que lo conserva.
// Solo puede haber un conteo abierto por empresa.

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { abrirConteo, cambiarAlcance, departamentosDe, type Conteo } from "@/lib/inventory/conteos-db";

type Tipo = "planilla" | "departamento" | "general";

const OPCIONES: { id: Tipo; titulo: string; texto: string; icono: IconName }[] = [
  { id: "planilla", titulo: "Los 75 Más Vendidos", texto: "La lista corta: los 75 artículos que más se venden.", icono: "report" },
  { id: "departamento", titulo: "Un Departamento", texto: "Solo los artículos de un departamento, por ejemplo Soldadura.", icono: "building" },
  { id: "general", titulo: "Todo el Inventario", texto: "Todos los artículos de todos los departamentos. Toma más tiempo.", icono: "inventory" },
];

/** Qué se está contando, dicho para una persona. */
export const queCuenta = (c: Conteo) =>
  c.origen === "planilla" ? "Los 75 Más Vendidos" : c.origen === "general" ? "Todo el Inventario"
    : c.departamento ? `el departamento ${c.departamento} - ${c.departamentoNombre ?? ""}` : "un conteo sin departamento";

/** La ventana «Cambiar qué se cuenta», para un conteo que ya está abierto. */
export function CambiarConteo({ empresa, conteo, onCerrar, onListo }: { empresa: string; conteo: Conteo; onCerrar: () => void; onListo: () => void }) {
  return (
    <Modal titulo="Cambiar Qué Se Cuenta" onCerrar={onCerrar} ancho="max-w-2xl">
      <ElegirConteo empresa={empresa} abierto={conteo} onListo={onListo} onCancelar={onCerrar} />
    </Modal>
  );
}

/** Elegir qué contar. Sin `abierto` empieza un conteo; con él, lo cambia. */
export function ElegirConteo({ empresa, abierto: c, onListo, onCancelar }: {
  empresa: string; abierto: Conteo | null; onListo: () => void; onCancelar?: () => void;
}) {
  const deps = useCarga(`dep:${empresa}`, () => departamentosDe(empresa));
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [depto, setDepto] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enVentana = !!onCancelar;
  const conAnotado = !!c && c.renglones > 0;
  const contables = (deps.datos ?? []).filter((d) => d.seCuenta);
  // Con algo ya contado, lo único que se puede es pasar a Todo el Inventario.
  const permitido = (t: Tipo) => !conAnotado || (t === "general" && c!.origen !== "general");
  const elegido = tipo === "departamento" ? contables.find((d) => d.codigo === depto) ?? null : null;
  const listo = tipo !== null && permitido(tipo) && (tipo !== "departamento" || !!elegido) && !(c && mismoQueAbierto(c, tipo, depto));
  const nombreElegido = tipo === "departamento" ? (elegido ? `${elegido.codigo} · ${capitalizar(elegido.nombre)}` : "") : OPCIONES.find((o) => o.id === tipo)?.titulo ?? "";

  async function empezar() {
    if (!tipo || !listo) return;
    setError(null); setYendo(true);
    try {
      const que = tipo === "planilla" ? { planilla: true as const } : tipo === "general" ? { general: true as const } : { departamento: depto! };
      const r = c ? await cambiarAlcance(c.id, empresa, que) : await abrirConteo(empresa, que);
      if (!r.ok) return setError(r.error);
      onListo();
    } finally { setYendo(false); }
  }

  return (
    <>
      {deps.cargando ? (
        <p className="py-8 text-center text-sm text-muted">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {c && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${conAnotado ? "border-warn/40 bg-warn/10 text-text" : "border-info/30 bg-info/10 text-text"}`}>
              {conAnotado ? (
                <>
                  <p className="font-semibold">Ya contaste {c.renglones} artículo(s) en {queCuenta(c)}.</p>
                  <p className="mt-1 text-muted">
                    Para contar otra cosa, primero cierra este conteo con «Revisar y cerrar».
                    {c.origen !== "general" && " Lo que sí puedes es pasarlo a Todo el Inventario: lo contado se conserva."}
                  </p>
                </>
              ) : (
                <p>Todavía no has contado nada, así que puedes cambiarlo sin perder nada.</p>
              )}
            </div>
          )}

          {tipo !== "departamento" || !permitido("departamento") ? (
            <>
              <p className={`font-semibold text-text ${enVentana ? "text-base" : "text-lg"}`}>¿Qué Vas a Contar?</p>
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Qué vas a contar">
                {OPCIONES.map((o) => {
                  const ok = permitido(o.id);
                  const activo = tipo === o.id;
                  return (
                    <button key={o.id} type="button" role="radio" aria-checked={activo} disabled={!ok}
                      onClick={() => { setTipo(o.id); setError(null); }}
                      className={`sumi-pulsable flex min-h-36 flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition
                        ${activo ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"}
                        ${ok ? "" : "cursor-not-allowed opacity-45"}`}>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${activo ? "bg-brand text-white" : "bg-surface-2 text-text"}`}>
                        <Icon name={o.icono} size={20} />
                      </span>
                      <span className="text-base font-semibold text-text">{o.titulo}</span>
                      <span className="text-sm leading-snug text-muted">{o.texto}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-text">¿Qué Departamento?</p>
                <Button variant="ghost" onClick={() => { setTipo(null); setDepto(null); }}>← Volver</Button>
              </div>
              <div className="sumi-scroll grid max-h-[38vh] gap-2 overflow-y-auto pr-1 sm:max-h-[50vh] sm:grid-cols-2" role="radiogroup" aria-label="Departamento">
                {contables.map((d) => {
                  const activo = depto === d.codigo;
                  return (
                    <button key={d.codigo} type="button" role="radio" aria-checked={activo} onClick={() => setDepto(d.codigo)}
                      className={`sumi-pulsable flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 text-left transition
                        ${activo ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"}`}>
                      <span className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm font-semibold tabular-nums ${activo ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>{d.codigo}</span>
                      <span className="text-sm font-medium text-text">{capitalizar(d.nombre)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          {/* Siempre a la vista, también en el teléfono con la lista larga. */}
          <div className={`sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface py-3 sm:flex-row sm:items-center sm:justify-end ${enVentana ? "-mx-4 -mb-4 rounded-b-2xl px-4" : "z-10 -mx-5 -mb-5 rounded-b-2xl px-5"}`}>
            {onCancelar && <Button variant="secondary" className="sumi-pulsable min-h-12" onClick={onCancelar}>{conAnotado ? "Seguir contando" : "Cancelar"}</Button>}
            <Button icon="check" className="sumi-pulsable min-h-12 text-base" disabled={!listo} cargando={yendo} textoCargando="Preparando la planilla…" onClick={() => void empezar()}>
              {listo ? (c && conAnotado ? "Pasar a Todo el Inventario" : c ? `Cambiar a: ${nombreElegido}` : `Empezar: ${nombreElegido}`)
                : c && tipo && mismoQueAbierto(c, tipo, depto) ? "Eso es lo que ya estás contando"
                : tipo === "departamento" ? "Elige un departamento" : "Elige qué vas a contar"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** ¿Lo elegido es lo mismo que ya está abierto? (no hay nada que cambiar) */
function mismoQueAbierto(c: Conteo, tipo: Tipo, depto: string | null) {
  return (tipo === "planilla" && c.origen === "planilla") || (tipo === "general" && c.origen === "general")
    || (tipo === "departamento" && c.origen === "departamento" && c.departamento === depto);
}

/** «HOGAR Y ACCESORIOS» → «Hogar y Accesorios»: más fácil de leer en botones. */
function capitalizar(s: string) {
  const menores = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "los", "el", "para", "con", "en"]);
  return s.toLowerCase().split(" ").map((p, i) => (i > 0 && menores.has(p) ? p : p.replace(/(^|\/|-)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()))).join(" ");
}
