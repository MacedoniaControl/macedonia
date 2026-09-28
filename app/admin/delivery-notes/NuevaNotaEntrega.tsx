"use client";

// Nueva nota de entrega: el documento principal (290 notas contra 59 facturas
// en cuatro semanas).
//
// Mismo patrón que Cotizaciones (el borrador de pedido de Shopify, la factura
// de Stripe): en el centro los productos, que SON el documento; al costado el
// cliente, los cilindros y las condiciones; y al final el total con un solo
// botón. Antes eran tres columnas iguales, con la carga manual encima de los
// renglones y una vista previa que los repetía.
//
// Lo que se conserva, porque es regla del negocio:
//   · el cliente se ELIGE de la cartera (escribirlo a mano duplicaba clientes);
//   · el IVA se enciende solo cuando se paga en bolívares, y se puede corregir;
//   · se confirma antes de emitir: el número se gasta y no vuelve.
// Y se corrige: en bolívares la pantalla mostraba el total en Bs, pero el papel
// salía con los montos en dólares sin decirlo. Ahora el papel sale convertido.

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { SelectorCliente } from "@/components/directorio/SelectorCliente";
import { EditorRenglones, type Renglon } from "@/components/documentos/EditorRenglones";
import { fmtUsd } from "@/lib/ux/format";
import { TIPOS_PRECIO } from "@/lib/ux/catalogos";
import { neTotals, notaEntregaHtml, printDoc, NOMBRE_GAS, type NECil, type NEDoc } from "@/lib/ux/doc-templates";
import { vendedoresDe } from "@/lib/auth/vendedores";
import { leerConfig } from "@/lib/config/config-db";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import type { Cliente } from "@/lib/directorio/directorio-db";

/** Lo que se emite: se guarda `lineas` (en dólares) y se imprime `lineasImpresas`. */
export type NEEmitir = NEDoc & { lineasImpresas: NEDoc["lineas"] };

// El formato de la nota trae estos cuatro gases, en este orden.
const GASES_NE = ["OXIGENO", "ACETILENO", "ARGON", "NITROGENO"];
const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const bs = (n: number) => `${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
const formularioVacio = () => ({ rif: "", tlf: "", direccion: "", ordenCompra: "", notas: "", vendedor: "", tipoPrecio: TIPOS_PRECIO[0] as string, divisa: "Dólar" });
const cilVacios = (): NECil[] => GASES_NE.map((g) => ({ gas: g, llenos: 0, vacios: 0 }));

/** Un número con − y +: en el teléfono, teclear cantidades chicas es un estorbo. */
function Paso({ valor, onChange, etiqueta }: { valor: number; onChange: (n: number) => void; etiqueta: string }) {
  const b = "flex h-10 w-8 flex-none items-center justify-center rounded-lg border border-border text-base font-semibold text-text transition active:scale-95 disabled:opacity-40";
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={b} aria-label={`Quitar uno: ${etiqueta}`} disabled={valor <= 0} onClick={() => onChange(Math.max(0, valor - 1))}>−</button>
      <CampoNumero valor={valor} onChange={onChange} aria-label={etiqueta} style={{ inlineSize: "2.5rem" }} className={`${campo} h-10 px-0.5 text-center`} />
      <button type="button" className={b} aria-label={`Sumar uno: ${etiqueta}`} onClick={() => onChange(valor + 1)}>+</button>
    </div>
  );
}

export function NuevaNotaEntrega({ seq, onSave }: { seq: string; onSave: (d: NEEmitir) => Promise<{ error: string | null }> }) {
  const empresaKey = useEmpresaActiva();
  const tasa = useTasaViva();
  const [guardando, setGuardando] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [f, setF] = useState(formularioVacio());
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const [lineas, setLineas] = useState<Renglon[]>([]);
  const [cil, setCil] = useState<NECil[]>(cilVacios());
  const [msg, setMsg] = useState("");

  const cfg = useCarga(empresaKey, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;
  const cargaVend = useCarga(empresaKey, () => vendedoresDe(empresaKey));
  const vendedores = cargaVend.datos ?? [];
  // Una sede por empresa: el depósito no se elige, se sabe.
  const deposito = isEmpresaId(empresaKey) ? EMPRESAS[empresaKey].deposito : "";

  const enBolivares = f.divisa === "Bolívar";
  // El IVA sigue a la moneda salvo que el vendedor lo haya tocado a mano: tiene
  // al cliente enfrente y sabe cosas que el sistema no. null = seguir la moneda.
  const [ivaManual, setIvaManual] = useState<boolean | null>(null);
  const llevaIva = ivaManual ?? enBolivares;

  const doc = (correlativo: string, ls: Renglon[] = lineas): NEDoc => ({
    ...f, cliente: cliente?.nombre ?? "", correlativo, fecha: hoyISO(), deposito, lineas: ls, cilindros: cil, llevaIva, ivaPct,
  });
  const t = neTotals(doc(""), ivaPct);
  const conCilindros = cil.filter((c) => c.llenos > 0 || c.vacios > 0);

  // En bolívares el papel sale convertido a la tasa BCV; se guarda en dólares.
  function paraEmitir(correlativo: string): NEEmitir {
    const factor = enBolivares && tasa ? tasa : 1;
    const impresas = lineas.map((l) => ({ ...l, precio: Math.round(l.precio * factor * 100) / 100 }));
    const nota = enBolivares && tasa ? `Montos en bolívares, tasa BCV ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })}.` : "";
    return { ...doc(correlativo), notas: [f.notas, nota].filter(Boolean).join(" · "), lineasImpresas: impresas };
  }
  function validar(): string | null {
    if (!cliente) return "Elige el cliente de la cartera.";
    if (lineas.length === 0) return "Agrega al menos un producto.";
    const sinPrecio = lineas.filter((l) => l.precio <= 0).length;
    if (sinPrecio) return `${sinPrecio} renglón(es) sin precio, marcados en rojo. Complétalos antes de emitir.`;
    if (enBolivares && !tasa) return "Todavía no hay tasa BCV: no emitas en bolívares hasta que cargue.";
    return null;
  }
  async function emitir() {
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await onSave(paraEmitir(seq));
      // Se suelta el cliente: si queda elegido, la siguiente nota sale al mismo sin que nadie lo pida.
      if (r.error) setMsg(r.error);
      else { setLineas([]); setF(formularioVacio()); setCliente(null); setCil(cilVacios()); setIvaManual(null); }
    } finally { setGuardando(false); }
  }
  function borrador() {
    setMsg("");
    if (lineas.length === 0) return setMsg("Agrega al menos un producto para ver el borrador.");
    const d = paraEmitir("BORRADOR");
    printDoc(notaEntregaHtml({ ...d, lineas: d.lineasImpresas, notas: [d.notas, "BORRADOR, sin número"].filter(Boolean).join(" · ") }, empresaKey));
  }

  const totalVisible = enBolivares ? (tasa ? bs(t.total * tasa) : "sin tasa") : fmtUsd(t.total);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:[grid-template-areas:'prod_cli'_'prod_cil'_'prod_cond']">
      {/* ---------------- Cliente */}
      <SectionCard title="Cliente" className="xl:[grid-area:cli]">
        <div className="space-y-3">
          {/* Se ELIGE de la cartera: escrito a mano, «Ferreteria Los Andes» y
              «FERRETERIA LOS ANDES» eran dos clientes, y el módulo que dice quién
              tiene los cilindros se llenaba de duplicados. */}
          <div>
            <label className={lbl}>Cliente *</label>
            <SelectorCliente empresa={empresaKey} seleccionado={cliente}
              onSelect={(c) => {
                setMsg("");
                setCliente(c);
                setF((v) => ({ ...v, rif: c?.rif ?? "", direccion: c?.direccion ?? "", tlf: c?.telefonos ?? "" }));
              }} />
          </div>
          {/* Quedan editables: la ficha puede estar incompleta y el vendedor
              tiene el dato delante. Lo que escriba aquí va al documento. */}
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="ne-rif" className={lbl}>Cédula / RIF</label><input id="ne-rif" className={campo} value={f.rif} onChange={set("rif")} /></div>
            <div><label htmlFor="ne-tlf" className={lbl}>Teléfonos</label><input id="ne-tlf" className={campo} value={f.tlf} onChange={set("tlf")} inputMode="tel" /></div>
          </div>
          <div><label htmlFor="ne-dir" className={lbl}>Dirección</label><input id="ne-dir" className={campo} value={f.direccion} onChange={set("direccion")} /></div>
          <div><label htmlFor="ne-oc" className={lbl}>Orden de compra</label><input id="ne-oc" className={campo} value={f.ordenCompra} onChange={set("ordenCompra")} placeholder="Opcional" /></div>
        </div>
      </SectionCard>

      {/* ---------------- Productos: el documento */}
      <EditorRenglones empresa={empresaKey} numero={seq} lineas={lineas} setLineas={setLineas}
        onCambio={() => setMsg("")} className="xl:[grid-area:prod] xl:self-start" />

      {/* ---------------- Cilindros: van aparte del total, son de la empresa y vuelven. */}
      <SectionCard title="Cilindros" className="xl:[grid-area:cil]"
        description="Los que se dejan llenos y los que se traen vacíos. Salen impresos en la nota.">
        <div className="grid grid-cols-[minmax(4.5rem,1fr)_auto_auto] items-center gap-x-3 gap-y-2">
          <span />
          <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">Llenos</span>
          <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">Vacíos</span>
          {cil.map((c, i) => (
            <div key={c.gas} className="contents">
              <span className="truncate text-sm font-medium text-text">{NOMBRE_GAS[c.gas] ?? c.gas}</span>
              <Paso valor={c.llenos} etiqueta={`${c.gas} llenos`} onChange={(n) => setCil((p) => p.map((x, j) => (j === i ? { ...x, llenos: n } : x)))} />
              <Paso valor={c.vacios} etiqueta={`${c.gas} vacíos`} onChange={(n) => setCil((p) => p.map((x, j) => (j === i ? { ...x, vacios: n } : x)))} />
            </div>
          ))}
        </div>
        {conCilindros.some((c) => c.llenos !== c.vacios) && (
          <p className="mt-3 text-xs text-muted">
            {conCilindros.filter((c) => c.llenos !== c.vacios).map((c) =>
              `${NOMBRE_GAS[c.gas] ?? c.gas}: el cliente queda con ${Math.abs(c.llenos - c.vacios)} ${c.llenos > c.vacios ? "más" : "menos"}`).join(" · ")}.
          </p>
        )}
      </SectionCard>

      {/* ---------------- Condiciones y total */}
      <div className="space-y-4 xl:[grid-area:cond]">
        <SectionCard title="Condiciones">
          <div className="space-y-3">
            <div>
              <label htmlFor="ne-vend" className={lbl}>Vendedor</label>
              <select id="ne-vend" className={campo} value={f.vendedor} onChange={set("vendedor")}>
                <option value="">Elige…</option>
                {vendedores.map((v) => <option key={v.id} value={v.nombre}>{v.nombre} · {v.rol}</option>)}
              </select>
              {cargaVend.error && <span className="mt-1 block text-xs text-danger">{cargaVend.error}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ne-div" className={lbl}>Se paga en</label>
                <select id="ne-div" className={campo} value={f.divisa} onChange={(e) => { setIvaManual(null); set("divisa")(e); }}>
                  <option value="Dólar">Dólares</option><option value="Bolívar">Bolívares</option>
                </select>
              </div>
              <div>
                <label htmlFor="ne-tp" className={lbl}>Tipo de precio</label>
                <select id="ne-tp" className={campo} value={f.tipoPrecio} onChange={set("tipoPrecio")}>
                  {TIPOS_PRECIO.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3">
              <input type="checkbox" checked={llevaIva} onChange={(e) => setIvaManual(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand-strong)]" />
              <span className="text-sm text-text">
                Incluir IVA {ivaPct}%
                <span className="ml-1 text-xs text-muted">{ivaManual === null ? (enBolivares ? "· por pagar en bolívares" : "· por pagar en dólares") : "· elegido a mano"}</span>
              </span>
            </label>
            <div>
              <label htmlFor="ne-notas" className={lbl}>Notas</label>
              <textarea id="ne-notas" rows={2} className={`${campo} h-auto min-h-[4.5rem] py-2`} value={f.notas} onChange={set("notas")} />
            </div>
            <p className="text-xs text-muted">Depósito: <span className="text-text">{deposito}</span></p>
          </div>
        </SectionCard>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted"><dt>Base · {lineas.length} renglón(es)</dt>
              <dd className="tabular-nums">{enBolivares && tasa ? bs(t.base * tasa) : fmtUsd(t.base)}</dd></div>
            {llevaIva && <div className="flex justify-between text-muted"><dt>IVA {ivaPct}%</dt>
              <dd className="tabular-nums">{enBolivares && tasa ? bs(t.iva * tasa) : fmtUsd(t.iva)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold text-text">Total</dt>
              <dd className="text-right">
                <span className="block text-xl font-semibold tabular-nums text-text">{totalVisible}</span>
                {t.total > 0 && tasa && (
                  <span className="block text-xs tabular-nums text-muted">
                    {enBolivares ? `${fmtUsd(t.total)} · tasa BCV ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : `≈ ${bs(t.total * tasa)}`}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {enBolivares && !tasa && (
            <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo leer la tasa BCV. No emitas en bolívares hasta que cargue.</p>
          )}
          {msg && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

          {/* Se confirma antes de emitir: el número se gasta y el papel sale al
              cliente. El resumen repite CLIENTE y TOTAL, los dos datos que duelen
              si están mal. Se valida ANTES de abrir la confirmación. */}
          <ConfirmDialog
            title="¿Emitir la nota de entrega?"
            message={`${cliente?.nombre ?? "Sin cliente"} · ${lineas.length} renglón(es) · ${totalVisible}${conCilindros.length ? ` · ${conCilindros.length} gas(es) con cilindros` : ""}. Se usa el número ${seq} y no se puede deshacer.`}
            confirmLabel="Sí, emitir" cancelLabel="No"
            onConfirm={emitir}
            trigger={(abrir) => (
              <Button icon="delivery" className="mt-3 w-full" cargando={guardando} textoCargando="Guardando…"
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
