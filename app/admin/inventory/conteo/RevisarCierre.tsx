"use client";

// Revisar antes de cerrar.
//
// Cerrar NO cambia el inventario: asigna el numero, toma la existencia del
// sistema en ese momento y archiva las actas. Por eso la revision muestra lo
// que va a quedar en el acta, y frena si falta quien conto o si hay una
// cantidad que no se entiende.

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { leerCantidad, vaEntera, fmtCantidad } from "@/lib/inventory/cantidad";
import { esSkuMacedonia, fmtDif, fmtNum } from "@/lib/inventory/acta";
import { cerrarConteo, urlActa, type TipoArchivo } from "@/lib/inventory/conteos-db";
import type { Fila } from "./Contar";

export function RevisarCierre({ conteoId, titulo, fecha, conto, onConto, filas, sinContar, errores, onCerrar, onCerrado }: {
  conteoId: number; titulo: string; fecha: string; conto: string; onConto: (v: string) => void;
  filas: Fila[]; sinContar: number; errores: Fila[];
  onCerrar: () => void; onCerrado: () => void;
}) {
  const [yendo, setYendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ numero?: string; actas?: boolean; errorActas?: string } | null>(null);

  const contados = filas.filter((f) => ["ok", "cero"].includes(leerCantidad(f.texto).estado));
  const ceros = contados.filter((f) => leerCantidad(f.texto).estado === "cero");
  const nuevos = contados.filter((f) => esSkuMacedonia(f.codigo));
  const raros = contados.filter((f) => { const l = leerCantidad(f.texto); return l.estado === "ok" && vaEntera(f.unidad) && !Number.isInteger(l.valor); });
  const bloqueos = [
    !conto.trim() && "Falta quién contó. Sin eso el conteo no se puede auditar.",
    errores.length > 0 && `Hay ${errores.length} cantidad(es) que no se entienden: renglón ${errores.map((f) => f.renglon ?? "+").join(", ")}.`,
  ].filter(Boolean) as string[];

  if (hecho) {
    return (
      <Modal titulo="Conteo cerrado" onCerrar={onCerrado}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/10 text-ok"><Icon name="check" size={24} /></div>
          <div>
            <p className="font-mono text-lg font-bold text-brand">{hecho.numero ?? "Cerrado"}</p>
            <p className="mt-1 text-sm text-muted">{contados.length} renglón(es) de {titulo}. El inventario no cambió.</p>
          </div>
          {hecho.actas ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Descarga id={conteoId} tipo="acta_pdf" label="Acta en PDF" />
              <Descarga id={conteoId} tipo="acta_xlsx" label="Acta en Excel" />
            </div>
          ) : hecho.numero ? (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-left text-sm text-warn">
              El conteo quedó cerrado, pero las actas no se pudieron generar{hecho.errorActas ? `: ${hecho.errorActas}` : ""}. Se pueden volver a generar desde el historial.
            </p>
          ) : null}
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-left text-sm text-warn">
            Las diferencias esperan la aprobación de un owner o admin, en el historial.
          </p>
          <Button className="w-full" onClick={onCerrado}>Ver en el historial</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Revisá antes de cerrar" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{titulo} · {fecha.split("-").reverse().join("-")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Cifra n={contados.length} t="quedan en el acta con su cantidad" c="text-ok" />
          <Cifra n={ceros.length} t="quedan en cero" c="text-warn" />
          <Cifra n={sinContar} t="sin contar: no se tocan, siguen como están" c="text-text" />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Contó <span className="text-danger">*</span></span>
          <input className="sumi-campo" value={conto} onChange={(e) => onConto(e.target.value)} placeholder="Quién hizo el conteo" />
        </label>
        {bloqueos.length > 0 && (
          <div role="alert" className="space-y-1 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{bloqueos.map((b) => <p key={b}>{b}</p>)}</div>
        )}
        {ceros.length > 0 && (
          <div className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
            <b>¿Seguro que no hay ninguno?</b>
            <ul className="mt-1 list-disc pl-5">{ceros.map((f) => <li key={f.codigo}>{f.codigo} · {f.nombre}</li>)}</ul>
          </div>
        )}
        {raros.length > 0 && (
          <div className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
            <b>Decimales en productos que van por unidad</b>
            <ul className="mt-1 list-disc pl-5">{raros.map((f) => <li key={f.codigo}>{f.codigo}: {f.texto}</li>)}</ul>
          </div>
        )}
        {nuevos.length > 0 && (
          <div className="rounded-xl bg-brand/10 px-3 py-2 text-sm text-text">
            <b className="text-brand">{nuevos.length} artículo(s) nuevo(s) con SKU de Macedonia</b>
            <p className="text-muted">Entran con la ficha incompleta: faltan costo, precio e IVA, que se completan en Productos.</p>
          </div>
        )}
        <div className="max-h-64 overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2">Identificación</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Dif.</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contados.map((f) => {
                const l = leerCantidad(f.texto) as { valor: number };
                const nuevo = esSkuMacedonia(f.codigo);
                const d = nuevo ? null : Math.round((l.valor - f.sistema) * 1000) / 1000;
                return (
                  <tr key={f.codigo}>
                    <td className="px-3 py-1.5 font-mono">{f.codigo}</td>
                    <td className="px-3 py-1.5">{f.nombre}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{nuevo ? "nuevo" : fmtNum(f.sistema)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtCantidad(l.valor)} {f.unidad}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${d === null ? "text-brand" : d < 0 ? "text-danger" : d > 0 ? "text-info" : "text-muted"}`}>{fmtDif(d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="rounded-xl bg-info/10 px-3 py-2 text-xs text-info">
          <b>Cerrar no cambia el inventario.</b> El sistema de esta tabla es el de ahora; al cerrar se toma de nuevo y queda fijo en el acta. Las diferencias se ajustan después, solo si un owner o admin las aprueba.
        </p>
        {fallo && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{fallo}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCerrar}>Volver a la planilla</Button>
          <Button icon="check" cargando={yendo} textoCargando="Cerrando y generando actas…" disabled={bloqueos.length > 0 || yendo}
            onClick={async () => {
              setFallo(null); setYendo(true);
              try {
                const r = await cerrarConteo(conteoId, conto);
                if (!r.ok) return setFallo(r.error ?? "No se pudo cerrar.");
                setHecho({ numero: r.numero, actas: r.actas, errorActas: r.errorActas });
              } finally { setYendo(false); }
            }}>
            Cerrar conteo y generar acta
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Cifra({ n, t, c }: { n: number; t: string; c: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <p className={`text-2xl font-semibold tabular-nums ${c}`}>{n}</p>
      <p className="text-xs text-muted">{t}</p>
    </div>
  );
}

/** Pide un enlace firmado de 5 minutos y descarga. */
export function Descarga({ id, tipo, label }: { id: number; tipo: TipoArchivo; label: string }) {
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ext = tipo.endsWith("pdf") ? "PDF" : "XLSX";
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" disabled={yendo}
        onClick={async () => {
          setError(null); setYendo(true);
          try {
            const r = await urlActa(id, tipo);
            if (!r.ok) return setError(r.error);
            window.location.href = r.url;
          } finally { setYendo(false); }
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm hover:border-border-strong disabled:opacity-60">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${ext === "PDF" ? "bg-[#b3261e]" : "bg-[#1d6f42]"}`}>{ext}</span>
        {yendo ? "Preparando…" : label}
      </button>
      {error && <span className="mt-1 text-[11px] text-danger">{error}</span>}
    </span>
  );
}
