"use client";

// Conteo físico: un solo lugar para contar, que se ve según su estado.
//
//   · Sin conteo abierto: la pantalla pregunta «¿Qué Vas a Contar?» y se empieza.
//   · Con un conteo abierto: la pantalla ES ese conteo («Conteo en Curso: …»),
//     con su planilla. No se ofrece empezar otro, porque no se puede; se puede
//     cambiar qué se cuenta (si no hay nada contado) o pasarlo a todo el
//     inventario, desde su propio encabezado.
//   · El Historial (Owner y Administrador) es aparte: un botón lo abre y otro
//     vuelve al conteo.
//
// Antes había a la vez una pestaña «Contar», un botón «Iniciar Conteo» y
// «Historial»: tres cosas del mismo peso para lo que es una sola tarea
// (pedido del usuario, 13-10-2026: «no tiene sentido que coexistan»).

import { useState } from "react";
import { Contar } from "./Contar";
import { Historial } from "./Historial";
import { Button } from "@/components/ui/Button";

export function ConteoFisico({ empresa, gerencia, inicial, onCerrado }: {
  empresa: string; gerencia: boolean; onCerrado: () => void;
  /** Para llegar desde una alerta directo al historial, con un conteo abierto. */
  inicial?: { vista: "historial"; abrir: number | null } | null;
}) {
  const [vista, setVista] = useState<"contar" | "historial">(inicial?.vista ?? "contar");
  const [abrir, setAbrir] = useState<number | null>(inicial?.abrir ?? null);
  const [recarga, setRecarga] = useState(0);

  if (vista === "historial" && gerencia) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" className="sumi-pulsable" onClick={() => setVista("contar")}>← Volver al conteo</Button>
        <Historial empresa={empresa} abrirId={abrir} recarga={recarga} onIrAContar={() => setVista("contar")} />
      </div>
    );
  }

  return (
    <Contar
      key={recarga}
      empresa={empresa}
      gerencia={gerencia}
      onHistorial={gerencia ? () => setVista("historial") : undefined}
      onCambio={() => setRecarga((n) => n + 1)}
      onCerrado={(id) => {
        setRecarga((n) => n + 1); onCerrado();
        if (gerencia) { setAbrir(id); setVista("historial"); }
      }}
    />
  );
}
