"use client";

// Conteos de la Rampa, en el Historial: el Técnico cuenta, el Owner o un
// Administrador aprueba. Contar no ajusta; aprobar convierte cada diferencia
// en un movimiento del parque. La base lo vuelve a comprobar
// (aprobar_conteo_cilindros): esconder los botones es comodidad, no seguridad.

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { aprobarConteoRampa, conteosRampa, rechazarConteoRampa, type ConteoRampa } from "@/lib/cilindros/cilindros-db";
import { conSigno, diferencias, ETIQUETA_RAMPA } from "@/lib/cilindros/rampa";

const ESTADO: Record<ConteoRampa["estado"], { t: string; tone: Tone }> = {
  pendiente: { t: "Por aprobar", tone: "warn" },
  aprobado: { t: "Aprobado", tone: "ok" },
  rechazado: { t: "Rechazado", tone: "danger" },
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function ConteosRampa({ empresa, recarga, onCambio }: { empresa: string; recarga: number; onCambio: () => void }) {
  const [propia, setPropia] = useState(0);
  const carga = useCarga(`cilconteos:${empresa}:${recarga}:${propia}`, () => conteosRampa(empresa));
  const lista = carga.datos ?? [];
  const [abierto, setAbierto] = useState<number | null>(null);
  const pendientes = lista.filter((c) => c.estado === "pendiente").length;

  if (carga.error) return <p role="alert" className="text-sm text-danger">{carga.error}</p>;
  if (!carga.cargando && lista.length === 0) return null;

  return (
    <SectionCard
      title="Conteos de Rampa"
      description={pendientes
        ? "Hay un conteo esperando tu aprobación. El parque cambia recién cuando lo apruebas."
        : "Lo que se contó en el galpón y qué se decidió. Al aprobar, cada diferencia entra al parque."}
    >
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {lista.map((c) => (
          <Fila key={c.id} c={c} abierto={abierto === c.id || (abierto === null && c.estado === "pendiente")}
            onToggle={() => setAbierto(abierto === c.id ? -1 : c.id)}
            onCambio={() => { setPropia((n) => n + 1); onCambio(); }} />
        ))}
      </ul>
    </SectionCard>
  );
}

function Fila({ c, abierto, onToggle, onCambio }: { c: ConteoRampa; abierto: boolean; onToggle: () => void; onCambio: () => void }) {
  const dif = diferencias(c.renglones);
  const est = ESTADO[c.estado];
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={abierto}
        className="grid w-full grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-x-3 gap-y-1 px-3 py-3 text-left hover:bg-surface-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_7rem_1.5rem]">
        <span className="font-mono text-sm font-bold text-brand">{c.numero}</span>
        <span className="col-start-1 min-w-0 sm:col-start-auto">
          <b className="block truncate text-sm font-semibold text-text">{dif.length} diferencia(s) · contó {c.creadoNombre}</b>
          <span className="text-xs text-muted">{hora(c.creadoEn)}</span>
        </span>
        <span className="col-start-1 sm:col-start-auto"><StatusBadge tone={est.tone}>{est.t}</StatusBadge></span>
        <span className={`col-start-2 row-start-1 text-muted transition sm:col-start-auto sm:row-start-auto ${abierto ? "rotate-90" : ""}`} aria-hidden>
          <Icon name="chevronRight" size={16} />
        </span>
      </button>
      {abierto && <Detalle c={c} onCambio={onCambio} />}
    </li>
  );
}

function Detalle({ c, onCambio }: { c: ConteoRampa; onCambio: () => void }) {
  const dif = diferencias(c.renglones);
  const [nota, setNota] = useState("");
  const [yendo, setYendo] = useState<"" | "aprobar" | "rechazar">("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const accion = async (que: "aprobar" | "rechazar") => {
    setMsg(null); setYendo(que);
    try {
      const r = que === "aprobar" ? await aprobarConteoRampa(c.id, nota) : await rechazarConteoRampa(c.id, nota);
      if (!r.ok) return setMsg({ ok: false, t: r.error ?? "No se pudo." });
      setNota("");
      onCambio();
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "No se pudo." });
    } finally { setYendo(""); }
  };

  return (
    <div className="space-y-3 px-3 pb-4">
      <p className="text-sm text-muted">Motivo: <span className="text-text">{c.motivo}</span></p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Gas</th><th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Sistema</th><th className="px-3 py-2 text-right font-medium">Contado</th>
              <th className="px-3 py-2 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dif.map((d) => (
              <tr key={`${d.gas}-${d.estado}`}>
                <td className="px-3 py-2 font-medium text-text">{d.gas}</td>
                <td className="px-3 py-2 text-muted">{ETIQUETA_RAMPA[d.estado]}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{d.sistema}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-text">{d.contado}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${d.diferencia < 0 ? "text-danger" : "text-info"}`}>{conSigno(d.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.estado === "pendiente" ? (
        <div className="space-y-2 rounded-xl bg-warn/10 p-3">
          <p className="text-sm text-text">
            Al aprobar, cada diferencia pasa a ser un movimiento del parque con motivo «Conteo de rampa {c.numero}». Si después del conteo hubo entregas, siguen valiendo: se aplica la diferencia, no se pisa el saldo.
          </p>
          <input className="sumi-campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (obligatoria para rechazar)" />
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              title="¿Aprobar el conteo?"
              message={`${dif.map((d) => `${d.gas} ${ETIQUETA_RAMPA[d.estado].toLowerCase()} ${conSigno(d.diferencia)}`).join(" · ")}. Estas diferencias entran al parque y quedan en el historial con tu nombre.`}
              confirmLabel="Sí, aprobar"
              cancelLabel="No"
              onConfirm={() => accion("aprobar")}
              trigger={(abrir) => (
                <Button icon="check" cargando={yendo === "aprobar"} textoCargando="Aprobando…" disabled={!!yendo} onClick={abrir}>Aprobar conteo</Button>
              )}
            />
            <Button variant="secondary" cargando={yendo === "rechazar"} textoCargando="Rechazando…" disabled={!!yendo || !nota.trim()} onClick={() => accion("rechazar")}>Rechazar</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {c.estado === "aprobado" ? "Aprobó" : "Rechazó"} {c.resueltoNombre} el {c.resueltoEn ? hora(c.resueltoEn) : "—"}
          {c.estado === "aprobado" ? ` · ${c.movimientos ?? 0} movimiento(s) en el parque` : ""}
          {c.resueltoNota ? ` · «${c.resueltoNota}»` : ""}
        </p>
      )}
      {msg && <p role="alert" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{msg.t}</p>}

    </div>
  );
}
