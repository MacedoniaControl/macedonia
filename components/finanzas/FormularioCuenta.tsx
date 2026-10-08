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
import { documentoAnexo, yaAnexados } from "@/lib/finanzas/anexar";
import { fmtUsdCentavos } from "@/lib/ux/format";
import { SelectorVendedor, VALOR_PROPIA } from "@/components/finanzas/VendedorCartera";
import { venceNotaEntrega } from "@/lib/finanzas/vencimiento";
import { fechaVista } from "@/lib/ux/tabla-export";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
// La fecha de Caracas: con la de UTC, después de las 8 de la noche ya era mañana.
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

/** Las tres que se cargan a mano. Ajuste y nota de crédito salen de importar. */
const CLASES_ALTA: ClaseCuenta[] = ["factura", "nota_entrega", "nota_debito"];

export function FormularioCuenta({
  tipo,
  empresa,
  onCreada,
  onCerrar,
  anexo,
  vendedores = [],
}: {
  tipo: TipoCuenta;
  empresa: string;
  onCreada: (creada?: { documento: string; monto: number }) => void;
  onCerrar: () => void;
  /**
   * Anexar a la deuda de un cliente desde su fila de la cartera: el cliente ya
   * está puesto, por defecto es una nota de entrega (sin IVA), el número se
   * guarda con su prefijo y no se deja repetir uno que el cliente ya tiene.
   */
  anexo?: { contraparte: string; documentos: string[]; deuda: number; vendedor?: string | null };
  /** Por cobrar: los vendedores externos conocidos, para elegir de quién es la cuenta. */
  vendedores?: string[];
}) {
  const quien = tipo === "cobrar" ? "Cliente" : "Proveedor";
  const [f, setF] = useState({ contraparte: anexo?.contraparte ?? "", documento: "", emitida: hoy(), vence: hoy(), nota: "" });
  // Al anexar a un cliente lo común es una nota de entrega sin IVA; a un
  // proveedor, su factura con IVA y retención (como «Nueva cuenta»).
  const notaSinIva = !!anexo && tipo === "cobrar";
  const [clase, setClase] = useState<ClaseCuenta>(notaSinIva ? "nota_entrega" : "factura");
  const [montoTxt, setMontoTxt] = useState("");
  const [conIva, setConIva] = useState(!notaSinIva);
  const [retiene, setRetiene] = useState(!notaSinIva);
  const [imagen, setImagen] = useState<File | null>(null);
  // "" = lo decide la base (la nota de Macedonia o el vendedor del cliente).
  const [vendedor, setVendedor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const monto = parseMonto(montoTxt);
  const d = monto !== null ? desglosar(monto, conIva, retiene) : null;
  const documento = anexo ? documentoAnexo(clase, f.documento, tipo) : f.documento.trim();
  const repetidos = anexo ? yaAnexados(documento, anexo.documentos) : [];
  // La nota de entrega por cobrar vence a los 30 días: solo se pide la emisión.
  // La nota de entrega (por cobrar o por pagar) vence sola, por la regla.
  const venceSolo = clase === "nota_entrega";
  const vence = venceSolo ? venceNotaEntrega(f.emitida || hoy()) : f.vence;
  const aCobrar = d ? d.total - (conIva && retiene ? d.retencion : 0) : 0;

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    if (!f.contraparte.trim()) return setMsg(`Falta el ${quien.toLowerCase()}.`);
    if (!f.documento.trim()) return setMsg("Falta el número de documento.");
    if (repetidos.length) return setMsg(`${f.contraparte.trim()} ya tiene ${repetidos.join(", ")}: no se anexa dos veces.`);
    if (!f.emitida || f.emitida > hoy()) return setMsg("La fecha de emisión no puede ser posterior a hoy.");
    if (vence < f.emitida) return setMsg("El vencimiento no puede ser antes de la emisión.");
    if (monto === null) return setMsg("Falta el monto, o no se entiende. Ejemplo: 1.500,50");
    if (monto <= 0) return setMsg("El monto tiene que ser mayor que cero.");

    setGuardando(true);
    try {
      const r = await crearCuenta({
        tipo, ...f, vence, documento, clase, monto,
        baseImponible: conIva ? d!.base : null,
        iva: conIva ? d!.iva : null,
        ivaRetenido: conIva && retiene ? d!.retencion : null,
        aplicaRetencion: conIva && retiene,
        imagen,
        ...(tipo === "cobrar" && vendedor !== "" ? { vendedorExterno: vendedor === VALOR_PROPIA ? null : vendedor.trim() } : {}),
      }, empresa);
      if (!r.ok) return setMsg(r.error ?? "No se pudo guardar.");
      // Se creó, pero puede haber quedado algo fuera: decirlo antes de cerrar.
      if (r.aviso) return setAviso(r.aviso);
      onCreada({ documento, monto: aCobrar });
      onCerrar();
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-3">
      {anexo ? (
        <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="block text-xs text-muted">{quien}</span>
          <b className="text-text">{anexo.contraparte}</b>
          <span className="block text-xs text-muted">{tipo === "cobrar" ? "Debe hoy" : "Le debemos hoy"} {fmtUsdCentavos(anexo.deuda)}</span>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-text">
            Nueva cuenta por {tipo === "cobrar" ? "cobrar" : "pagar"}
          </p>
          <label className="block">
            <span className={lbl}>{quien} *</span>
            <input value={f.contraparte} onChange={(e) => setF({ ...f, contraparte: e.target.value })} className={campo} />
          </label>
        </>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Documento *</span>
          <input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} className={`${campo} font-mono`}
            placeholder={anexo ? "Ej.: 9150" : undefined} autoFocus={!!anexo} inputMode={anexo ? "numeric" : undefined} />
          {anexo && f.documento.trim() && (
            <span className={`mt-1 block text-xs ${repetidos.length ? "text-danger" : "text-muted"}`}>
              {repetidos.length ? `Ya está en su cuenta: ${repetidos.join(", ")}` : `Se guarda como ${documento}`}
            </span>
          )}
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Emitida</span>
          <input type="date" value={f.emitida} max={hoy()}
            onChange={(e) => setF({ ...f, emitida: e.target.value, vence: f.vence < e.target.value ? e.target.value : f.vence })} className={campo} />
        </label>
        {venceSolo ? (
          <div>
            <span className={lbl}>Vence</span>
            <p className={`${campo} flex items-center bg-surface-2 text-muted`} aria-live="polite">
              {fechaVista(vence)} · el mismo día del mes siguiente
            </p>
          </div>
        ) : (
          <label className="block">
            <span className={lbl}>Vence</span>
            <input type="date" value={f.vence} min={f.emitida} onChange={(e) => setF({ ...f, vence: e.target.value })} className={campo} />
          </label>
        )}
      </div>

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

      {tipo === "cobrar" && (
        <label className="block">
          <span className={lbl}>Cartera</span>
          <SelectorVendedor id="fc-vend" vendedores={vendedores} valor={vendedor} onCambio={setVendedor}
            extra={[{ id: "", label: anexo ? `Según el cliente (${anexo.vendedor ?? "cartera propia"})` : "Según el cliente" }]} />
        </label>
      )}

      {anexo && aCobrar > 0 && (
        <p className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-text">
          {tipo === "cobrar" ? "Su deuda pasa" : "La deuda con el proveedor pasa"} de {fmtUsdCentavos(anexo.deuda)} a <b>{fmtUsdCentavos(anexo.deuda + aCobrar)}</b>.
        </p>
      )}

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
          {guardando ? "Guardando…" : anexo ? `Anexar ${documento || "documento"}` : "Guardar cuenta"}
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
