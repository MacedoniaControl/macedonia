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
//
// Facelift (15-10-2026, con las reglas de Impeccable): arriba la cabecera del
// documento (número, fecha, depósito, moneda), como el papel; el total y
// «Registrar» van en la barra fija de abajo, el mismo patrón que la planilla
// de Conteo, así el botón se alcanza sin bajar hasta el final; y los − / + de
// los cilindros son de 44px, con íconos, como los del conteo.

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { SelectorCliente } from "@/components/directorio/SelectorCliente";
import { EditorRenglones, type Renglon } from "@/components/documentos/EditorRenglones";
import { fmtUsdCentavos, fmtBs, fmtTasa } from "@/lib/ux/format";
import { TIPOS_PRECIO } from "@/lib/ux/catalogos";
import { neTotals, notaEntregaHtml, printDoc, NOMBRE_GAS, type NECil, type NEDoc } from "@/lib/ux/doc-templates";
import { vendedoresDe } from "@/lib/auth/vendedores";
import { vendedoresExternos } from "@/lib/documentos/documentos-db";
import { leerConfig } from "@/lib/config/config-db";
import { useTasaViva } from "@/lib/ux/bcv-rate";
import type { Cliente } from "@/lib/directorio/directorio-db";
import { autorizantes, cilindrosParaNota, type LineaEntrega } from "@/lib/cilindros/cilindros-db";
import { llenosDeRenglones } from "@/lib/cilindros/gas-de-producto";
import { vendedorDelCliente } from "@/lib/finanzas/cuentas-db";
import { useSesion } from "@/components/auth/SesionProvider";
import { aMonto } from "@/lib/ux/decimales";

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
const bs = fmtBs;
const formularioVacio = () => ({ rif: "", tlf: "", direccion: "", ordenCompra: "", notas: "", vendedor: "", tipoPrecio: TIPOS_PRECIO[0] as string, divisa: "Dólar" });

/** Un número con − y +: en el teléfono, teclear cantidades chicas es un estorbo. */
function Paso({ valor, onChange, etiqueta }: { valor: number; onChange: (n: number) => void; etiqueta: string }) {
  const b = "sumi-pulsable flex h-11 w-11 flex-none items-center justify-center bg-surface text-text disabled:text-muted disabled:opacity-50";
  return (
    <div className="flex overflow-hidden rounded-xl border border-border-strong bg-surface-2 focus-within:border-brand">
      <button type="button" className={`${b} border-r border-border`} aria-label={`Quitar uno: ${etiqueta}`} disabled={valor <= 0} onClick={() => onChange(Math.max(0, valor - 1))}>
        <Icon name="minus" size={16} />
      </button>
      <CampoNumero valor={valor} onChange={onChange} aria-label={etiqueta} style={{ inlineSize: "2.75rem" }}
        className="h-11 bg-transparent px-0.5 text-center text-base font-semibold tabular-nums text-text outline-none" />
      <button type="button" className={`${b} border-l border-border`} aria-label={`Sumar uno: ${etiqueta}`} onClick={() => onChange(valor + 1)}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** «Cliente *»: el asterisco en rojo, como en el resto del panel (Conteo). */
const Req = () => <span className="text-danger" aria-hidden> *</span>;

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
  // El cliente asignado a un vendedor externo lo propone en la nota (se puede cambiar).
  const [delCliente, setDelCliente] = useState<string | null>(null);
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
    const impresas = lineas.map((l) => ({ ...l, precio: aMonto(l.precio * factor) }));
    const nota = enBolivares && tasa ? `Montos en bolívares, tasa BCV ${fmtTasa(tasa)}.` : "";
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
        setLineas([]); setF(formularioVacio()); setVendedorExterno(""); setCliente(null); setDelCliente(null); setCuentas({}); setAutoriza(""); setRetira(null); setIvaManual(null);
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
  const fechaHoy = hoyISO().split("-").reverse().join("-");

  return (
    <div className="space-y-4">
      {/* ---------------- Cabecera del documento: lo que dice el papel arriba. */}
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rounded-2xl border border-border bg-surface px-4 py-4 sm:px-5" aria-label="Nota de entrega">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-text">Nota de Entrega</h2>
          <p className="mt-0.5 font-mono text-sm text-muted">N° {seq}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:flex sm:flex-wrap">
          <div><dt className="text-xs text-muted">Fecha</dt><dd className="font-medium tabular-nums text-text">{fechaHoy}</dd></div>
          <div><dt className="text-xs text-muted">Depósito</dt><dd className="font-medium text-text">{deposito || "—"}</dd></div>
          <div><dt className="text-xs text-muted">Se paga en</dt><dd className="font-medium text-text">{enBolivares ? "Bolívares" : "Dólares"}</dd></div>
          {tasa ? <div><dt className="text-xs text-muted">Tasa BCV</dt><dd className="font-medium tabular-nums text-text">{fmtTasa(tasa)}</dd></div> : null}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:[grid-template-areas:'prod_cli'_'prod_cond'_'cil_cond']">
        {/* ---------------- Cliente */}
        <SectionCard title="Cliente" className="xl:[grid-area:cli]">
          <div className="space-y-3">
            {/* Se ELIGE de la cartera: escrito a mano, «Ferreteria Los Andes» y
                «FERRETERIA LOS ANDES» eran dos clientes, y el módulo que dice quién
                tiene los cilindros se llenaba de duplicados. */}
            <div>
              <label className={lbl}>Cliente<Req /></label>
              <SelectorCliente empresa={empresaKey} seleccionado={cliente}
                onSelect={(c) => {
                  setMsg("");
                  setCliente(c);
                  setF((v) => ({ ...v, rif: c?.rif ?? "", direccion: c?.direccion ?? "", tlf: c?.telefonos ?? "" }));
                  setDelCliente(null);
                  if (c?.nombre) void vendedorDelCliente(empresaKey, c.nombre).then((ven) => {
                    setDelCliente(ven);
                    // Solo si no se eligió ya un vendedor: no pisa lo que se marcó a mano.
                    if (ven) setF((v) => (v.vendedor === "" ? { ...v, vendedor: "__externo" } : v));
                    if (ven) setVendedorExterno((x) => x || ven);
                  });
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
        <EditorRenglones empresa={empresaKey} ivaPct={ivaPct} lineas={lineas} setLineas={setLineas}
          onCambio={() => setMsg("")} className="xl:[grid-area:prod] xl:self-start" />

        {/* ---------------- Cilindros: van aparte del total, son de la empresa y vuelven. */}
        <SectionCard title="Cilindros" className="xl:[grid-area:cil] xl:self-start"
          description="Los que se dejan llenos y los que se traen vacíos. Al emitir, se registran en el parque.">
          {parque.error && <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{parque.error}</p>}
          {!parque.cargando && gasesCil.length === 0 && !parque.error && <p className="text-sm text-muted">No hay gases cargados en esta empresa.</p>}
          {sinParque.length > 0 && (
            <p className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              {sinParque.map((g) => NOMBRE_GAS[g] ?? g).join(", ")}: todavía no {sinParque.length === 1 ? "tiene" : "tienen"} cilindros en el parque, así que esta nota no {sinParque.length === 1 ? "lo" : "los"} mueve.
              Cárgalos en Cilindros → Parque → «Agregar Cilindros».
            </p>
          )}
          {gasesCil.length > 0 && (
            <div className="divide-y divide-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted sm:grid">
                <span>Gas</span><span className="w-[8.25rem] text-center">Llenos que salen</span><span className="w-[8.25rem] text-center">Vacíos que vuelven</span>
              </div>
              {gasesCil.map((g) => {
                const hay = parque.datos?.llenos[g] ?? 0;
                const c = cuenta(g);
                return (
                  <div key={g} className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate text-sm font-medium text-text">{NOMBRE_GAS[g] ?? g}</p>
                      <p className={`text-xs tabular-nums ${c.llenos > hay ? "font-medium text-danger" : "text-muted"}`}>
                        {hay} lleno{hay === 1 ? "" : "s"} en planta{c.llenos > hay ? " · no alcanzan" : ""}
                      </p>
                      {(deRenglones[g] ?? 0) > 0 && (
                        cuentas[g]?.llenos === undefined || cuentas[g]?.llenos === deRenglones[g]
                          ? <p className="text-xs text-brand">{deRenglones[g]} por los productos</p>
                          : <button type="button" className="-my-2 min-h-11 text-left text-xs font-medium text-brand underline"
                              onClick={() => setCuentas((p) => ({ ...p, [g]: { ...p[g], llenos: undefined } }))}>
                              Usar los de los productos ({deRenglones[g]})
                            </button>
                      )}
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-muted sm:hidden">Llenos que salen</span>
                      <Paso valor={c.llenos} etiqueta={`${g} llenos`} onChange={(n) => setCuenta(g, "llenos", n)} />
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-muted sm:hidden">Vacíos que vuelven</span>
                      <Paso valor={c.vacios} etiqueta={`${g} vacíos`} onChange={(n) => setCuenta(g, "vacios", n)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {conCilindros.some((g) => cuenta(g).llenos !== cuenta(g).vacios) && (
            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
              {conCilindros.filter((g) => cuenta(g).llenos !== cuenta(g).vacios).map((g) =>
                `${NOMBRE_GAS[g] ?? g}: el cliente queda con ${Math.abs(cuenta(g).llenos - cuenta(g).vacios)} ${cuenta(g).llenos > cuenta(g).vacios ? "más" : "menos"}`).join(" · ")}.
            </p>
          )}
          {/* Salida de llenos: quien autoriza y quien se los lleva. Si un cilindro
              no vuelve, es a quien se le reclama (la base lo exige). */}
          {dejaLlenos && (
            <div className="mt-3 grid gap-3 rounded-xl border border-brand/30 bg-brand/5 p-3 sm:grid-cols-2">
              <label className="block">
                <span className={lbl}>Autoriza la salida<Req /></span>
                <select className={campo} value={autoriza} onChange={(e) => setAutoriza(e.target.value)}>
                  <option value="">Elige…</option>
                  {(parque.datos?.autorizan ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>Quién se los lleva<Req /></span>
                <input className={campo} value={quienSeLosLleva} onChange={(e) => setRetira(e.target.value)} placeholder="Chofer, vendedor o el cliente" />
              </label>
            </div>
          )}
        </SectionCard>

        {/* ---------------- Condiciones */}
        <SectionCard title="Condiciones" className="xl:[grid-area:cond] xl:self-start">
          <div className="space-y-3">
            <div>
              <label htmlFor="ne-vend" className={lbl}>Vendedor</label>
              <select id="ne-vend" className={campo} value={f.vendedor} onChange={set("vendedor")}>
                <option value="">Elige…</option>
                {vendedores.map((v) => <option key={v.id} value={v.nombre}>{v.nombre} · {v.rol}</option>)}
                <option value="__externo">Vendedor externo…</option>
              </select>
              {cargaVend.error && <span className="mt-1 block text-xs text-danger">{cargaVend.error}</span>}
              {delCliente && <span className="mt-1 block text-xs text-muted">Cliente de {delCliente} (vendedor externo): la nota va a su cartera.</span>}
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
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3">
              <input type="checkbox" checked={llevaIva} onChange={(e) => setIvaManual(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand-strong)]" />
              <span className="text-sm text-text">
                Incluir IVA {ivaPct}%
                <span className="block text-xs text-muted">{ivaManual === null ? (enBolivares ? "Por pagar en bolívares" : "Por pagar en dólares") : "Elegido a mano"}</span>
              </span>
            </label>
            <div>
              <label htmlFor="ne-notas" className={lbl}>Notas</label>
              <textarea id="ne-notas" rows={2} className={`${campo} h-auto min-h-[4.5rem] py-2`} value={f.notas} onChange={set("notas")} placeholder="Opcional: sale impresa en la nota" />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ---------------- Barra fija: el total y emitir, siempre a la mano. */}
      <div className="sumi-barra-fija z-30 space-y-2 rounded-2xl border border-border bg-surface/95 px-3 py-3 shadow-lg backdrop-blur sm:px-4">
        {enBolivares && !tasa && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo leer la tasa BCV. No emitas en bolívares hasta que cargue.</p>
        )}
        {msg && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        {avisoFinal && <p role="status" className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">{avisoFinal}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline justify-between gap-4 sm:justify-start">
            <div>
              <p className="text-xs text-muted tabular-nums">
                {lineas.length} renglón(es) · base {enBolivares && tasa ? bs(t.base * tasa) : fmtUsdCentavos(t.base)}
                {llevaIva ? ` · IVA ${ivaPct}% ${enBolivares && tasa ? bs(t.iva * tasa) : fmtUsdCentavos(t.iva)}` : " · sin IVA"}
              </p>
              {t.total > 0 && tasa ? (
                <p className="text-xs text-muted tabular-nums">{enBolivares ? `${fmtUsdCentavos(t.total)} a tasa BCV ${fmtTasa(tasa)}` : `≈ ${bs(t.total * tasa)}`}</p>
              ) : null}
            </div>
            <p className="text-right sm:text-left">
              <span className="block text-xs text-muted">Total</span>
              <span className="text-2xl font-semibold tabular-nums text-text">{totalVisible}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" onClick={borrador}>Ver borrador</Button>
            {/* Se confirma antes de emitir: el número se gasta y el papel sale al
                cliente. El resumen repite CLIENTE y TOTAL, los dos datos que duelen
                si están mal. Se valida ANTES de abrir la confirmación. */}
            <ConfirmDialog
              title="¿Emitir la nota de entrega?"
              message={`${cliente?.nombre ?? "Sin cliente"} · ${lineas.length} renglón(es) · ${totalVisible}${conCilindros.length ? ` · cilindros: ${conCilindros.map((g) => `${g} ${cuenta(g).llenos}/${cuenta(g).vacios}`).join(", ")} (llenos/vacíos), que entran al parque` : ""}. Se usa el número ${seq} y no se puede deshacer.`}
              confirmLabel="Sí, emitir" cancelLabel="No"
              onConfirm={emitir}
              trigger={(abrir) => (
                <Button icon="delivery" cargando={guardando} textoCargando="Guardando…"
                  onClick={() => { setMsg(""); setAvisoFinal(null); const e = validar(); if (e) return setMsg(e); abrir(); }}>
                  Registrar y generar PDF
                </Button>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
