"use client";

// La pestaña Conteo: los conteos que se van haciendo en Macedonia.
//
// Pedido del usuario (14-10-2026): la pestaña muestra el historial de conteos,
// y un conteo se empieza con el botón «Iniciar Conteo», que abre una ventana en
// dos pasos (qué se cuenta y quién cuenta). Si hay un conteo abierto, va arriba
// del historial con «Seguir contando», que abre su planilla; la planilla tiene
// «← Volver a los conteos». Solo puede haber uno abierto por empresa.
//
// Owner y Administrador ven el detalle de cada conteo cerrado (sus actas, lo
// contado contra el sistema, verificar o rechazar). El Técnico ve la lista: el
// conteo es ciego, y lo que decía el sistema no es para quien cuenta.

import { useState } from "react";
import { Contar } from "./Contar";
import { Historial } from "./Historial";
import { IniciarConteo, queCuenta } from "./IniciarConteo";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCarga } from "@/lib/ux/use-carga";
import { conteoAbierto, type Conteo } from "@/lib/inventory/conteos-db";

export function ConteoFisico({ empresa, gerencia, inicial, iniciarAlEntrar, onCerrado }: {
  empresa: string; gerencia: boolean; onCerrado: () => void;
  /** Para llegar desde una alerta directo al historial, con un conteo desplegado. */
  inicial?: { vista: "historial"; abrir: number | null } | null;
  /** Se llegó desde «Iniciar Conteo» del Master: la ventana abre sola. */
  iniciarAlEntrar?: boolean;
}) {
  const [vista, setVista] = useState<"historial" | "contar">("historial");
  const [abrir, setAbrir] = useState<number | null>(inicial?.abrir ?? null);
  const [recarga, setRecarga] = useState(0);
  const [iniciar, setIniciar] = useState(!!iniciarAlEntrar);
  const abierto = useCarga(`abierto:${empresa}:${recarga}`, () => conteoAbierto(empresa));

  if (vista === "contar") {
    return (
      <div className="space-y-4">
        <Button variant="secondary" className="sumi-pulsable" onClick={() => { setRecarga((n) => n + 1); setVista("historial"); }}>← Volver a los conteos</Button>
        <Contar
          key={recarga}
          empresa={empresa}
          gerencia={gerencia}
          onCambio={() => setRecarga((n) => n + 1)}
          onSinConteo={() => setVista("historial")}
          onCerrado={(id) => {
            setRecarga((n) => n + 1); onCerrado();
            setAbrir(gerencia ? id : null); setVista("historial");
          }}
        />
      </div>
    );
  }

  const c = abierto.datos ?? null;
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-text">Conteos</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-muted">
            Los conteos que se hacen en Macedonia, del más reciente al más antiguo. Contar no cambia el inventario: las diferencias entran cuando el Owner o un Administrador verifican el conteo.
          </p>
        </div>
        <Button icon="plus" className="sumi-pulsable min-h-12 text-base" disabled={abierto.cargando} onClick={() => setIniciar(true)}>Iniciar Conteo</Button>
      </section>

      {c && <EnCurso c={c} onSeguir={() => setVista("contar")} />}

      <Historial empresa={empresa} gerencia={gerencia} abrirId={abrir} recarga={recarga} onIrAContar={() => setVista("contar")} />

      {iniciar && (c
        ? <YaHayUno c={c} onCerrar={() => setIniciar(false)} onSeguir={() => { setIniciar(false); setVista("contar"); }} />
        : <IniciarConteo empresa={empresa} onCerrar={() => setIniciar(false)}
            onIniciado={() => { setIniciar(false); setRecarga((n) => n + 1); setVista("contar"); }} />)}
    </div>
  );
}

/** El conteo abierto, arriba del historial: es lo único que se puede seguir. */
function EnCurso({ c, onSeguir }: { c: Conteo; onSeguir: () => void }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-ok/40 bg-ok/5 p-4 sm:p-5" aria-label="Conteo en curso">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-lg font-semibold text-text">
          {nombre(c)}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />En curso
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          Abierto el {c.abiertoEn}{c.conto ? ` · cuenta ${c.conto}` : ""} · {c.renglones} {c.renglones === 1 ? "artículo anotado" : "artículos anotados"}. Lo contado se guarda solo.
        </p>
      </div>
      <Button icon="check" className="sumi-pulsable min-h-12 text-base" onClick={onSeguir}>Seguir contando</Button>
    </section>
  );
}

/** «Iniciar Conteo» con uno ya abierto: no se puede, y se dice por qué. */
function YaHayUno({ c, onCerrar, onSeguir }: { c: Conteo; onCerrar: () => void; onSeguir: () => void }) {
  return (
    <Modal titulo="Ya Hay un Conteo en Curso" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm text-text">
          Se está contando <b>{queCuenta(c)}</b>{c.conto ? <>, lo cuenta <b>{c.conto}</b></> : null}. Solo puede haber un conteo abierto a la vez:
          termínalo con «Revisar y cerrar» y después inicia el siguiente.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="min-h-12" onClick={onCerrar}>Volver</Button>
          <Button icon="check" className="min-h-12" onClick={onSeguir}>Seguir contando</Button>
        </div>
      </div>
    </Modal>
  );
}

const nombre = (c: Conteo) =>
  c.origen === "planilla" ? "Los 75 Más Vendidos" : c.origen === "general" ? "Todos los Items"
    : c.departamento ? `${c.departamento} · ${c.departamentoNombre ?? ""}` : "Conteo sin departamento";
