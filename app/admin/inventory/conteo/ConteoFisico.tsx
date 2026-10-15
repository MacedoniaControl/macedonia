"use client";

// La pestaña Conteo: los conteos que se van haciendo en Macedonia.
//
// Pedido del usuario (14-10-2026): la pestaña muestra el historial de conteos,
// y un conteo se empieza con el botón «Iniciar Conteo», que abre una ventana en
// dos pasos (qué se cuenta y quién cuenta). Los conteos en curso van arriba
// del historial, cada uno con «Seguir contando», que abre su planilla; la
// planilla tiene «← Volver a los conteos».
//
// Puede haber varios conteos en curso a la vez (15-10-2026), siempre que no
// compartan artículos: lo comprueba el servidor al abrirlos
// (cruceConAbiertos), porque si dos conteos tienen el mismo artículo su
// diferencia entraría dos veces al inventario.
//
// Owner y Administrador ven el detalle de cada conteo cerrado (sus actas, lo
// contado contra el sistema, verificar o rechazar). El Técnico ve la lista: el
// conteo es ciego, y lo que decía el sistema no es para quien cuenta.

import { useState } from "react";
import { Contar } from "./Contar";
import { Historial } from "./Historial";
import { IniciarConteo } from "./IniciarConteo";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCarga } from "@/lib/ux/use-carga";
import { conteosAbiertos, type Conteo } from "@/lib/inventory/conteos-db";

export function ConteoFisico({ empresa, gerencia, inicial, iniciarAlEntrar, onCerrado }: {
  empresa: string; gerencia: boolean; onCerrado: () => void;
  /** Para llegar desde una alerta directo al historial, con un conteo desplegado. */
  inicial?: { vista: "historial"; abrir: number | null } | null;
  /** Se llegó desde «Iniciar Conteo» del Master o de la cabecera: la ventana abre sola. */
  iniciarAlEntrar?: boolean;
}) {
  // null = el historial; un número = la planilla de ese conteo en curso.
  const [contando, setContando] = useState<number | null>(null);
  const [abrir, setAbrir] = useState<number | null>(inicial?.abrir ?? null);
  const [recarga, setRecarga] = useState(0);
  // "elegir" = qué hacer con los que ya están en curso; "nuevo" = la ventana de dos pasos.
  const [ventana, setVentana] = useState<"elegir" | "nuevo" | null>(iniciarAlEntrar ? "elegir" : null);
  const abiertos = useCarga(`abiertos:${empresa}:${recarga}`, () => conteosAbiertos(empresa));
  const enCurso = abiertos.datos ?? [];

  if (contando !== null) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" className="sumi-pulsable" onClick={() => { setRecarga((n) => n + 1); setContando(null); }}>← Volver a los conteos</Button>
        <Contar
          key={`${contando}:${recarga}`}
          empresa={empresa}
          conteoId={contando}
          gerencia={gerencia}
          onCambio={() => setRecarga((n) => n + 1)}
          onSinConteo={() => { setRecarga((n) => n + 1); setContando(null); }}
          onCerrado={(id) => {
            setRecarga((n) => n + 1); onCerrado();
            setAbrir(gerencia ? id : null); setContando(null);
          }}
        />
      </div>
    );
  }

  // Sin nada en curso, «Iniciar Conteo» va directo a la ventana de dos pasos.
  const pedirIniciar = () => setVentana(enCurso.length ? "elegir" : "nuevo");
  const ventanaVisible = ventana === "elegir" && !abiertos.cargando && enCurso.length === 0 ? "nuevo" : ventana;

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-text">Conteos</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-muted">
            Los conteos que se hacen en Macedonia, del más reciente al más antiguo. Contar no cambia el inventario: las diferencias entran cuando el Owner o un Administrador verifican el conteo.
          </p>
        </div>
        <Button icon="plus" className="sumi-pulsable min-h-12 text-base" disabled={abiertos.cargando} onClick={pedirIniciar}>Iniciar Conteo</Button>
      </section>

      {enCurso.length > 0 && (
        <div className="space-y-3" aria-label="Conteos en curso">
          {enCurso.map((c) => <EnCurso key={c.id} c={c} onSeguir={() => setContando(c.id)} />)}
        </div>
      )}

      <Historial empresa={empresa} gerencia={gerencia} abrirId={abrir} recarga={recarga} onIrAContar={(id) => setContando(id)} />

      {ventanaVisible === "elegir" && !abiertos.cargando && (
        <HayEnCurso enCurso={enCurso} onCerrar={() => setVentana(null)}
          onSeguir={(id) => { setVentana(null); setContando(id); }}
          onOtro={() => setVentana("nuevo")} />
      )}
      {ventanaVisible === "nuevo" && (
        <IniciarConteo empresa={empresa} enCurso={enCurso} onCerrar={() => setVentana(null)}
          onIniciado={(id) => { setVentana(null); setRecarga((n) => n + 1); setContando(id); }} />
      )}
    </div>
  );
}

/** Un conteo en curso, arriba del historial. */
function EnCurso({ c, onSeguir }: { c: Conteo; onSeguir: () => void }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-ok/40 bg-ok/5 p-4 sm:p-5" aria-label={`Conteo en curso: ${nombreDe(c)}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-lg font-semibold text-text">
          {nombreDe(c)}
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

/**
 * «Iniciar Conteo» con conteos ya en curso: seguir uno de ellos o iniciar
 * otro. El otro no puede compartir artículos con los que están en curso; eso
 * lo dice la ventana de dos pasos si pasa.
 */
function HayEnCurso({ enCurso, onCerrar, onSeguir, onOtro }: {
  enCurso: Conteo[]; onCerrar: () => void; onSeguir: (id: number) => void; onOtro: () => void;
}) {
  const uno = enCurso.length === 1;
  return (
    <Modal titulo={uno ? "Ya Hay un Conteo en Curso" : `Hay ${enCurso.length} Conteos en Curso`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm text-text">
          {uno ? "Puedes seguirlo o iniciar otro conteo." : "Puedes seguir uno de ellos o iniciar otro conteo."} El nuevo no puede
          tener artículos de {uno ? "este" : "estos"}: así ninguna diferencia entra dos veces al inventario.
        </p>
        <ul className="space-y-2">
          {enCurso.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
              <span className="min-w-0 text-sm">
                <b className="text-text">{nombreDe(c)}</b>
                <span className="block text-xs text-muted">{c.conto ? `Cuenta ${c.conto} · ` : ""}{c.renglones} anotados</span>
              </span>
              <Button variant="secondary" onClick={() => onSeguir(c.id)}>Seguir contando</Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="min-h-12" onClick={onCerrar}>Volver</Button>
          <Button icon="plus" className="min-h-12" onClick={onOtro}>Iniciar otro conteo</Button>
        </div>
      </div>
    </Modal>
  );
}

const nombreDe = (c: Conteo) =>
  c.origen === "planilla" ? "Los 75 Más Vendidos" : c.origen === "general" ? "Todos los Items"
    : c.departamento ? `${c.departamento} · ${c.departamentoNombre ?? ""}` : "Conteo sin departamento";
