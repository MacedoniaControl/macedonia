"use client";

// Alta y edición de proveedores. Sigue la ficha de Valery.
//
// «% Retención IVA», «Días de crédito» y «Límite de crédito» se GUARDAN pero no
// calculan nada: Macedonia no emite documentos fiscales, así que no retiene.
// Están para que quien carga una compra tenga el dato a mano, no para que el
// sistema haga una cuenta de la que después nadie se hace responsable.

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { guardarProveedor, type Proveedor, type TipoPersona } from "@/lib/directorio/directorio-db";

const campo = "sumi-campo";

function Campo({ label, children, ancho = "" }: { label: string; children: React.ReactNode; ancho?: string }) {
  return (
    <label className={`block ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function FormularioProveedor({
  inicial,
  onCerrar,
  onGuardado,
}: {
  inicial?: Partial<Proveedor>;
  onCerrar: () => void;
  onGuardado: (p: Proveedor) => void;
}) {
  const [f, setF] = useState({
    rif: inicial?.rif ?? "",
    tipoPersona: (inicial?.tipoPersona ?? "juridica") as TipoPersona,
    nombre: inicial?.nombre ?? "",
    nacional: inicial?.nacional ?? true,
    contacto: inicial?.contacto ?? "",
    correo: inicial?.correo ?? "",
    telefonos: inicial?.telefonos ?? "",
    direccion: inicial?.direccion ?? "",
    ciudad: inicial?.ciudad ?? "",
    diasCredito: inicial?.diasCredito ?? 0,
    limiteCredito: inicial?.limiteCredito ?? 0,
    pctRetencion: inicial?.pctRetencion ?? 0,
    notas: inicial?.notas ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const num = (k: "diasCredito" | "limiteCredito" | "pctRetencion") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setF({ ...f, [k]: Math.max(0, Number(e.target.value) || 0) });

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    setGuardando(true);
    try {
      const r = await guardarProveedor(f);
      if (!r.ok) return setMsg(r.error);
      onGuardado(r.proveedor);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Proveedor"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text">
            {inicial?.rif ? "Editar proveedor" : "Nuevo proveedor"}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:text-text"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="R.I.F. *">
            <input
              value={f.rif}
              onChange={set("rif")}
              placeholder="J-12345678-9"
              autoCapitalize="characters"
              disabled={!!inicial?.rif}
              className={`${campo} font-mono disabled:opacity-60`}
            />
          </Campo>

          <Campo label="Tipo de persona">
            <select value={f.tipoPersona} onChange={set("tipoPersona")} className={campo}>
              <option value="juridica">Jurídica</option>
              <option value="natural">Natural</option>
            </select>
          </Campo>

          <Campo label="Nombre o razón social *" ancho="sm:col-span-2">
            <input value={f.nombre} onChange={set("nombre")} className={campo} />
          </Campo>

          <Campo label="Tipo de proveedor">
            <select
              value={f.nacional ? "nacional" : "extranjero"}
              onChange={(e) => setF({ ...f, nacional: e.target.value === "nacional" })}
              className={campo}
            >
              <option value="nacional">Nacional</option>
              <option value="extranjero">Extranjero</option>
            </select>
          </Campo>

          <Campo label="Contacto"><input value={f.contacto} onChange={set("contacto")} className={campo} /></Campo>

          <Campo label="Correo electrónico"><input type="email" value={f.correo} onChange={set("correo")} className={campo} /></Campo>
          <Campo label="Teléfonos"><input value={f.telefonos} onChange={set("telefonos")} className={campo} /></Campo>

          <Campo label="Dirección" ancho="sm:col-span-2">
            <input value={f.direccion} onChange={set("direccion")} className={campo} />
          </Campo>

          <Campo label="Ciudad" ancho="sm:col-span-2">
            <input value={f.ciudad} onChange={set("ciudad")} className={campo} />
          </Campo>
        </div>

        <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Crédito y retención
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Días de crédito">
            <input type="number" inputMode="numeric" min={0} value={f.diasCredito}
              onChange={num("diasCredito")} className={`${campo} tabular-nums`} />
          </Campo>
          <Campo label="Límite de crédito (USD)">
            <input type="number" inputMode="decimal" min={0} value={f.limiteCredito}
              onChange={num("limiteCredito")} className={`${campo} tabular-nums`} />
          </Campo>
          <Campo label="% Retención IVA">
            <input type="number" inputMode="decimal" min={0} max={100} value={f.pctRetencion}
              onChange={num("pctRetencion")} className={`${campo} tabular-nums`} />
          </Campo>
        </div>

        <p className="mt-2 text-xs text-muted">
          Estos tres campos se guardan como referencia. Macedonia no emite documentos fiscales,
          así que <strong>no calcula retenciones</strong>: quedan a la vista de quien carga la compra.
        </p>

        <Campo label="Notas" ancho="mt-3">
          <input value={f.notas} onChange={set("notas")} className={campo} />
        </Campo>

        {msg && (
          <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {msg}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="h-12 flex-1 rounded-xl bg-brand-strong text-sm font-semibold text-white
                       transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar proveedor"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="h-12 rounded-xl border border-border-strong px-4 text-sm font-medium text-text"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
