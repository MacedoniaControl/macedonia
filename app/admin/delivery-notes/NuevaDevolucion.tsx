"use client";

// Nueva devolución (nota de crédito): mercancía que el cliente regresa.
//
// Mismo patrón que la nota de entrega y la cotización: los productos devueltos
// en el centro, el cliente y la referencia al costado, el total con un solo
// botón. Antes eran dos tarjetas con un formulario de carga manual y una lista
// de texto; el cliente se escribía a mano (ahora se elige de la cartera, como
// en la nota de entrega, para que la devolución quede a nombre del mismo).

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SelectorCliente } from "@/components/directorio/SelectorCliente";
import { EditorRenglones, totalRenglon, type Renglon } from "@/components/documentos/EditorRenglones";
import { fmtUsdCentavos, enBs } from "@/lib/ux/format";
import { devolucionHtml, printDoc, type DevDoc } from "@/lib/ux/doc-templates";
import { leerConfig } from "@/lib/config/config-db";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import type { Cliente } from "@/lib/directorio/directorio-db";

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const vacio = () => ({ rif: "", direccion: "", telefonos: "", referencia: "", nota: "", formaPago: "" });

export function NuevaDevolucion({ seq, onSave }: { seq: string; onSave: (d: DevDoc) => Promise<{ error: string | null }> }) {
  const empresaKey = useEmpresaActiva();
  const tasa = useTasaViva();
  const [guardando, setGuardando] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [f, setF] = useState(vacio());
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const [lineas, setLineas] = useState<Renglon[]>([]);
  const [llevaIva, setLlevaIva] = useState(true);
  const [msg, setMsg] = useState("");

  const cfg = useCarga(empresaKey, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;
  const sub = lineas.reduce((a, l) => a + totalRenglon(l), 0);
  const iva = llevaIva ? sub * (ivaPct / 100) : 0;
  const total = sub + iva;

  const doc = (correlativo: string): DevDoc => ({
    ...f, correlativo, razonSocial: cliente?.nombre ?? "", fechaEmision: hoyISO(), fechaVenc: hoyISO(), lineas, llevaIva, ivaPct,
  });
  function validar(): string | null {
    if (!cliente) return "Elige el cliente de la cartera.";
    if (lineas.length === 0) return "Agrega al menos un producto devuelto.";
    const sinPrecio = lineas.filter((l) => l.precio <= 0).length;
    if (sinPrecio) return `${sinPrecio} renglón(es) sin precio, marcados en rojo. Complétalos antes de emitir.`;
    return null;
  }
  async function emitir() {
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await onSave(doc(seq));
      if (r.error) setMsg(r.error);
      else { setLineas([]); setF(vacio()); setCliente(null); setLlevaIva(true); }
    } finally { setGuardando(false); }
  }
  function borrador() {
    setMsg("");
    if (lineas.length === 0) return setMsg("Agrega al menos un producto para ver el borrador.");
    printDoc(devolucionHtml({ ...doc("BORRADOR"), nota: [f.nota, "BORRADOR, sin número"].filter(Boolean).join(" · ") }, empresaKey));
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:[grid-template-areas:'prod_cli'_'prod_cond']">
      <SectionCard title="Cliente" className="xl:[grid-area:cli]">
        <div className="space-y-3">
          <div>
            <label className={lbl}>Cliente *</label>
            <SelectorCliente empresa={empresaKey} seleccionado={cliente}
              onSelect={(c) => { setMsg(""); setCliente(c); setF((v) => ({ ...v, rif: c?.rif ?? "", direccion: c?.direccion ?? "", telefonos: c?.telefonos ?? "" })); }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="dv-rif" className={lbl}>Cédula / RIF</label><input id="dv-rif" className={campo} value={f.rif} onChange={set("rif")} /></div>
            <div><label htmlFor="dv-tel" className={lbl}>Teléfonos</label><input id="dv-tel" className={campo} value={f.telefonos} onChange={set("telefonos")} inputMode="tel" /></div>
          </div>
          <div><label htmlFor="dv-dir" className={lbl}>Dirección</label><input id="dv-dir" className={campo} value={f.direccion} onChange={set("direccion")} /></div>
        </div>
      </SectionCard>

      <EditorRenglones empresa={empresaKey} ivaPct={ivaPct} numero={seq} lineas={lineas} setLineas={setLineas}
        onCambio={() => setMsg("")} className="xl:[grid-area:prod] xl:self-start" />

      <div className="space-y-4 xl:[grid-area:cond]">
        <SectionCard title="Datos de la Devolución">
          <div className="space-y-3">
            <div>
              <label htmlFor="dv-ref" className={lbl}>Nota de entrega que se devuelve</label>
              <input id="dv-ref" className={campo} value={f.referencia} onChange={set("referencia")} placeholder="Ej.: NET-0000008216" />
            </div>
            <div>
              <label htmlFor="dv-fp" className={lbl}>Forma de pago</label>
              <input id="dv-fp" className={campo} value={f.formaPago} onChange={set("formaPago")} placeholder="Opcional" />
            </div>
            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3">
              <input type="checkbox" checked={llevaIva} onChange={(e) => setLlevaIva(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand-strong)]" />
              <span className="text-sm text-text">Incluir IVA {ivaPct}%</span>
            </label>
            <div>
              <label htmlFor="dv-nota" className={lbl}>Motivo o nota</label>
              <textarea id="dv-nota" rows={2} className={`${campo} h-auto min-h-[4.5rem] py-2`} value={f.nota} onChange={set("nota")} placeholder="Por qué se devuelve" />
            </div>
          </div>
        </SectionCard>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted"><dt>Subtotal · {lineas.length} renglón(es)</dt><dd className="tabular-nums">{fmtUsdCentavos(sub)}</dd></div>
            {llevaIva && <div className="flex justify-between text-muted"><dt>IVA {ivaPct}%</dt><dd className="tabular-nums">{fmtUsdCentavos(iva)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold text-text">Total a acreditar</dt>
              <dd className="text-right">
                <span className="block text-xl font-semibold tabular-nums text-text">{fmtUsdCentavos(total)}</span>
                {tasa && total > 0 && <span className="block text-xs tabular-nums text-muted">≈ {enBs(total, tasa)}</span>}
              </dd>
            </div>
          </dl>
          {msg && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
          <ConfirmDialog
            title="¿Emitir la devolución?"
            message={`${cliente?.nombre ?? "Sin cliente"} · ${lineas.length} renglón(es) · ${fmtUsdCentavos(total)}${f.referencia ? ` · de la nota ${f.referencia}` : ""}. Se usa el número ${seq} y no se puede deshacer.`}
            confirmLabel="Sí, emitir" cancelLabel="No"
            onConfirm={emitir}
            trigger={(abrir) => (
              <Button icon="quote" className="mt-3 w-full" cargando={guardando} textoCargando="Guardando…"
                onClick={() => { setMsg(""); const e = validar(); if (e) return setMsg(e); abrir(); }}>
                Registrar y generar PDF
              </Button>
            )}
          />
          <button type="button" onClick={borrador}
            className="mt-2 w-full rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
            Ver borrador sin registrar
          </button>
        </div>
      </div>
    </div>
  );
}
