"use client";

// Alta manual de una cuenta por cobrar o por pagar.
//
// Vive dentro de una píldora, no en una columna fija: se carga una cuenta de a
// ratos, y la tabla de cartera es lo que se mira todo el día.
//
// El IVA NO se escribe: sale solo del monto. El monto que se teclea es el
// TOTAL del documento -la cifra que dice el papel y la que se debe-, asi que
// la base se obtiene dividiendo por 1,16 y el IVA es el resto. Sumarle el IVA
// encima dejaria el monto distinto del que figura en la factura.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";
import { crearCuenta, type TipoCuenta } from "@/lib/finanzas/cuentas-db";
import { CLASES, desglosar, PCT_IVA, PCT_RETENCION, type ClaseCuenta } from "@/lib/finanzas/retencion";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoy = () => new Date().toISOString().slice(0, 10);

/** Las tres que se cargan a mano. Ajuste y nota de crédito salen de importar. */
const CLASES_ALTA: ClaseCuenta[] = ["factura", "nota_entrega", "nota_debito"];

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
  const [f, setF] = useState({ contraparte: "", documento: "", vence: hoy(), nota: "" });
  const [clase, setClase] = useState<ClaseCuenta>("factura");
  const [montoTxt, setMontoTxt] = useState("");
  const [conIva, setConIva] = useState(true);
  const [retiene, setRetiene] = useState(true);
  const [imagen, setImagen] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const monto = parseMonto(montoTxt);
  const d = monto !== null ? desglosar(monto, conIva, retiene) : null;

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    if (!f.contraparte.trim()) return setMsg(`Falta el ${quien.toLowerCase()}.`);
    if (!f.documento.trim()) return setMsg("Falta el número de documento.");
    if (monto === null) return setMsg("Falta el monto, o no se entiende. Ejemplo: 1.500,50");
    if (monto <= 0) return setMsg("El monto tiene que ser mayor que cero.");

    setGuardando(true);
    try {
      const r = await crearCuenta({
        tipo, ...f, clase, monto,
        baseImponible: conIva ? d!.base : null,
        iva: conIva ? d!.iva : null,
        ivaRetenido: conIva && retiene ? d!.retencion : null,
        aplicaRetencion: conIva && retiene,
        imagen,
      }, empresa);
      if (!r.ok) return setMsg(r.error ?? "No se pudo guardar.");
      // Se creó, pero puede haber quedado algo fuera: decirlo antes de cerrar.
      if (r.aviso) return setAviso(r.aviso);
      onCreada();
      onCerrar();
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">
        Nueva cuenta por {tipo === "cobrar" ? "cobrar" : "pagar"}
      </p>

      <label className="block">
        <span className={lbl}>{quien} *</span>
        <input value={f.contraparte} onChange={(e) => setF({ ...f, contraparte: e.target.value })} className={campo} />
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Documento *</span>
          <input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} className={`${campo} font-mono`} />
        </label>
        <label className="block">
          <span className={lbl}>Clase *</span>
          <select value={clase} onChange={(e) => setClase(e.target.value as ClaseCuenta)} className={campo}>
            {CLASES.filter((c) => CLASES_ALTA.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={lbl}>Vence</span>
        <input type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} className={campo} />
      </label>

      <CampoMonto etiqueta="Monto total *" valor={montoTxt} onChange={setMontoTxt} />

      {/* El IVA se calcula solo; los interruptores dicen si aplica. */}
      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted">Impuestos</legend>

        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)}
            className="h-5 w-5 rounded border-border-strong" />
          El monto incluye IVA ({Math.round(PCT_IVA * 100)}%)
        </label>

        {conIva && (
          <label className="flex min-h-11 items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={retiene} onChange={(e) => setRetiene(e.target.checked)}
              className="h-5 w-5 rounded border-border-strong" />
            Se retiene el {Math.round(PCT_RETENCION * 100)}% del IVA
          </label>
        )}

        {d && d.total > 0 && (
          // El desglose se muestra mientras se escribe: si el monto que se
          // tecleo no era el total, se ve en el acto y no despues.
          <dl className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs">
            <Fila k="Base imponible" v={fmtMonto(d.base)} />
            <Fila k={`IVA (${Math.round(PCT_IVA * 100)}%)`} v={conIva ? fmtMonto(d.iva) : "no aplica"} />
            <Fila k="Total del documento" v={fmtMonto(d.total)} />
            {conIva && retiene && (
              <Fila k={`IVA retenido (${Math.round(PCT_RETENCION * 100)}%)`} v={`−${fmtMonto(d.retencion)}`} />
            )}
            <div className="border-t border-border pt-1">
              <Fila
                k={tipo === "cobrar" ? "A cobrar al cliente" : "A pagar al proveedor"}
                v={fmtMonto(d.total - d.retencion)}
                fuerte
              />
            </div>
          </dl>
        )}
      </fieldset>

      <label className="block">
        <span className={lbl}>Imagen del documento (foto o PDF)</span>
        <input type="file" accept="image/*,application/pdf"
          onChange={(e) => setImagen(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-muted file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-border file:bg-surface-2 file:px-3 file:text-sm file:text-text" />
        {imagen && (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-ok">
            <Icon name="check" size={14} /> {imagen.name}
          </span>
        )}
      </label>

      <label className="block">
        <span className={lbl}>Nota</span>
        <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className={campo} />
      </label>

      {msg && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>
      )}

      {aviso && (
        <div role="status" className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-sm text-warn">
          <p>{aviso}</p>
          <button type="button" onClick={() => { onCreada(); onCerrar(); }}
            className="mt-1.5 min-h-11 text-sm font-medium text-text underline">
            Entendido, cerrar
          </button>
        </div>
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

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={fuerte ? "font-semibold text-text" : "text-muted"}>{k}</dt>
      <dd className={`tabular-nums ${fuerte ? "font-semibold text-text" : "text-text"}`}>{v}</dd>
    </div>
  );
}
