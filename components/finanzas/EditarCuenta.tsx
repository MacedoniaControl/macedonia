"use client";

// Corregir una cuenta ya cargada.
//
// Pedido por Greeg: "cada cuenta debe poder ser modificada por si el usuario
// comete algun error". Tambien es por donde se completa el desglose fiscal de
// las 40 cuentas que se cargaron sin BI ni IVA.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";
import { CLASES, retencionDe, type ClaseCuenta } from "@/lib/finanzas/retencion";
import { editarCuenta, type CuentaDetalle } from "@/lib/finanzas/cuentas-db";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const txt = (n: number | null) => (n === null ? "" : fmtMonto(n));

export function EditarCuenta({
  cuenta, onGuardada, onCancelar,
}: { cuenta: CuentaDetalle; onGuardada: () => void; onCancelar: () => void }) {
  const [f, setF] = useState({
    contraparte: cuenta.contraparte,
    documento: cuenta.documento,
    clase: cuenta.clase as ClaseCuenta,
    emitida: cuenta.emitida,
    vence: cuenta.vence,
    nota: cuenta.nota ?? "",
    aplicaRetencion: cuenta.aplicaRetencion,
  });
  const [bi, setBi] = useState(txt(cuenta.baseImponible));
  const [iva, setIva] = useState(txt(cuenta.iva));
  const [montoManual, setMontoManual] = useState(txt(cuenta.monto));
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const nBi = parseMonto(bi);
  const nIva = parseMonto(iva);
  const ret = retencionDe(nIva, f.aplicaRetencion);
  const suma = nBi !== null || nIva !== null ? (nBi ?? 0) + (nIva ?? 0) : null;

  // El MONTO manda, siempre. Antes se recalculaba desde BI + IVA y pisaba el
  // total cargado: en una cuenta de 195 que viene de Valery, teclear BI 100 e
  // IVA 16 la dejaba en 116 y se perdia la cifra buena. Greeg pidio que las 40
  // ya cargadas conserven su total y que el IVA se agregue a mano.
  const monto = parseMonto(montoManual);
  // Si el desglose no suma el total, se avisa — no se corrige solo.
  const descuadre = monto !== null && suma !== null ? Math.round((suma - monto) * 100) / 100 : 0;

  async function guardar() {
    setMsg(null);
    if (monto === null) return setMsg("Falta el monto, o no se entiende. Ejemplo: 1.500,50");
    setGuardando(true);
    try {
      const r = await editarCuenta(cuenta.id, {
        contraparte: f.contraparte, documento: f.documento, clase: f.clase,
        monto, baseImponible: nBi, iva: nIva,
        ivaRetenido: f.aplicaRetencion && nIva !== null ? ret : null,
        aplicaRetencion: f.aplicaRetencion,
        emitida: f.emitida, vence: f.vence, nota: f.nota,
      });
      if (!r.ok) return setMsg(r.error ?? "No se pudo guardar.");
      onGuardada();
    } finally { setGuardando(false); }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold text-text">Editar cuenta</p>

      <label className="block">
        <span className={lbl}>Proveedor / Cliente *</span>
        <input value={f.contraparte} onChange={(e) => setF({ ...f, contraparte: e.target.value })} className={campo} />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Documento</span>
          <input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} className={`${campo} font-mono`} />
        </label>
        <label className="block">
          <span className={lbl}>Clase</span>
          <select value={f.clase} onChange={(e) => setF({ ...f, clase: e.target.value as ClaseCuenta })} className={campo}>
            {CLASES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Emitida</span>
          <input type="date" value={f.emitida} onChange={(e) => setF({ ...f, emitida: e.target.value })} className={campo} />
        </label>
        <label className="block">
          <span className={lbl}>Vence</span>
          <input type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} className={campo} />
        </label>
      </div>

      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted">Desglose fiscal</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <CampoMonto etiqueta="Base imponible" valor={bi} onChange={setBi} />
          <CampoMonto etiqueta="IVA" valor={iva} onChange={setIva} />
        </div>

        {/* Una nota de entrega no es documento fiscal: Greeg pidio poder decir,
            cuenta por cuenta, si lleva retencion. */}
        <label className="mt-1 flex min-h-11 items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={f.aplicaRetencion}
            onChange={(e) => setF({ ...f, aplicaRetencion: e.target.checked })}
            className="h-5 w-5 rounded border-border-strong" />
          Esta cuenta lleva IVA retenido
        </label>

        {suma !== null && (
          <div className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs">
            <p className="flex justify-between text-muted">
              <span>Base imponible + IVA</span><span className="tabular-nums">{fmtMonto(suma)}</span>
            </p>
            {Math.abs(descuadre) > 0.009 && (
              <p role="alert" className="mt-1 rounded-lg border border-warn/35 bg-warn/10 px-2 py-1.5 text-warn">
                No suma el monto total ({fmtMonto(monto ?? 0)}):{" "}
                {descuadre > 0 ? "sobran" : "faltan"} {fmtMonto(Math.abs(descuadre))}. El
                total no se toca — revisá el desglose.
              </p>
            )}
            <p className="flex justify-between text-muted">
              <span>{f.aplicaRetencion ? "IVA retenido (75%)" : "IVA retenido"}</span>
              <span className="tabular-nums">{f.aplicaRetencion ? `−${fmtMonto(ret)}` : "no aplica"}</span>
            </p>
            <p className="flex justify-between font-semibold text-text">
              <span>A pagar al proveedor</span>
              <span className="tabular-nums">{fmtMonto((monto ?? 0) - ret)}</span>
            </p>
          </div>
        )}
      </fieldset>

      <CampoMonto etiqueta="Monto total *" valor={montoManual} onChange={setMontoManual} />

      <label className="block">
        <span className={lbl}>Nota</span>
        <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className={campo} />
      </label>

      {msg && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>
      )}

      <div className="flex gap-2">
        <Button icon="check" className="flex-1" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
