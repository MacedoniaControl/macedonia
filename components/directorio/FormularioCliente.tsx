"use client";

// Alta de cliente, en un diálogo sobre la nota que se está armando.
//
// Sigue la ficha de Valery para que quien ya la conoce no tenga que aprender
// otra, pero sin los campos que Macedonia no usa (Zona de ventas, Grupo,
// Referencia, Fax): un campo que nadie llena es un campo que estorba.
//
// Lo único obligatorio es el nombre. El RIF quedó opcional: Macedonia no emite
// documentos fiscales, y más de la mitad de la cartera son personas naturales
// que compran en el mostrador y no lo dan. Ver supabase/16-clientes-sin-rif.sql.

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { guardarCliente, type Cliente, type TipoPersona } from "@/lib/directorio/directorio-db";

const campo =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

const DENOMINACIONES = [
  "Contribuyente ORDINARIO",
  "Contribuyente ESPECIAL",
  "Contribuyente FORMAL",
  "No contribuyente",
];

function Campo({ label, children, ancho = "" }: { label: string; children: React.ReactNode; ancho?: string }) {
  return (
    <label className={`block ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function FormularioCliente({
  rifSugerido = "",
  nombreSugerido = "",
  onCerrar,
  onCreado,
}: {
  rifSugerido?: string;
  nombreSugerido?: string;
  onCerrar: () => void;
  onCreado: (c: Cliente) => void;
}) {
  const [f, setF] = useState({
    rif: rifSugerido,
    tipoPersona: "juridica" as TipoPersona,
    nombre: nombreSugerido,
    denominacion: DENOMINACIONES[0],
    contacto: "",
    correo: "",
    telefonos: "",
    direccion: "",
    ciudad: "",
    limiteCredito: 0,
    diasCredito: 0,
    notas: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    setGuardando(true);
    try {
      const r = await guardarCliente(f);
      if (!r.ok) return setMsg(r.error);
      onCreado(r.cliente);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo cliente"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text">Nuevo cliente</h2>
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
          <Campo label="R.I.F.">
            <input
              value={f.rif}
              onChange={set("rif")}
              placeholder="J-12345678-9"
              autoCapitalize="characters"
              className={`${campo} font-mono`}
            />
            <span className="mt-1 block text-[11px] text-muted">
              Opcional. Déjalo vacío si el cliente no lo da.
            </span>
          </Campo>

          <Campo label="Tipo de cliente">
            <select value={f.tipoPersona} onChange={set("tipoPersona")} className={campo}>
              <option value="juridica">Jurídica</option>
              <option value="natural">Natural</option>
            </select>
          </Campo>

          <Campo label="Nombre o razón social *" ancho="sm:col-span-2">
            <input value={f.nombre} onChange={set("nombre")} className={campo} />
          </Campo>

          <Campo label="Denominación fiscal" ancho="sm:col-span-2">
            <select value={f.denominacion} onChange={set("denominacion")} className={campo}>
              {DENOMINACIONES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>

          <Campo label="Contacto"><input value={f.contacto} onChange={set("contacto")} className={campo} /></Campo>
          <Campo label="Correo electrónico"><input type="email" value={f.correo} onChange={set("correo")} className={campo} /></Campo>

          <Campo label="Dirección" ancho="sm:col-span-2">
            <input value={f.direccion} onChange={set("direccion")} className={campo} />
          </Campo>

          <Campo label="Ciudad"><input value={f.ciudad} onChange={set("ciudad")} className={campo} /></Campo>
          <Campo label="Teléfonos"><input value={f.telefonos} onChange={set("telefonos")} className={campo} /></Campo>

          <Campo label="Días de crédito">
            <input type="number" inputMode="numeric" min={0} value={f.diasCredito}
              onChange={(e) => setF({ ...f, diasCredito: Math.max(0, Number(e.target.value) || 0) })}
              className={`${campo} tabular-nums`} />
          </Campo>

          <Campo label="Límite de crédito (USD)">
            <input type="number" inputMode="decimal" min={0} value={f.limiteCredito}
              onChange={(e) => setF({ ...f, limiteCredito: Math.max(0, Number(e.target.value) || 0) })}
              className={`${campo} tabular-nums`} />
          </Campo>

          <Campo label="Notas" ancho="sm:col-span-2">
            <input value={f.notas} onChange={set("notas")} className={campo} />
          </Campo>
        </div>

        <p className="mt-3 text-xs text-muted">
          La ficha se comparte con la otra empresa: se carga una vez y sirve para las dos.
          Lo que <strong>no</strong> se comparte es lo que cada empresa le vendió.
        </p>

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
            {guardando ? "Guardando…" : "Guardar y usar"}
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
