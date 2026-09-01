"use client";

// Alta manual de una cuenta por cobrar o por pagar.
//
// Vive dentro de una píldora, no en una columna fija: se carga una cuenta de a
// ratos, y la tabla de cartera es lo que se mira todo el día.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { crearCuenta, type TipoCuenta } from "@/lib/finanzas/cuentas-db";

const campo =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

const hoy = () => new Date().toISOString().slice(0, 10);

export function FormularioCuenta({
  tipo,
  empresa,
  onCreada,
  onCerrar,
}: {
  tipo: TipoCuenta;
  empresa: string;
  onCreada: () => void;
  onCerrar: () => void;
}) {
  const quien = tipo === "cobrar" ? "Cliente" : "Proveedor";
  const [f, setF] = useState({ contraparte: "", documento: "", monto: 0, vence: hoy(), nota: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    if (!f.contraparte.trim()) return setMsg(`Falta el ${quien.toLowerCase()}.`);
    if (!f.documento.trim()) return setMsg("Falta el número de documento.");
    if (f.monto <= 0) return setMsg("El monto tiene que ser mayor que cero.");

    setGuardando(true);
    try {
      const r = await crearCuenta({ tipo, ...f, monto: Number(f.monto) }, empresa);
      if (!r.ok) return setMsg(r.error ?? "No se pudo guardar.");
      onCreada();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">
        Nueva cuenta por {tipo === "cobrar" ? "cobrar" : "pagar"}
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{quien} *</span>
        <input value={f.contraparte} onChange={(e) => setF({ ...f, contraparte: e.target.value })} className={campo} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Documento *</span>
          <input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} className={`${campo} font-mono`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Monto USD *</span>
          <input type="number" inputMode="decimal" min={0} value={f.monto}
            onChange={(e) => setF({ ...f, monto: Math.max(0, Number(e.target.value) || 0) })}
            className={`${campo} tabular-nums`} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Vence</span>
        <input type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} className={campo} />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Nota</span>
        <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className={campo} />
      </label>

      {msg && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {msg}
        </p>
      )}

      <div className="flex gap-2">
        <Button icon="cash" onClick={guardar} disabled={guardando} className="flex-1">
          {guardando ? "Guardando…" : "Guardar cuenta"}
        </Button>
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}
