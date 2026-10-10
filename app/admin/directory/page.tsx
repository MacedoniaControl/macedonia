"use client";

// Directorio (Operación): clientes y proveedores, con lo que cada uno nos debe
// o le debemos, y su ficha con el formato de Valery (pedido del usuario,
// 10-10-2026). Los proveedores salieron de Compras.
//
// Dos paneles, como Contactos o la lista de clientes de Stripe: a la izquierda
// la lista (buscar, Todos / Clientes / Proveedores, «Con deuda», «Sin ficha»);
// a la derecha el contacto con sus totales, su ficha y sus cuentas. También
// salen los nombres de la cartera que todavía no tienen ficha: sin ficha, el
// estado de cuenta en PDF sale sin RIF ni dirección, y aquí se crea con un toque
// (con el nombre tal como está en la cartera, para que se encuentren solos).

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AlertCard } from "@/components/ui/AlertCard";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { FichaContacto } from "@/components/directorio/FichaContacto";
import { useCarga } from "@/lib/ux/use-carga";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { useRol, puedeVerFinanzas } from "@/lib/ux/session";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { listarClientes, listarProveedoresTodos, type Cliente, type Proveedor } from "@/lib/directorio/directorio-db";
import { asignacionesClientes, listarCuentas, type Cuenta } from "@/lib/finanzas/cuentas-db";
import { armarDirectorio, claveContacto, coincide, iniciales, type ContactoDirectorio, type CuentaDirectorio, type RolDirectorio } from "@/lib/directorio/directorio";
import { CLASES } from "@/lib/finanzas/retencion";
import { descargarEstadoCuenta } from "@/lib/finanzas/estado-cuenta-pdf";
import { fmtUsd } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";
import type { EmpresaId } from "@/lib/ux/empresas";

type Ficha = Cliente | Proveedor;
type Contacto = ContactoDirectorio<Ficha>;
type Vista = "todos" | RolDirectorio;

const nombreClase = (id: string) => CLASES.find((x) => x.id === id)?.label ?? id;
const estadoDe = (c: CuentaDirectorio): { label: string; tone: Tone } =>
  c.estado === "liquidada" || c.saldo <= 0.00005 ? { label: "Pagada", tone: "ok" }
  : c.dias < 0 ? { label: `Vencido (${-c.dias}d)`, tone: "danger" }
  : c.dias <= 8 ? { label: `Por vencer (${c.dias}d)`, tone: "warn" }
  : { label: "Pendiente", tone: "info" };

const aDirectorio = (c: Cuenta, neto: boolean): CuentaDirectorio => ({
  id: c.id, contraparte: c.contraparte, documento: c.documento, clase: c.clase,
  monto: neto ? c.neto : c.monto, abonado: c.abonado, saldo: neto ? c.saldoNeto : c.saldoNeto ?? c.saldo,
  emitida: c.emitida, vence: c.vence, dias: c.dias, estado: c.estado,
});

export default function DirectoryPage() {
  return <ProveedorExportar><Directorio /></ProveedorExportar>;
}

function Directorio() {
  const empresa = useEmpresaActiva();
  const { rol } = useRol();
  const gerencia = puedeVerFinanzas(rol);
  const [recarga, setRecarga] = useState(0);
  const cli = useCarga(`dir:cli:${recarga}`, () => listarClientes());
  const prov = useCarga(`dir:prov:${recarga}`, () => listarProveedoresTodos());
  // Los saldos son de la empresa activa; los ven el Owner y los Administradores.
  const cxc = useCarga(`dir:cxc:${empresa}:${recarga}:${gerencia}`, () => (gerencia ? listarCuentas(empresa, "cobrar") : Promise.resolve([] as Cuenta[])));
  const cxp = useCarga(`dir:cxp:${empresa}:${recarga}:${gerencia}`, () => (gerencia ? listarCuentas(empresa, "pagar") : Promise.resolve([] as Cuenta[])));
  const asig = useCarga(`dir:asig:${empresa}:${recarga}`, () => asignacionesClientes(empresa));
  const vendedorDe = useMemo(() => new Map((asig.datos ?? []).map((a) => [claveContacto(a.cliente), a.vendedor])), [asig.datos]);

  const contactos: Contacto[] = useMemo(() => [
    ...armarDirectorio<Ficha>("cliente", cli.datos ?? [], (cxc.datos ?? []).map((c) => aDirectorio(c, false))),
    ...armarDirectorio<Ficha>("proveedor", prov.datos ?? [], (cxp.datos ?? []).map((c) => aDirectorio(c, true))),
  ], [cli.datos, prov.datos, cxc.datos, cxp.datos]);

  const [vista, setVista] = useState<Vista>("todos");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"deuda" | "sinficha" | null>(null);
  // Sin elegir: el Owner y el Administrador ven primero a quien más debe (o a
  // quien más le debemos); los demás, de la A a la Z.
  const [ordenElegido, setOrden] = useState<"nombre" | "saldo" | null>(null);
  const orden = ordenElegido ?? (gerencia ? "saldo" : "nombre");
  const [sel, setSel] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<{ rol: RolDirectorio; contacto: Contacto | null; nombre?: string } | null>(null);
  const [aviso, setAviso] = useState("");

  const lista = contactos
    .filter((c) => vista === "todos" || c.rol === vista)
    .filter((c) => coincide(c, q))
    .filter((c) => filtro === "deuda" ? c.resumen.saldo > 0.00005 : filtro === "sinficha" ? !c.ficha : true)
    // Los inactivos al final; luego por saldo o por nombre.
    .sort((a, b) => Number(a.ficha?.activo === false) - Number(b.ficha?.activo === false)
      || (orden === "saldo" ? b.resumen.saldo - a.resumen.saldo : 0)
      || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true }));
  // En pantalla ancha siempre hay uno abierto (el primero de la lista); en el
  // teléfono se ve la lista hasta que se toca uno.
  const actual = contactos.find((c) => c.clave === (sel ?? lista[0]?.clave)) ?? null;

  const clientes = contactos.filter((c) => c.rol === "cliente");
  const proveedores = contactos.filter((c) => c.rol === "proveedor");
  const suma = (xs: Contacto[]) => xs.reduce((a, c) => a + c.resumen.saldo, 0);
  const sinFicha = contactos.filter((c) => !c.ficha && c.resumen.saldo > 0.00005).length;

  useExportable(() => ({
    modulo: "", seccion: "Directorio", titulo: "Directorio",
    detalle: [vista === "todos" ? "Clientes y proveedores" : vista === "cliente" ? "Clientes" : "Proveedores", q.trim() ? `Búsqueda: «${q.trim()}»` : ""].filter(Boolean),
    columnas: [{ titulo: "Tipo" }, { titulo: "Nombre" }, { titulo: "RIF", tipo: "codigo" }, { titulo: "Teléfonos" }, { titulo: "Correo" },
      { titulo: "Dirección" }, { titulo: "Ciudad" }, { titulo: "Saldo", tipo: "usd" }, { titulo: "Vencido", tipo: "usd" }, { titulo: "Ficha" }],
    filas: lista.map((c) => [c.rol === "cliente" ? "Cliente" : "Proveedor", c.nombre, c.ficha?.rif ?? null, c.ficha?.telefonos ?? null, c.ficha?.correo ?? null,
      c.ficha?.direccion ?? null, c.ficha?.ciudad ?? null, gerencia ? c.resumen.saldo : null, gerencia ? c.resumen.vencido : null, c.ficha ? "Sí" : "Sin ficha"]),
  }));

  const cargando = cli.cargando || prov.cargando;
  return (
    <>
      <PageHeader title="Directorio" breadcrumbs={[{ label: "Operación" }, { label: "Directorio" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button icon="plus" onClick={() => setEdicion({ rol: "cliente", contacto: null })}>Nuevo cliente</Button>
            {gerencia && <Button variant="secondary" icon="plus" onClick={() => setEdicion({ rol: "proveedor", contacto: null })}>Nuevo proveedor</Button>}
            <BotonDescargar empresa={empresa} />
          </div>
        } />
      {aviso && <div className="mb-4"><AlertCard tone="ok" titulo="Directorio" mensaje={aviso} /></div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" className="text-left" onClick={() => { setVista("cliente"); setFiltro(null); }}>
          <StatCard label="Clientes" value={String(clientes.length)} sub={`${clientes.filter((c) => c.ficha).length} con ficha`} />
        </button>
        <button type="button" className="text-left" onClick={() => { setVista("cliente"); setFiltro("deuda"); setOrden("saldo"); }}>
          <StatCard label="Nos Deben" value={gerencia ? fmtUsd(suma(clientes)) : "—"} sub={gerencia ? `${clientes.filter((c) => c.resumen.saldo > 0.00005).length} cliente(s)` : "Solo Owner y Administrador"} accent />
        </button>
        <button type="button" className="text-left" onClick={() => { setVista("proveedor"); setFiltro("deuda"); setOrden("saldo"); }}>
          <StatCard label="Les Debemos" value={gerencia ? fmtUsd(suma(proveedores)) : "—"} sub={`${proveedores.length} proveedor(es)`} />
        </button>
        <button type="button" className="text-left" onClick={() => { setVista("todos"); setFiltro("sinficha"); }}>
          <StatCard label="Sin Ficha" value={String(sinFicha)} sub="con deuda y sin RIF ni dirección" />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        {/* ---------------- la lista ---------------- */}
        <section className={`rounded-2xl border border-border bg-surface p-3 ${sel ? "hidden lg:block" : ""}`}>
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-muted"><Icon name="search" size={16} /></span>
            <input type="search" className="sumi-campo" style={{ paddingLeft: "2.25rem" }} placeholder="Buscar nombre, RIF o código" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el directorio" />
          </label>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 text-xs font-medium" role="tablist">
            {([["todos", "Todos"], ["cliente", "Clientes"], ["proveedor", "Proveedores"]] as const).map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v}
                className={`rounded-lg px-2 py-1.5 ${vista === v ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`} onClick={() => setVista(v)}>{t}</button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {gerencia && (
              <button type="button" aria-pressed={filtro === "deuda"} onClick={() => setFiltro(filtro === "deuda" ? null : "deuda")}
                className={`rounded-full border px-2.5 py-0.5 ${filtro === "deuda" ? "border-brand/40 bg-brand/10 text-brand" : "border-border text-muted"}`}>Con deuda</button>
            )}
            <button type="button" aria-pressed={filtro === "sinficha"} onClick={() => setFiltro(filtro === "sinficha" ? null : "sinficha")}
              className={`rounded-full border px-2.5 py-0.5 ${filtro === "sinficha" ? "border-warn/40 bg-warn/10 text-warn" : "border-border text-muted"}`}>Sin ficha</button>
            {gerencia && (
              <select aria-label="Ordenar la lista" className="ml-auto rounded-full border border-border bg-transparent px-2 py-0.5 text-muted" value={orden} onChange={(e) => setOrden(e.target.value as "nombre" | "saldo")}>
                <option value="nombre">A–Z</option><option value="saldo">Mayor saldo</option>
              </select>
            )}
          </div>
          <p className="mt-2 px-1 text-[11px] text-muted">{lista.length} contacto(s)</p>
          <EstadoDatos cargando={cargando} error={cli.error ?? prov.error} vacio={!cargando && lista.length === 0}
            tituloVacio="Nada coincide" mensajeVacio={q.trim() ? `No hay contactos con «${q.trim()}».` : "No hay contactos con ese filtro."}>
            <ul className="mt-1 max-h-[70vh] divide-y divide-border overflow-y-auto">
              {lista.map((c) => (
                <li key={c.clave}>
                  <button type="button" onClick={() => setSel(c.clave)} aria-current={actual?.clave === c.clave}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${actual?.clave === c.clave ? "bg-brand/10" : "hover:bg-surface-2"}`}>
                    <Avatar nombre={c.nombre} rol={c.rol} chico />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{c.nombre}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {c.rol === "cliente" ? "Cliente" : "Proveedor"} · {c.ficha ? c.ficha.rif || "Sin RIF" : <span className="text-warn">Sin ficha</span>}
                        {c.ficha && !c.ficha.activo ? " · Inactivo" : ""}
                      </span>
                    </span>
                    {gerencia && c.resumen.saldo > 0.00005 && (
                      <span className="text-right">
                        <span className={`block text-xs font-semibold tabular-nums ${c.resumen.vencido > 0 ? "text-danger" : "text-text"}`}>{fmtUsd(c.resumen.saldo)}</span>
                        <span className="block text-[10px] text-muted">{c.rol === "cliente" ? "nos debe" : "le debemos"}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </EstadoDatos>
        </section>

        {/* ---------------- el contacto ---------------- */}
        <section className={sel ? "" : "hidden lg:block"}>
          {actual ? (
            <DetalleContacto c={actual} empresa={empresa} gerencia={gerencia} vendedor={vendedorDe.get(claveContacto(actual.nombre)) ?? null}
              gemelo={contactos.find((x) => x.rol !== actual.rol && claveContacto(x.nombre) === claveContacto(actual.nombre)) ?? null}
              onVolver={() => setSel(null)} onIr={setSel}
              onEditar={() => setEdicion({ rol: actual.rol, contacto: actual, nombre: actual.nombre })} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted">Elige un contacto de la lista.</div>
          )}
        </section>
      </div>

      {edicion && (
        <Modal titulo={`${edicion.contacto?.ficha ? "Ficha de" : "Nuevo"} ${edicion.rol === "cliente" ? "Cliente" : "Proveedor"}${edicion.contacto ? ` · ${edicion.contacto.nombre}` : ""}`}
          onCerrar={() => setEdicion(null)} ancho="max-w-5xl">
          <FichaContacto rol={edicion.rol} ficha={edicion.contacto?.ficha ?? null} nombreSugerido={edicion.nombre ?? ""}
            resumen={edicion.contacto?.resumen ?? null}
            vendedor={edicion.contacto ? vendedorDe.get(claveContacto(edicion.contacto.nombre)) ?? null : null}
            puedeEditar={edicion.rol === "cliente" || gerencia}
            onGuardada={(t) => { setAviso(t); setEdicion(null); setRecarga((n) => n + 1); }}
            onCerrar={() => setEdicion(null)} />
        </Modal>
      )}
    </>
  );
}

function Avatar({ nombre, rol, chico = false }: { nombre: string; rol: RolDirectorio; chico?: boolean }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${chico ? "h-9 w-9 text-xs" : "h-14 w-14 text-lg"}
      ${rol === "cliente" ? "bg-brand/15 text-brand" : "bg-info/15 text-info"}`}>{iniciales(nombre)}</span>
  );
}

function Dato({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{k}</dt>
      <dd className="truncate text-sm text-text" title={v ?? ""}>{v?.toString().trim() || "—"}</dd>
    </div>
  );
}

function DetalleContacto({ c, empresa, gerencia, vendedor, gemelo, onVolver, onIr, onEditar }: {
  c: Contacto; empresa: string; gerencia: boolean; vendedor: string | null; gemelo: Contacto | null;
  onVolver: () => void; onIr: (clave: string) => void; onEditar: () => void;
}) {
  const [pestana, setPestana] = useState<"ficha" | "cuentas">("ficha");
  const [conPagadas, setConPagadas] = useState(false);
  const [generando, setGenerando] = useState(false);
  const f = c.ficha;
  const cli = c.rol === "cliente" ? (f as Cliente | null) : null;
  const prov = c.rol === "proveedor" ? (f as Proveedor | null) : null;
  const r = c.resumen;
  const cuentas = c.cuentas.filter((x) => conPagadas || (x.estado !== "liquidada" && x.saldo > 0.00005))
    .sort((a, b) => a.vence.localeCompare(b.vence));
  const tel = (f?.telefonos ?? "").split(/[\/,;]/)[0]?.replace(/[^\d+]/g, "") ?? "";
  const ws = tel ? tel.replace(/^\+/, "").replace(/^0/, "58") : "";
  const ruta = c.rol === "cliente" ? "receivables" : "payables";

  async function pdf() {
    setGenerando(true);
    try {
      await descargarEstadoCuenta({
        empresa: empresa as EmpresaId, tipo: c.rol === "cliente" ? "cobrar" : "pagar",
        emitido: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date()),
        cliente: { nombre: c.nombre, rif: f?.rif, telefonos: f?.telefonos, direccion: [f?.direccion, f?.ciudad].filter(Boolean).join(", ") || null },
        filas: c.cuentas.filter((x) => x.estado !== "liquidada" && x.saldo > 0.00005).sort((a, b) => a.vence.localeCompare(b.vence)).map((x) => ({
          documento: x.documento, clase: nombreClase(x.clase), emitida: x.emitida, vence: x.vence, monto: x.monto, saldo: x.saldo, estado: estadoDe(x).label,
        })),
        conPagadas: false,
      });
    } finally { setGenerando(false); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text lg:hidden" onClick={onVolver}>
        <span className="rotate-180"><Icon name="chevronRight" size={14} /></span> Volver a la lista
      </button>
      <div className="flex flex-wrap items-start gap-4">
        <Avatar nombre={c.nombre} rol={c.rol} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-text">{c.nombre}</h2>
          <p className="text-sm text-muted">{[f?.rif || (f ? "Sin RIF" : null), f?.tipoPersona === "natural" ? "Persona natural" : f ? "Persona jurídica" : null, f?.ciudad].filter(Boolean).join(" · ") || "Solo aparece en la cartera"}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusBadge tone={c.rol === "cliente" ? "brand" : "info"}>{c.rol === "cliente" ? "Cliente" : "Proveedor"}</StatusBadge>
            {!f && <StatusBadge tone="warn">Sin ficha</StatusBadge>}
            {f && !f.activo && <StatusBadge tone="muted">Inactivo</StatusBadge>}
            {vendedor && c.rol === "cliente" && <StatusBadge tone="navy">Vendedor: {vendedor}</StatusBadge>}
            {gemelo && (
              <button type="button" className="rounded-full border border-border px-2 py-0.5 text-xs text-brand hover:bg-surface-2" onClick={() => onIr(gemelo.clave)}>
                También es {gemelo.rol === "cliente" ? "cliente" : "proveedor"} →
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tel && <a className="sumi-pulsable inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-xs font-medium text-text hover:bg-surface-2" href={`tel:${tel}`}>Llamar</a>}
          {ws && <a className="sumi-pulsable inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-xs font-medium text-text hover:bg-surface-2" href={`https://wa.me/${ws}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {f?.correo && <a className="sumi-pulsable inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-xs font-medium text-text hover:bg-surface-2" href={`mailto:${f.correo}`}>Correo</a>}
          {(c.rol === "cliente" || gerencia) && <Button variant={f ? "secondary" : "primary"} icon={f ? "settings" : "plus"} onClick={onEditar}>{f ? "Editar ficha" : "Crear ficha"}</Button>}
        </div>
      </div>

      {!f && (
        <AlertCard tone="warn" titulo="Sin Ficha"
          mensaje={`${c.nombre} está en ${c.rol === "cliente" ? "Cuentas por Cobrar" : "Cuentas por Pagar"} pero no tiene ficha: su estado de cuenta en PDF sale sin RIF, teléfono ni dirección. «Crear ficha» la abre con este mismo nombre.`} />
      )}

      {gerencia && (
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          <StatCard label={c.rol === "cliente" ? "Nos Debe" : "Le Debemos"} value={fmtUsd(r.saldo)} sub={`${r.abiertos} documento(s) abierto(s)`} accent />
          <StatCard label="Vencido" value={fmtUsd(r.vencido)} sub={r.vencidos ? `${r.vencidos} vencido(s) · desde ${fechaVista(r.desde!)}` : "Al día"} />
          {c.rol === "cliente"
            ? <StatCard label="Crédito Disponible" value={f && f.limiteCredito > 0 ? fmtUsd(Math.max(0, f.limiteCredito - r.saldo)) : "Sin límite"} sub={f && f.limiteCredito > 0 ? `límite ${fmtUsd(f.limiteCredito)}` : "no tiene límite cargado"} />
            : <StatCard label="Retención de IVA" value={prov ? `${prov.pctRetencion.toLocaleString("es-VE")} %` : "—"} sub={prov ? (prov.nacional ? "Nacional" : "Extranjero") : "—"} />}
          <StatCard label="Días de Crédito" value={f ? String(f.diasCredito) : "—"} sub={`facturado ${fmtUsd(r.debitos)}`} />
        </div>
      )}

      <div className="flex gap-1 border-b border-border text-sm" role="tablist">
        {([["ficha", "Ficha"], ["cuentas", `Cuentas (${r.abiertos})`]] as const).map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={pestana === v} onClick={() => setPestana(v)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${pestana === v ? "border-brand text-text" : "border-transparent text-muted hover:text-text"}`}>{t}</button>
        ))}
      </div>

      {pestana === "ficha" ? (
        f ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Dato k="Código" v={f.codigo} /><Dato k="R.I.F." v={f.rif} /><Dato k="Denominación fiscal" v={cli?.denominacion ?? prov?.denominacion} />
            <Dato k="Contacto" v={f.contacto} /><Dato k="Teléfonos" v={f.telefonos} /><Dato k="Correo" v={f.correo} />
            <div className="sm:col-span-2 xl:col-span-3"><Dato k="Dirección" v={f.direccion} /></div>
            <Dato k="Ciudad" v={f.ciudad} /><Dato k="Estado" v={f.estadoRegion} /><Dato k="Municipio" v={f.municipio} />
            <Dato k="País" v={f.pais} /><Dato k="Fax" v={f.fax} /><Dato k="Grupo" v={f.grupo} />
            <Dato k="Días de crédito" v={String(f.diasCredito)} /><Dato k="Límite de crédito" v={f.limiteCredito ? fmtUsd(f.limiteCredito) : null} /><Dato k="Referencia" v={f.referencia} />
            {cli && <><Dato k="Zona de ventas" v={cli.zonaVentas} /><Dato k="Tipo de precio" v={cli.tipoPrecio} /><Dato k="% Descuento especial" v={cli.descuentoPct ? `${cli.descuentoPct} %` : null} /><Dato k="Acepta cheque" v={cli.aceptaCheque ? "Sí" : "No"} /></>}
            {prov && <><Dato k="Origen" v={prov.nacional ? "Nacional" : "Extranjero"} /><Dato k="% Retención IVA" v={`${prov.pctRetencion} %`} /></>}
            <div className="sm:col-span-2 xl:col-span-3"><Dato k="Notas" v={f.notas} /></div>
          </dl>
        ) : <p className="text-sm text-muted">Todavía no hay ficha. Créala para guardar su RIF, dirección y teléfonos.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" checked={conPagadas} onChange={(e) => setConPagadas(e.target.checked)} /> Incluir pagadas
            </label>
            <span className="flex flex-wrap gap-2">
              {gerencia && r.abiertos > 0 && <Button variant="secondary" icon="report" cargando={generando} textoCargando="Generando…" onClick={pdf}>Estado de cuenta (PDF)</Button>}
              <Link href={`/admin/${empresa}/${ruta}?buscar=${encodeURIComponent(c.nombre)}`}
                className="sumi-pulsable inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-medium text-text hover:bg-surface-2">
                Abrir en {c.rol === "cliente" ? "Cuentas por Cobrar" : "Cuentas por Pagar"}
              </Link>
            </span>
          </div>
          {cuentas.length ? (
            <div className="sumi-scroll overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="uppercase tracking-wide text-muted">
                  <tr className="border-b border-border"><th className="py-2 pr-3">Documento</th><th className="py-2 pr-3">Clase</th><th className="py-2 pr-3 text-right">Saldo</th><th className="py-2 pr-3">Emisión</th><th className="py-2 pr-3">Vence</th><th className="py-2">Estado</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cuentas.map((x) => { const e = estadoDe(x); return (
                    <tr key={x.id}>
                      <td className="py-2 pr-3 font-mono text-text">{x.documento.split("·")[0]}</td>
                      <td className="py-2 pr-3 text-muted">{nombreClase(x.clase)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-text">{fmtUsd(x.saldo)}{Math.abs(x.monto - x.saldo) > 0.00005 && <span className="block text-[10px] text-muted">de {fmtUsd(x.monto)}</span>}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">{fechaVista(x.emitida)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">{fechaVista(x.vence)}</td>
                      <td className="py-2"><StatusBadge tone={e.tone}>{e.label}</StatusBadge></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          ) : <p className="py-4 text-center text-sm text-muted">{gerencia ? "No tiene cuentas abiertas en esta empresa." : "Los saldos los ven el Owner y los Administradores."}</p>}
        </div>
      )}
    </div>
  );
}
