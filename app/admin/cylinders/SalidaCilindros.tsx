"use client";

// Salida declarada: quien autoriza y quien retira.
//
// Pedido por Greeg. La entrega cuenta cuantos cilindros cambiaron de manos;
// esto deja por escrito los dos nombres que hacen falta cuando un cilindro no
// vuelve. Son tres personas distintas y el formulario las separa: quien
// autoriza (owner o admin), quien se lo lleva (puede ser un chofer sin usuario)
// y quien registra (el de la sesion, que no se pregunta).

import { useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { gases, autorizantes, registrarSalida } from "@/lib/cilindros/cilindros-db";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";

const vacio = { gas: "", cantidad: 1, cliente: "", autorizadoPor: "", retiradoPor: "", documento: "", nota: "" };

export function SalidaCilindros({ empresa, onRegistrada }: { empresa: string; onRegistrada?: () => void }) {
  const [f, setF] = useState(vacio);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const datos = useCarga(empresa, async () => {
    const [g, a] = await Promise.all([gases(empresa), autorizantes(empresa)]);
    return { g, a };
  });
  const listaGases = datos.datos?.g ?? [];
  const listaAutoriza = datos.datos?.a ?? [];

  return (
    <PildoraPanel etiqueta="Declarar salida" icono="plus">
      {(cerrar) => (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-text">Salida de cilindros</p>
            <p className="text-xs text-muted">Queda registrado quién autoriza y quién se los lleva.</p>
          </div>

          {datos.error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {datos.error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={lbl}>Gas *</span>
              <select value={f.gas} onChange={(e) => setF({ ...f, gas: e.target.value })} className={campo}>
                <option value="">Elegí…</option>
                {listaGases.map((g) => <option key={g.nombre} value={g.nombre}>{g.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lbl}>Cantidad *</span>
              <input type="number" min={1} inputMode="numeric" value={f.cantidad}
                onChange={(e) => setF({ ...f, cantidad: Math.max(1, Number(e.target.value) || 1) })}
                className={`${campo} tabular-nums`} />
            </label>
          </div>

          <label className="block">
            <span className={lbl}>Cliente *</span>
            <input value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })}
              placeholder="A quién van" className={campo} />
          </label>

          <label className="block">
            <span className={lbl}>Autoriza *</span>
            <select value={f.autorizadoPor} onChange={(e) => setF({ ...f, autorizadoPor: e.target.value })} className={campo}>
              <option value="">Elegí…</option>
              {listaAutoriza.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            {/* Si no hay a quien elegir, decirlo: un desplegable vacio parece un
                fallo de carga y deja al operador sin saber que hacer. */}
            {!datos.cargando && listaAutoriza.length === 0 && (
              <span className="mt-1 block text-xs text-warn">
                No hay usuarios con permiso para autorizar. Pedile a un administrador que lo habilite.
              </span>
            )}
          </label>

          <label className="block">
            <span className={lbl}>Quién los retira *</span>
            <input value={f.retiradoPor} onChange={(e) => setF({ ...f, retiradoPor: e.target.value })}
              placeholder="Nombre del que se los lleva" className={campo} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={lbl}>Documento</span>
              <input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })}
                placeholder="N° de nota" className={campo} />
            </label>
            <label className="block">
              <span className={lbl}>Nota</span>
              <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })}
                placeholder="Opcional" className={campo} />
            </label>
          </div>

          {msg && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>
          )}

          <div className="flex gap-2">
            <Button icon="plus" className="flex-1" disabled={guardando}
              onClick={async () => {
                setMsg(null);
                setGuardando(true);
                try {
                  const r = await registrarSalida({ ...f, empresa });
                  if (!r.ok) return setMsg(r.error ?? "No se pudo registrar.");
                  setF(vacio);
                  onRegistrada?.();
                  cerrar();
                } finally { setGuardando(false); }
              }}>
              {guardando ? "Registrando…" : "Registrar salida"}
            </Button>
            <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          </div>
        </div>
      )}
    </PildoraPanel>
  );
}
