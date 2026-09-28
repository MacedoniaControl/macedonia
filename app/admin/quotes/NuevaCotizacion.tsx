"use client";

// Nueva cotización.
//
// Sigue el patrón de los armadores de pedidos que funcionan (el borrador de
// pedido de Shopify, la factura de Stripe): en el centro, los productos, que
// SON el documento; al costado, a quién se le cotiza y en qué condiciones; y
// al final del costado, el total con un solo botón principal.
//
// Antes eran tres columnas iguales: un formulario de cliente, un formulario de
// carga manual con los renglones debajo, y una «vista previa» que repetía los
// mismos renglones. «Del catálogo» usaba seis productos escritos en el código
// con precios inventados, y «Tipo de precio» no cambiaba ningún número. Se
// quitaron: el buscador lee el catálogo real, y el renglón libre cubre lo que
// no está en él.

import { useEffect, useRef, useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { fmtUsd, enBs } from "@/lib/ux/format";
import { presupuestoHtml, printDoc, type DevLinea } from "@/lib/ux/doc-templates";
import { vendedoresDe } from "@/lib/auth/vendedores";
import { gases as gasesDe } from "@/lib/cilindros/cilindros-db";
import { leerConfig } from "@/lib/config/config-db";
import { buscarClientes, type Cliente } from "@/lib/directorio/directorio-db";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import { EditorRenglones, totalRenglon, type Renglon } from "@/components/documentos/EditorRenglones";

export type GenDoc = {
  correlativo: string; fechaEmision: string; fechaVenc: string; razonSocial: string; rif: string; direccion: string;
  telefonos: string; lineas: DevLinea[]; moneda: string; nota: string; total: number; vendedorExterno: string;
  /** Lo que se imprime: en bolívares, los precios ya convertidos. Se guarda `lineas`, en dólares. */
  lineasImpresas: DevLinea[];
};

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const dmy = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

export function NuevaCotizacion({ seq, onSave }: { seq: string; onSave: (d: GenDoc) => Promise<{ error: string | null }> }) {
  const empresaKey = useEmpresaActiva();
  const tasa = useTasaViva();
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({ razonSocial: "", rif: "", direccion: "", telefonos: "", vendedor: "", moneda: "Dólares", nota: "", venceDias: 5, vendedorExterno: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const cargaVend = useCarga(empresaKey, () => vendedoresDe(empresaKey));
  const vendedores = cargaVend.datos ?? [];
  const cargaGases = useCarga(empresaKey, () => gasesDe(empresaKey));
  const gases = cargaGases.datos ?? [];
  const cfg = useCarga(empresaKey, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;

  const [lineas, setLineas] = useState<Renglon[]>([]);
  const [msg, setMsg] = useState("");

  const sub = lineas.reduce((a, l) => a + totalRenglon(l), 0);
  const iva = sub * (ivaPct / 100);
  const total = sub + iva;
  const enBolivares = f.moneda === "Bolívares";
  const sinPrecio = lineas.filter((l) => l.precio <= 0).length;

  // ---- Cliente: se sugiere del directorio mientras se escribe.
  const [sugeridos, setSugeridos] = useState<Cliente[]>([]);
  const [abrirSug, setAbrirSug] = useState(false);
  const elegido = useRef<string>("");
  useEffect(() => {
    const q = f.razonSocial.trim();
    if (q.length < 2 || q === elegido.current) return;
    let vigente = true;
    const t = setTimeout(() => {
      buscarClientes(q, 6).then((r) => { if (vigente) setSugeridos(r); }).catch(() => {});
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [f.razonSocial]);
  function elegirCliente(c: Cliente) {
    elegido.current = c.nombre;
    setF((x) => ({ ...x, razonSocial: c.nombre, rif: c.rif ?? "", telefonos: c.telefonos ?? "", direccion: c.direccion ?? "" }));
    setAbrirSug(false);
    setSugeridos([]);
  }

  // ---- Documento: en bolívares, los montos se convierten a la tasa BCV.
  function documento(correlativo: string): GenDoc {
    const emision = new Date();
    const venc = new Date(Date.now() + f.venceDias * 86400000);
    const factor = enBolivares && tasa ? tasa : 1;
    return {
      correlativo, fechaEmision: dmy(emision), fechaVenc: dmy(venc),
      razonSocial: f.razonSocial.trim(), rif: f.rif, direccion: f.direccion, telefonos: f.telefonos,
      lineas,
      lineasImpresas: lineas.map((l) => ({ ...l, precio: Math.round(l.precio * factor * 100) / 100 })),
      moneda: enBolivares && tasa ? `Bolívares (tasa BCV ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })})` : "Dólares",
      nota: f.nota, total,
      vendedorExterno: f.vendedor === "__externo" ? f.vendedorExterno : "",
    };
  }
  function validar(): string | null {
    if (!f.razonSocial.trim()) return "Falta el cliente.";
    if (lineas.length === 0) return "Agrega al menos un producto.";
    if (sinPrecio) return `${sinPrecio} renglón(es) sin precio, marcados en rojo. Complétalos antes de generar.`;
    if (f.vendedor === "__externo" && !f.vendedorExterno.trim()) return "Falta el nombre del vendedor externo.";
    if (enBolivares && !tasa) return "Todavía no hay tasa BCV para expresarla en bolívares.";
    return null;
  }
  async function generar() {
    setMsg("");
    const e = validar();
    if (e) return setMsg(e);
    if (guardando) return;
    setGuardando(true);
    try {
      // En dólares se guarda; la conversión a bolívares es solo del documento impreso.
      const r = await onSave(documento(seq));
      if (r.error) setMsg(r.error);
      else setLineas([]);
    } finally { setGuardando(false); }
  }
  function borrador() {
    setMsg("");
    if (lineas.length === 0) return setMsg("Agrega al menos un producto para ver el borrador.");
    const d = documento("BORRADOR");
    printDoc(presupuestoHtml({ ...d, lineas: d.lineasImpresas, ivaPct, nota: f.nota ? `${f.nota} · BORRADOR, sin número` : "BORRADOR, sin número" }, empresaKey));
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:[grid-template-areas:'prod_cli'_'prod_cond']">
      {/* ---------------- Cliente */}
      <SectionCard title="Cliente" className="xl:[grid-area:cli]">
        <div className="space-y-3">
          <div className="relative">
            <label htmlFor="cot-cliente" className={lbl}>Razón social o nombre *</label>
            <input id="cot-cliente" className={campo} value={f.razonSocial} autoComplete="off"
              onChange={(e) => { elegido.current = ""; setAbrirSug(true); setF({ ...f, razonSocial: e.target.value }); }}
              onFocus={() => setAbrirSug(true)} onBlur={() => setTimeout(() => setAbrirSug(false), 150)}
              onKeyDown={(e) => { if (e.key === "Escape") setAbrirSug(false); }}
              placeholder="Busca en el directorio o escribe uno nuevo" />
            {abrirSug && sugeridos.length > 0 && (
              <ul role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
                {sugeridos.map((c) => (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => elegirCliente(c)}
                      className="block w-full px-3 py-2 text-left hover:bg-surface-2">
                      <span className="block truncate text-sm font-medium text-text">{c.nombre}</span>
                      <span className="block truncate text-xs text-muted">{[c.rif, c.ciudad].filter(Boolean).join(" · ") || "Sin RIF"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="cot-rif" className={lbl}>RIF</label><input id="cot-rif" className={campo} value={f.rif} onChange={set("rif")} placeholder="Opcional" /></div>
            <div><label htmlFor="cot-tel" className={lbl}>Teléfonos</label><input id="cot-tel" className={campo} value={f.telefonos} onChange={set("telefonos")} inputMode="tel" /></div>
          </div>
          <div><label htmlFor="cot-dir" className={lbl}>Dirección</label><input id="cot-dir" className={campo} value={f.direccion} onChange={set("direccion")} /></div>
        </div>
      </SectionCard>

      {/* ---------------- Productos: el documento */}
      <EditorRenglones empresa={empresaKey} numero={String(seq).padStart(10, "0")} lineas={lineas} setLineas={setLineas}
        gases={gases.map((g) => g.nombre)} onCambio={() => setMsg("")} className="xl:[grid-area:prod] xl:self-start" />

      {/* ---------------- Condiciones y total */}
      <div className="space-y-4 xl:[grid-area:cond] xl:sticky xl:top-20 xl:self-start">
        <SectionCard title="Condiciones">
          <div className="space-y-3">
            <div>
              <label htmlFor="cot-vend" className={lbl}>Vendedor</label>
              <select id="cot-vend" className={campo} value={f.vendedor} onChange={set("vendedor")}>
                <option value="">Elige…</option>
                {vendedores.map((v) => <option key={v.id} value={v.nombre}>{v.nombre} · {v.rol}</option>)}
                <option value="__externo">Vendedor externo…</option>
              </select>
              {cargaVend.error && <span className="mt-1 block text-xs text-danger">{cargaVend.error}</span>}
              {f.vendedor === "__externo" && (
                <input className={`${campo} mt-2`} placeholder="Nombre del vendedor externo" value={f.vendedorExterno}
                  onChange={(e) => setF({ ...f, vendedorExterno: e.target.value })} />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cot-mon" className={lbl}>Expresada en</label>
                <select id="cot-mon" className={campo} value={f.moneda} onChange={set("moneda")}>
                  <option>Dólares</option><option>Bolívares</option>
                </select>
              </div>
              <div>
                <label htmlFor="cot-vence" className={lbl}>Válida por (días)</label>
                <CampoNumero id="cot-vence" valor={f.venceDias} onChange={(n) => setF({ ...f, venceDias: Math.max(1, n) })} className={campo} />
              </div>
            </div>
            <div>
              <label htmlFor="cot-nota" className={lbl}>Nota</label>
              <textarea id="cot-nota" rows={2} className={`${campo} h-auto min-h-[4.5rem] py-2`} value={f.nota} onChange={set("nota")} placeholder="Se imprime al pie de la cotización" />
            </div>
          </div>
        </SectionCard>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted"><dt>Subtotal · {lineas.length} renglón(es)</dt><dd className="tabular-nums">{fmtUsd(sub)}</dd></div>
            <div className="flex justify-between text-muted"><dt>IVA {ivaPct}%</dt><dd className="tabular-nums">{fmtUsd(iva)}</dd></div>
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold text-text">Total</dt>
              <dd className="text-right">
                <span className="block text-xl font-semibold tabular-nums text-text">{fmtUsd(total)}</span>
                {tasa && total > 0 && <span className="block text-xs tabular-nums text-muted">≈ {enBs(total, tasa)}</span>}
              </dd>
            </div>
          </dl>
          {enBolivares && tasa && total > 0 && (
            <p className="mt-2 text-xs text-muted">El documento sale en bolívares a la tasa BCV {tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })}.</p>
          )}
          {msg && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
          <Button icon="quote" className="mt-3 w-full" onClick={generar} disabled={guardando} cargando={guardando} textoCargando="Guardando…">
            Registrar y generar PDF
          </Button>
          <button type="button" onClick={borrador}
            className="mt-2 w-full rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
            Ver borrador sin registrar
          </button>
        </div>
      </div>
    </div>
  );
}
