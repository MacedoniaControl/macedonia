"use client";

// Alta manual de una cuenta por cobrar o por pagar.
//
// Vive dentro de una píldora, no en una columna fija: se carga una cuenta de a
// ratos, y la tabla de cartera es lo que se mira todo el día.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";
import { crearCuenta, type TipoCuenta } from "@/lib/finanzas/cuentas-db";

const campo = "sumi-campo";

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
  // Los montos se guardan como TEXTO: es lo que la persona escribio, y
  // parseMonto decide que significa. Convertir en cada tecla perdia lo escrito.
  const [f, setF] = useState({ contraparte: "", documento: "", vence: hoy(), nota: "" });
  const [bi, setBi] = useState("");
  const [iva, setIva] = useState("");
  const [ret, setRet] = useState("");
  const [montoManual, setMontoManual] = useState("");

  const nBi = parseMonto(bi);
  const nIva = parseMonto(iva);
  const nRet = parseMonto(ret);
  // Total de la operacion = BI + IVA. Comprobado contra la Relacion de Cuentas
  // por Pagar de Valery: 359,10 + 57,46 = 416,56.
  const totalCalc = nBi !== null || nIva !== null ? (nBi ?? 0) + (nIva ?? 0) : null;
  // La retencion la retiene el comprador: no se le paga al proveedor.
  const aPagar = totalCalc !== null ? totalCalc - (nRet ?? 0) : null;
  // Sin desglose se escribe el monto a mano, como hasta ahora.
  const monto = aPagar ?? parseMonto(montoManual);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    if (!f.contraparte.trim()) return setMsg(`Falta el ${quien.toLowerCase()}.`);
    if (!f.documento.trim()) return setMsg("Falta el número de documento.");
    if (monto === null) return setMsg("Falta el monto, o no se entiende. Ejemplo: 1.500,50");
    if (monto <= 0) return setMsg("El monto tiene que ser mayor que cero.");
    if (nRet !== null && totalCalc !== null && nRet > totalCalc) {
      return setMsg("La retención no puede ser mayor que el total de la operación.");
    }

    setGuardando(true);
    try {
      const r = await crearCuenta(
        { tipo, ...f, monto, baseImponible: nBi, iva: nIva, ivaRetenido: nRet },
        empresa,
      );
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Documento *</span>
          <input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} className={`${campo} font-mono`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Vence</span>
          <input type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} className={campo} />
        </label>
      </div>

      {/* Desglose fiscal. Es opcional: una cuenta sin factura -un anticipo, un
          prestamo entre empresas- no tiene BI ni IVA, y exigirlo dejaria sin
          cargar cosas que si se deben. */}
      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted">Desglose de la factura (opcional)</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CampoMonto etiqueta="Base imponible" valor={bi} onChange={setBi} />
          <CampoMonto etiqueta="IVA" valor={iva} onChange={setIva} />
          <CampoMonto etiqueta="IVA retenido" valor={ret} onChange={setRet} />
        </div>

        {totalCalc !== null && (
          <div className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs">
            <p className="flex justify-between text-muted">
              <span>Total de la operación</span>
              <span className="tabular-nums">{fmtMonto(totalCalc)}</span>
            </p>
            {nRet !== null && nRet > 0 && (
              <p className="flex justify-between text-muted">
                <span>Menos IVA retenido</span>
                <span className="tabular-nums">−{fmtMonto(nRet)}</span>
              </p>
            )}
            <p className="flex justify-between font-semibold text-text">
              <span>Queda por {tipo === "cobrar" ? "cobrar" : "pagar"}</span>
              <span className="tabular-nums">{fmtMonto(aPagar ?? 0)}</span>
            </p>
          </div>
        )}
      </fieldset>

      {/* Sin desglose hay que escribir el monto. Con desglose sale solo, y el
          campo desaparece para que no haya dos numeros que puedan discrepar. */}
      {totalCalc === null && (
        <CampoMonto etiqueta="Monto *" valor={montoManual} onChange={setMontoManual} />
      )}

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
