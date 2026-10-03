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
import { fmtUsdCentavos } from "@/lib/ux/format";
import { TIPOS_PRECIO } from "@/lib/ux/catalogos";
import { neTotals, notaEntregaHtml, printDoc, NOMBRE_GAS, type NECil, type NEDoc } from "@/lib/ux/doc-templates";
import { vendedoresDe } from "@/lib/auth/vendedores";
import { vendedoresExternos } from "@/lib/documentos/documentos-db";
import { leerConfig } from "@/lib/config/config-db";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import type { Cliente } from "@/lib/directorio/directorio-db";
import { autorizantes, cilindrosParaNota, type LineaEntrega } from "@/lib/cilindros/cilindros-db";
import { llenosDeRenglones } from "@/lib/cilindros/gas-de-producto";
import { useSesion } from "@/components/auth/SesionProvider";

/**
 * Lo que se emite: se guarda `lineas` (en dólares), se imprime `lineasImpresas`
 * y, si hay cilindros, se registran en el parque como una entrega.
 */
export type NEEmitir = NEDoc & {
  lineasImpresas: NEDoc["lineas"];
  /** Nombre del vendedor de afuera del personal (vacío = del personal). Su comisión sale de aquí. */
  vendedorExterno: string;
  cilindrosEntrega: { lineas: LineaEntrega[]; autorizadoPor: string | null; retiradoPor: string | null };
};

// El papel de la nota trae estos cuatro gases, en este orden. Los acetilenos
// (2K, 4K, 6K) van juntos en su casilla; los que no tienen casilla, en las notas.
const GASES_NE = ["OXIGENO", "ACETILENO", "ARGON", "NITROGENO"];
const casillaDe = (gas: string) => (gas.startsWith("ACETILENO") ? "ACETILENO" : GASES_NE.includes(gas) ? gas : null);
type Cuenta = { llenos: number; vacios: number };
/** Lo que el vendedor tocó a mano; lo que no tocó sale de los renglones (llenos) o es 0 (vacíos). */
type Manual = Partial<Cuenta>;
const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const bs = (n: number) => `${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
const formularioVacio = () => ({ rif: "", tlf: "", direccion: "", ordenCompra: "", notas: "", vendedor: "", tipoPrecio: TIPOS_PRECIO[0] as string, divisa: "Dólar" });

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

export function NuevaNotaEntrega({ seq, onSave }: { seq: string; onSave: (d: NEEmitir) => Promise<{ error: string | null; aviso?: string }> }) {
  const empresaKey = useEmpresaActiva();
  const sesion = useSesion();
  const tasa = useTasaViva();
  const [guardando, setGuardando] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [f, setF] = useState(formularioVacio());
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const [lineas, setLineas] = useState<Renglon[]>([]);
  const [cuentas, setCuentas] = useState<Record<string, Manual>>({});
  const [autoriza, setAutoriza] = useState("");
  const [retira, setRetira] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [avisoFinal, setAvisoFinal] = useState<string | null>(null);

  // Los gases y los llenos se leen con el servidor: el vendedor no opera Cilindros.
  const [recargaCil, setRecargaCil] = useState(0);
  const parque = useCarga(`ne-cil:${empresaKey}:${recargaCil}`, async () => {
    const [p, a] = await Promise.all([cilindrosParaNota(empresaKey), autorizantes(empresaKey)]);
    return { ...p, autorizan: a };
  });
  const gasesCil = parque.datos?.gases ?? [];
  // Un gas agregado como producto («OXIGENO GASEOSO» × 2) pone solos sus
  // llenos: antes el parque no se enteraba si nadie tocaba esta sección. Los
  // vacíos que trae el cliente se cargan a mano.
  // Solo los gases que ya tienen cilindros en el parque: uno sin parque (Sudematin
  // antes de cargar el suyo) dejaría la nota sin poder emitirse por «no hay llenos».
  const conParque = parque.datos?.conParque ?? [];
  const deRenglones = llenosDeRenglones(lineas, gasesCil.filter((g) => conParque.includes(g)));
  const sinParque = Object.keys(llenosDeRenglones(lineas, gasesCil)).filter((g) => !conParque.includes(g));
  const cuenta = (g: string): Cuenta => ({ llenos: cuentas[g]?.llenos ?? deRenglones[g] ?? 0, vacios: cuentas[g]?.vacios ?? 0 });
  const setCuenta = (g: string, k: keyof Cuenta, n: number) => setCuentas((p) => ({ ...p, [g]: { ...p[g], [k]: n } }));
  const conCilindros = gasesCil.filter((g) => cuenta(g).llenos > 0 || cuenta(g).vacios > 0);
  const dejaLlenos = conCilindros.some((g) => cuenta(g).llenos > 0);
  const quienSeLosLleva = retira ?? sesion?.nombre ?? "";
  // Para el papel: los cuatro gases del formato, y el resto en una línea.
  const cil: NECil[] = GASES_NE.map((casilla) => {
    const suyos = conCilindros.filter((g) => casillaDe(g) === casilla);
    return { gas: casilla, llenos: suyos.reduce((a, g) => a + cuenta(g).llenos, 0), vacios: suyos.reduce((a, g) => a + cuenta(g).vacios, 0) };
  });
  const sinCasilla = conCilindros.filter((g) => !casillaDe(g));

  const cfg = useCarga(empresaKey, () => leerConfig(empresaKey));
  const ivaPct = Number(cfg.datos?.iva_pct) || 16;
  const cargaVend = useCarga(empresaKey, () => vendedoresDe(empresaKey));
  const vendedores = cargaVend.datos ?? [];
  const externosUsados = useCarga(`externos:${empresaKey}`, () => vendedoresExternos(empresaKey)).datos ?? [];
  const [vendedorExterno, setVendedorExterno] = useState("");
  const esExterno = f.vendedor === "__externo";
  // Una sede por empresa: el depósito no se elige, se sabe.
  const deposito = isEmpresaId(empresaKey) ? EMPRESAS[empresaKey].deposito : "";

  const enBolivares = f.divisa === "Bolívar";
  // El IVA sigue a la moneda salvo que el vendedor lo haya tocado a mano: tiene
  // al cliente enfrente y sabe cosas que el sistema no. null = seguir la moneda.
  const [ivaManual, setIvaManual] = useState<boolean | null>(null);
  const llevaIva = ivaManual ?? enBolivares;

  const doc = (correlativo: string, ls: Renglon[] = lineas): NEDoc => ({
    ...f, vendedor: esExterno ? vendedorExterno.trim() : f.vendedor, cliente: cliente?.nombre ?? "", correlativo, fecha: hoyISO(), deposito, lineas: ls, cilindros: cil, llevaIva, ivaPct,
  });
  const t = neTotals(doc(""), ivaPct);

  // En bolívares el papel sale convertido a la tasa BCV; se guarda en dólares.
  function paraEmitir(correlativo: string): NEEmitir {
    const factor = enBolivares && tasa ? tasa : 1;
    const impresas = lineas.map((l) => ({ ...l, precio: Math.round(l.precio * factor * 100) / 100 }));
    const nota = enBolivares && tasa ? `Montos en bolívares, tasa BCV ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })}.` : "";
    const otros = sinCasilla.length ? `Cilindros: ${sinCasilla.map((g) => `${g} ${cuenta(g).llenos} lleno(s) / ${cuenta(g).vacios} vacío(s)`).join(", ")}.` : "";
    return {
      ...doc(correlativo), notas: [f.notas, otros, nota].filter(Boolean).join(" · "), lineasImpresas: impresas,
      vendedorExterno: esExterno ? vendedorExterno.trim() : "",
      cilindrosEntrega: {
        lineas: conCilindros.map((g) => ({ gas: g, llenosEntregados: cuenta(g).llenos, vaciosRecibidos: cuenta(g).vacios })),
        autorizadoPor: dejaLlenos ? autoriza || null : null,
        retiradoPor: dejaLlenos ? quienSeLosLleva.trim() || null : null,
      },
    };
  }
  function validar(): string | null {
    if (!cliente) return "Elige el cliente de la cartera.";
    if (lineas.length === 0) return "Agrega al menos un producto.";
    if (esExterno && !vendedorExterno.trim()) return "Falta el nombre del vendedor externo.";
    const sinPrecio = lineas.filter((l) => l.precio <= 0).length;
    if (sinPrecio) return `${sinPrecio} renglón(es) sin precio, marcados en rojo. Complétalos antes de emitir.`;
    if (enBolivares && !tasa) return "Todavía no hay tasa BCV: no emitas en bolívares hasta que cargue.";
    const faltan = conCilindros.filter((g) => cuenta(g).llenos > (parque.datos?.llenos[g] ?? 0));
    if (faltan.length) return `No hay tantos llenos en planta: ${faltan.map((g) => `${g} (hay ${parque.datos?.llenos[g] ?? 0})`).join(", ")}.`;
    if (dejaLlenos && !autoriza) return "Elige quién autoriza que salgan los cilindros llenos.";
    if (dejaLlenos && !quienSeLosLleva.trim()) return "Indica quién se lleva los cilindros.";
    return null;
  }
  async function emitir() {
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await onSave(paraEmitir(seq));
      // Se suelta el cliente: si queda elegido, la siguiente nota sale al mismo sin que nadie lo pida.
      if (r.error) setMsg(r.error);
      else {
        setLineas([]); setF(formularioVacio()); setVendedorExterno(""); setCliente(null); setCuentas({}); setAutoriza(""); setRetira(null); setIvaManual(null);
        setAvisoFinal(r.aviso ?? null);
        setRecargaCil((n) => n + 1);
      }
    } finally { setGuardando(false); }
  }
  function borrador() {
    setMsg("");
    if (lineas.length === 0) return setMsg("Agrega al menos un producto para ver el borrador.");
    const d = paraEmitir("BORRADOR");
    printDoc(notaEntregaHtml({ ...d, lineas: d.lineasImpresas, notas: [d.notas, "BORRADOR, sin número"].filter(Boolean).join(" · ") }, empresaKey));
  }

  const totalVisible = enBolivares ? (tasa ? bs(t.total * tasa) : "sin tasa") : fmtUsdCentavos(t.total);

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
      <EditorRenglones empresa={empresaKey} ivaPct={ivaPct} numero={seq} lineas={lineas} setLineas={setLineas}
        onCambio={() => setMsg("")} className="xl:[grid-area:prod] xl:self-start" />

      {/* ---------------- Cilindros: van aparte del total, son de la empresa y vuelven. */}
      <SectionCard title="Cilindros" className="xl:[grid-area:cil]"
        description="Los que se dejan llenos y los que se traen vacíos. Al emitir, se registran en el parque.">
        {parque.error && <p className="mb-2 text-sm text-danger">{parque.error}</p>}
        {!parque.cargando && gasesCil.length === 0 && !parque.error && <p className="text-sm text-muted">No hay gases cargados en esta empresa.</p>}
        {sinParque.length > 0 && (
          <p className="mb-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-xs text-warn">
            {sinParque.map((g) => NOMBRE_GAS[g] ?? g).join(", ")}: todavía no {sinParque.length === 1 ? "tiene" : "tienen"} cilindros en el parque, así que esta nota no {sinParque.length === 1 ? "lo" : "los"} mueve.
            Cárgalos en Cilindros → Parque → «Agregar Cilindros».
          </p>
        )}
        {gasesCil.length > 0 && (
          <div className="grid grid-cols-[minmax(4.5rem,1fr)_auto_auto] items-center gap-x-3 gap-y-2">
            <span />
            <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">Llenos</span>
            <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">Vacíos</span>
            {gasesCil.map((g) => {
              const hay = parque.datos?.llenos[g] ?? 0;
              const c = cuenta(g);
              return (
                <div key={g} className="contents">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{NOMBRE_GAS[g] ?? g}</span>
                    <span className={`block text-[11px] tabular-nums ${c.llenos > hay ? "font-medium text-danger" : "text-muted"}`}>{hay} en planta</span>
                    {(deRenglones[g] ?? 0) > 0 && (
                      cuentas[g]?.llenos === undefined || cuentas[g]?.llenos === deRenglones[g]
                        ? <span className="block text-[11px] text-brand">{deRenglones[g]} por los productos</span>
                        : <button type="button" className="block text-[11px] text-brand underline"
                            onClick={() => setCuentas((p) => ({ ...p, [g]: { ...p[g], llenos: undefined } }))}>
                            Usar los de los productos ({deRenglones[g]})
                          </button>
                    )}
                  </span>
                  <Paso valor={c.llenos} etiqueta={`${g} llenos`} onChange={(n) => setCuenta(g, "llenos", n)} />
                  <Paso valor={c.vacios} etiqueta={`${g} vacíos`} onChange={(n) => setCuenta(g, "vacios", n)} />
                </div>
              );
            })}
          </div>
        )}
        {conCilindros.some((g) => cuenta(g).llenos !== cuenta(g).vacios) && (
          <p className="mt-3 text-xs text-muted">
            {conCilindros.filter((g) => cuenta(g).llenos !== cuenta(g).vacios).map((g) =>
              `${NOMBRE_GAS[g] ?? g}: el cliente queda con ${Math.abs(cuenta(g).llenos - cuenta(g).vacios)} ${cuenta(g).llenos > cuenta(g).vacios ? "más" : "menos"}`).join(" · ")}.
          </p>
        )}
        {/* Salida de llenos: quien autoriza y quien se los lleva. Si un cilindro
            no vuelve, es a quien se le reclama (la base lo exige). */}
        {dejaLlenos && (
          <div className="mt-3 space-y-2 rounded-xl border border-brand/30 bg-brand/5 p-3">
            <label className="block">
              <span className={lbl}>Autoriza la salida *</span>
              <select className={campo} value={autoriza} onChange={(e) => setAutoriza(e.target.value)}>
                <option value="">Elige…</option>
                {(parque.datos?.autorizan ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lbl}>Quién se los lleva *</span>
              <input className={campo} value={quienSeLosLleva} onChange={(e) => setRetira(e.target.value)} placeholder="Chofer, vendedor o el cliente" />
            </label>
          </div>
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
                <option value="__externo">Vendedor externo…</option>
              </select>
              {cargaVend.error && <span className="mt-1 block text-xs text-danger">{cargaVend.error}</span>}
              {esExterno && (
                <>
                  <input className={`${campo} mt-2`} placeholder="Nombre del vendedor externo" value={vendedorExterno} list="ne-externos"
                    aria-label="Nombre del vendedor externo" onChange={(e) => setVendedorExterno(e.target.value)} />
                  <datalist id="ne-externos">{externosUsados.map((n) => <option key={n} value={n} />)}</datalist>
                </>
              )}
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
              <dd className="tabular-nums">{enBolivares && tasa ? bs(t.base * tasa) : fmtUsdCentavos(t.base)}</dd></div>
            {llevaIva && <div className="flex justify-between text-muted"><dt>IVA {ivaPct}%</dt>
              <dd className="tabular-nums">{enBolivares && tasa ? bs(t.iva * tasa) : fmtUsdCentavos(t.iva)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold text-text">Total</dt>
              <dd className="text-right">
                <span className="block text-xl font-semibold tabular-nums text-text">{totalVisible}</span>
                {t.total > 0 && tasa && (
                  <span className="block text-xs tabular-nums text-muted">
                    {enBolivares ? `${fmtUsdCentavos(t.total)} · tasa BCV ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : `≈ ${bs(t.total * tasa)}`}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {enBolivares && !tasa && (
            <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo leer la tasa BCV. No emitas en bolívares hasta que cargue.</p>
          )}
          {msg && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
          {avisoFinal && <p role="status" className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">{avisoFinal}</p>}

          {/* Se confirma antes de emitir: el número se gasta y el papel sale al
              cliente. El resumen repite CLIENTE y TOTAL, los dos datos que duelen
              si están mal. Se valida ANTES de abrir la confirmación. */}
          <ConfirmDialog
            title="¿Emitir la nota de entrega?"
            message={`${cliente?.nombre ?? "Sin cliente"} · ${lineas.length} renglón(es) · ${totalVisible}${conCilindros.length ? ` · cilindros: ${conCilindros.map((g) => `${g} ${cuenta(g).llenos}/${cuenta(g).vacios}`).join(", ")} (llenos/vacíos), que entran al parque` : ""}. Se usa el número ${seq} y no se puede deshacer.`}
            confirmLabel="Sí, emitir" cancelLabel="No"
            onConfirm={emitir}
            trigger={(abrir) => (
              <Button icon="delivery" className="mt-3 w-full" cargando={guardando} textoCargando="Guardando…"
                onClick={() => { setMsg(""); setAvisoFinal(null); const e = validar(); if (e) return setMsg(e); abrir(); }}>
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
