"use client";

// La ficha de un cliente o proveedor en el Directorio, con el formato de la
// ventana «Clientes» de Valery (pedido del usuario, 10-10-2026): Código, Tipo y
// R.I.F. arriba; «Datos e Información Fiscal y Tributaria», «Datos del
// Cliente», «Clasificación y Opciones de Crédito» y «Precios y Comentarios»; a
// la derecha los totales y el estatus; abajo «Guardar» y «Cerrar». El RIF y la
// dirección de esta ficha llenan el estado de cuenta en PDF.

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { guardarCliente, guardarProveedor, type Cliente, type Proveedor, type TipoPersona } from "@/lib/directorio/directorio-db";
import type { ResumenContacto, RolDirectorio } from "@/lib/directorio/directorio";
import { fmtMonto, parseMonto } from "@/lib/ux/monto";

const DENOMINACIONES = ["Contribuyente ORDINARIO", "Contribuyente ESPECIAL", "Contribuyente FORMAL", "No contribuyente"];
const TIPOS_PRECIO = ["Precio por Defecto", "Precio 1", "Precio 2", "Precio 3"];
const campo = "sumi-campo";

function Barra({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-navy px-3 py-1 text-xs font-semibold text-white dark:bg-surface-2 dark:text-text">{children}</p>;
}
function Campo({ label, children, ancho = "" }: { label: string; children: ReactNode; ancho?: string }) {
  return (
    <label className={`block min-w-0 ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-xs ${fuerte ? "font-semibold text-text" : "text-muted"}`}>
      <span>{k}</span><span className="tabular-nums text-text">{v}</span>
    </div>
  );
}

type Datos = {
  codigo: string; tipoPersona: TipoPersona; rif: string; nombre: string; denominacion: string;
  contacto: string; correo: string; direccion: string; estadoRegion: string; ciudad: string; municipio: string;
  telefonos: string; fax: string; diasCredito: string; limiteCredito: string; referencia: string;
  zonaVentas: string; grupo: string; tipoPrecio: string; descuentoPct: string; pctRetencion: string; nacional: boolean;
  notas: string; activo: boolean; aceptaCheque: boolean;
};

export function FichaContacto({ rol, ficha, nombreSugerido = "", resumen, vendedor, puedeEditar, onGuardada, onCerrar }: {
  rol: RolDirectorio;
  ficha: Cliente | Proveedor | null;
  /** Para crear la ficha de un nombre que ya está en la cartera. */
  nombreSugerido?: string;
  resumen: ResumenContacto | null;
  /** Por cobrar: el vendedor externo del cliente (se cambia en Cuentas por Cobrar). */
  vendedor?: string | null;
  puedeEditar: boolean;
  onGuardada: (texto: string) => void;
  onCerrar: () => void;
}) {
  const cli = rol === "cliente" ? (ficha as Cliente | null) : null;
  const prov = rol === "proveedor" ? (ficha as Proveedor | null) : null;
  const [d, setD] = useState<Datos>(() => ({
    codigo: ficha?.codigo ?? "", tipoPersona: ficha?.tipoPersona ?? "juridica", rif: ficha?.rif ?? "",
    nombre: ficha?.nombre ?? nombreSugerido, denominacion: (cli?.denominacion ?? prov?.denominacion) || DENOMINACIONES[0],
    contacto: ficha?.contacto ?? "", correo: ficha?.correo ?? "", direccion: ficha?.direccion ?? "",
    estadoRegion: ficha?.estadoRegion ?? "", ciudad: ficha?.ciudad ?? "", municipio: ficha?.municipio ?? "",
    telefonos: ficha?.telefonos ?? "", fax: ficha?.fax ?? "",
    diasCredito: String(ficha?.diasCredito ?? 0), limiteCredito: ficha ? fmtMonto(ficha.limiteCredito) : "",
    referencia: ficha?.referencia ?? "", zonaVentas: cli?.zonaVentas ?? "", grupo: ficha?.grupo ?? "",
    tipoPrecio: cli?.tipoPrecio || TIPOS_PRECIO[0], descuentoPct: cli ? String(cli.descuentoPct || "") : "",
    pctRetencion: prov ? String(prov.pctRetencion || "") : "", nacional: prov?.nacional ?? true,
    notas: ficha?.notas ?? "", activo: ficha?.activo ?? true, aceptaCheque: cli?.aceptaCheque ?? true,
  }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof Datos) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const sinEditar = !puedeEditar;

  async function registrar() {
    if (sinEditar || guardando) return;
    setError(null);
    if (!d.nombre.trim()) return setError("El nombre es obligatorio.");
    if (rol === "proveedor" && !d.rif.trim()) return setError("El RIF del proveedor es obligatorio: es su código.");
    const limite = d.limiteCredito.trim() ? parseMonto(d.limiteCredito) : 0;
    if (limite === null || limite < 0) return setError("No se entiende el límite de crédito. Ejemplo: 1.500,00");
    const dias = Number(d.diasCredito || 0);
    if (!Number.isInteger(dias) || dias < 0) return setError("Los días de crédito son un número entero.");
    const pct = (s: string) => (s.trim() ? parseMonto(s) : 0);
    const comun = {
      codigo: d.codigo, tipoPersona: d.tipoPersona, nombre: d.nombre, contacto: d.contacto, correo: d.correo === "@" ? "" : d.correo,
      direccion: d.direccion, estadoRegion: d.estadoRegion, ciudad: d.ciudad, municipio: d.municipio,
      telefonos: d.telefonos, fax: d.fax, diasCredito: dias, limiteCredito: limite, referencia: d.referencia, grupo: d.grupo,
      notas: d.notas, activo: d.activo, denominacion: d.denominacion,
    };
    setGuardando(true);
    try {
      if (rol === "cliente") {
        const desc = pct(d.descuentoPct);
        if (desc === null || desc < 0 || desc > 100) return setError("El % de descuento va de 0 a 100.");
        const r = await guardarCliente({ ...comun, id: cli?.id, rif: d.rif, zonaVentas: d.zonaVentas, tipoPrecio: d.tipoPrecio, descuentoPct: desc, aceptaCheque: d.aceptaCheque });
        if (!r.ok) return setError(r.error);
        onGuardada(`Ficha de ${r.cliente.nombre} guardada.`);
      } else {
        const ret = pct(d.pctRetencion);
        if (ret === null || ret < 0 || ret > 100) return setError("El % de retención va de 0 a 100.");
        const r = await guardarProveedor({ ...comun, rif: d.rif, nacional: d.nacional, pctRetencion: ret });
        if (!r.ok) return setError(r.error);
        onGuardada(`Ficha de ${r.proveedor.nombre} guardada.`);
      }
    } finally { setGuardando(false); }
  }


  const quien = rol === "cliente" ? "Cliente" : "Proveedor";
  const saldo = resumen?.saldo ?? 0;
  const limite = parseMonto(d.limiteCredito) ?? 0;
  const disp = limite > 0 ? Math.max(0, limite - saldo) : 0;
  const enlace = "font-medium text-brand underline-offset-2 hover:underline disabled:text-muted disabled:no-underline";

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_15rem]">
      <fieldset disabled={sinEditar} className="min-w-0 space-y-3">
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_1fr]">
          <Campo label="Código"><input className={campo} value={d.codigo} onChange={set("codigo")} placeholder={d.rif ? d.rif.replace(/[^A-Z0-9]/gi, "").toUpperCase() : "Opcional"} /></Campo>
          <Campo label={`Tipo de ${quien}`}>
            <select className={campo} value={d.tipoPersona} onChange={set("tipoPersona")}>
              <option value="natural">Natural</option><option value="juridica">Jurídica</option>
            </select>
          </Campo>
          <Campo label="R.I.F."><input className={campo} value={d.rif} onChange={set("rif")} placeholder={rol === "cliente" ? "J-12345678-9 (opcional)" : "J-12345678-9"} disabled={rol === "proveedor" && !!prov} /></Campo>
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <Barra>Datos e Información Fiscal y Tributaria</Barra>
          <Campo label="Nombre"><input className={campo} value={d.nombre} onChange={set("nombre")} /></Campo>
          <Campo label="Denominación Fiscal" ancho="sm:max-w-xs">
            <select className={campo} value={d.denominacion} onChange={set("denominacion")}>{DENOMINACIONES.map((x) => <option key={x}>{x}</option>)}</select>
          </Campo>

          <Barra>Datos del {quien}</Barra>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Contacto"><input className={campo} value={d.contacto} onChange={set("contacto")} /></Campo>
            <Campo label="Correo Electrónico"><input type="email" className={campo} value={d.correo} onChange={set("correo")} placeholder="@" /></Campo>
          </div>
          <Campo label="Dirección"><input className={campo} value={d.direccion} onChange={set("direccion")} /></Campo>
          {/* Sin «País»: todos los clientes y proveedores son nacionales. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Estado"><input className={campo} value={d.estadoRegion} onChange={set("estadoRegion")} placeholder="LOCAL" /></Campo>
            <Campo label="Ciudad"><input className={campo} value={d.ciudad} onChange={set("ciudad")} placeholder="LOCAL" /></Campo>
            <Campo label="Municipio"><input className={campo} value={d.municipio} onChange={set("municipio")} placeholder="LOCAL" /></Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Teléfonos"><input className={campo} value={d.telefonos} onChange={set("telefonos")} /></Campo>
            <Campo label="Fax"><input className={campo} value={d.fax} onChange={set("fax")} /></Campo>
          </div>

          <Barra>Clasificación y Opciones de Crédito</Barra>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Días de Crédito"><input inputMode="numeric" className={campo} value={d.diasCredito} onChange={set("diasCredito")} /></Campo>
            <CampoMonto etiqueta="Límite de Crédito" valor={d.limiteCredito} onChange={(t) => setD((x) => ({ ...x, limiteCredito: t }))} />
            <Campo label="Referencia"><input className={campo} value={d.referencia} onChange={set("referencia")} /></Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {rol === "cliente" ? (
              <>
                <Campo label="Zona Ventas"><input className={campo} value={d.zonaVentas} onChange={set("zonaVentas")} placeholder="LOCAL" /></Campo>
                <Campo label="Vendedor"><input className={campo} value={vendedor ?? "Sin Vendedor"} readOnly title="Se asigna en Cuentas por Cobrar" /></Campo>
              </>
            ) : (
              <>
                <Campo label="Origen">
                  <select className={campo} value={d.nacional ? "n" : "e"} onChange={(e) => setD((x) => ({ ...x, nacional: e.target.value === "n" }))}>
                    <option value="n">Nacional</option><option value="e">Extranjero</option>
                  </select>
                </Campo>
                <Campo label="% Retención de IVA"><input inputMode="decimal" className={campo} value={d.pctRetencion} onChange={set("pctRetencion")} placeholder="0,00" /></Campo>
              </>
            )}
            <Campo label="Grupo"><input className={campo} value={d.grupo} onChange={set("grupo")} placeholder="CORPORATIVOS" /></Campo>
          </div>

          <Barra>{rol === "cliente" ? "Precios y Comentarios" : "Comentarios"}</Barra>
          {rol === "cliente" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Tipo de Precio">
                <select className={campo} value={d.tipoPrecio} onChange={set("tipoPrecio")}>{TIPOS_PRECIO.map((x) => <option key={x}>{x}</option>)}</select>
              </Campo>
              <Campo label="% Descuento Especial"><input inputMode="decimal" className={campo} value={d.descuentoPct} onChange={set("descuentoPct")} placeholder="0,00" /></Campo>
            </div>
          )}
          <Campo label="Notas"><input className={campo} value={d.notas} onChange={set("notas")} /></Campo>
        </div>
      </fieldset>

      <aside className="space-y-3">
        <div className="space-y-1.5 rounded-xl border border-border p-3">
          <Fila k="Total Débitos" v={fmtMonto(resumen?.debitos ?? 0)} />
          <Fila k="Total Créditos" v={fmtMonto(resumen?.creditos ?? 0)} />
          <div className="border-t border-border pt-1.5"><Fila k="Total Saldo" v={fmtMonto(saldo)} fuerte /></div>
          <Fila k="Total Anticipos" v={fmtMonto(0)} />
          <div className="border-t border-border pt-1.5"><Fila k="Saldo - Anticipos" v={fmtMonto(saldo)} fuerte /></div>
          <Fila k="Crédito Disp." v={limite > 0 ? fmtMonto(disp) : "—"} fuerte />
        </div>
        <div className="space-y-2 rounded-xl border border-border p-3 text-xs">
          <p className="flex justify-between gap-2"><span className="text-muted">Estatus:</span>
            <button type="button" className={enlace} disabled={sinEditar} onClick={() => setD((x) => ({ ...x, activo: !x.activo }))}>{d.activo ? "Activo" : "Inactivo"}</button></p>
          {rol === "cliente" && (
            <p className="flex justify-between gap-2"><span className="text-muted">Aceptar Cheque:</span>
              <button type="button" className={enlace} disabled={sinEditar} onClick={() => setD((x) => ({ ...x, aceptaCheque: !x.aceptaCheque }))}>{d.aceptaCheque ? "Sí" : "No"}</button></p>
          )}
          <p className="flex justify-between gap-2"><span className="text-muted">Documentos:</span><span className="text-text">{resumen ? `${resumen.abiertos} abierto(s) de ${resumen.documentos}` : "—"}</span></p>
        </div>
      </aside>

      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger lg:col-span-2">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
        {puedeEditar && <Button icon="check" cargando={guardando} textoCargando="Guardando…" onClick={registrar}>Guardar</Button>}
        <Button variant="secondary" icon="close" onClick={onCerrar}>Cerrar</Button>
      </div>
    </div>
  );
}
