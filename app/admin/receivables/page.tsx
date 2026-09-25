"use client";

import { useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto } from "@/lib/ux/monto";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { FormularioCuenta } from "@/components/finanzas/FormularioCuenta";
import { ImportarCartera } from "@/components/finanzas/ImportarCartera";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarCuentas, abonar, type Cuenta as CuentaDb, type CuentaDetalle } from "@/lib/finanzas/cuentas-db";
import { FiltroClase } from "@/components/finanzas/FiltroClase";
import { CLASES, grupoDeClase } from "@/lib/finanzas/retencion";
import { DetalleCuenta } from "@/components/finanzas/DetalleCuenta";
import { EditarCuenta } from "@/components/finanzas/EditarCuenta";
import { Modal } from "@/components/ui/Modal";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { fechaVista, textoCelda } from "@/lib/ux/tabla-export";
import { agruparPorCliente } from "@/lib/finanzas/cartera";
import { Icon } from "@/components/ui/Icon";

type Cuenta = { id: number; cliente: string; doc: string; monto: number; abonado: number; venc: string };



function estadoDe(saldo: number, dias: number): { label: string; tone: Tone } {
  if (saldo <= 0) return { label: "Pagado", tone: "ok" };
  if (dias < 0) return { label: `Vencido (${-dias}d)`, tone: "danger" };
  if (dias <= 8) return { label: `Por vencer (${dias}d)`, tone: "warn" };
  return { label: "Al día", tone: "info" };
}

const inputClass = "sumi-campo";

// «Descargar» baja la cartera tal como se ve, con su filtro de clase.
export default function ReceivablesPage() {
  return <ProveedorExportar><CuentasPorCobrar /></ProveedorExportar>;
}

function CuentasPorCobrar() {
  const empresaKey = useEmpresaActiva();
  // Las cuentas viven en la base y el saldo lo calcula la vista sumando abonos.
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarCuentas(empresaKey, "cobrar"));
  const cuentas: CuentaDb[] = carga.datos ?? [];
  const [docSel, setDocSel] = useState("");
  // Texto, no numero: parseMonto decide que significa.
  const [abono, setAbono] = useState("");
  // El exito NO puede vivir dentro del panel: el panel se cierra encima.
  const [exito, setExito] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [editando, setEditando] = useState<CuentaDetalle | null>(null);
  const [filtroClase, setFiltroClase] = useState<string>("todas");
  const [msg, setMsg] = useState("");

  async function registrarAbono(): Promise<boolean> {
    setMsg("");
    const a = parseMonto(abono);
    const c = cuentas.find((x) => x.documento === docSel);
    if (!c) { setMsg("ERR:Selecciona un documento."); return false; }
    if (a === null) { setMsg("ERR:No se entiende ese monto. Ejemplo: 1.500,50"); return false; }
    if (a <= 0) { setMsg("ERR:Ingresa un abono mayor a 0."); return false; }

    // La base vuelve a comprobar que el abono no supere el saldo: dos personas
    // abonando a la vez podrian pasarse si solo se validara aqui.
    const r = await abonar(c.id, a);
    if (!r.ok) { setMsg(`ERR:${r.error}`); return false; }

    setRecarga((n) => n + 1);
    setExito(`Abono de ${fmtUsd(a)} aplicado a ${docSel}.`);
    setAbono("");
    setDocSel("");
    return true;
  }

  // Vive dentro de la pildora, no en una columna fija: se abona de a ratos y
  // la cartera es lo que se mira todo el dia.
  //
  // Es una FUNCION que devuelve JSX, no un componente. Definir un componente
  // dentro de otro lo convierte en un tipo nuevo en cada render: React lo
  // remonta y el input pierde el foco a cada tecla.
  const panelAbono = (cerrar: () => void) => (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">Registrar abono</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Documento</span>
        <select className={inputClass} value={docSel} onChange={(e) => setDocSel(e.target.value)}>
          <option value="">Elige un documento…</option>
          {conSaldo.filter((c) => c.saldo > 0).map((c) => (
            <option key={c.documento} value={c.documento}>
              {c.documento} · {c.contraparte} · saldo {fmtUsd(c.saldo)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Abono (USD)</span>
        {/* Vacío en vez de 0: con el 0 puesto, teclear 2500 daba "02500". */}
        <CampoMonto etiqueta="Abono" valor={abono} onChange={setAbono} />
      </label>
      {msg && (
        <p role="alert" className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
          {msg.replace("ERR:", "")}
        </p>
      )}
      <div className="flex gap-2">
        {/* Se confirma porque mueve dinero y no se deshace, y porque el panel
            se cierra con un toque afuera: es facil pulsar de mas. El resumen
            repite el documento y el monto, que es lo unico que hay que
            verificar antes de que quede asentado. */}
        <ConfirmDialog
          title="¿Registrar el abono?"
          message={`${fmtUsd(parseMonto(abono) ?? 0)} a ${docSel || "(sin documento)"}. Queda asentado y no se puede deshacer.`}
          confirmLabel="Sí, registrar"
          onConfirm={async () => { if (await registrarAbono()) cerrar(); }}
          trigger={(abrir) => (
            <Button icon="cash" className="flex-1"
              onClick={() => {
                // Se valida antes de abrir: confirmar y recien ahi enterarse de
                // que falta el documento es peor que no confirmar.
                setMsg("");
                if (!docSel) return setMsg("ERR:Selecciona un documento.");
                const a = parseMonto(abono);
                if (a === null) return setMsg("ERR:No se entiende ese monto. Ejemplo: 1.500,50");
                if (a <= 0) return setMsg("ERR:Ingresa un abono mayor a 0.");
                abrir();
              }}>Registrar abono</Button>
          )}
        />
        <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
      </div>
    </div>
  );

    // saldo y dias los calcula la BASE. La version anterior usaba una fecha de
  // "hoy" escrita a mano (23/06/2026) que quedo congelada: una cuenta vencida
  // hace dos meses se mostraba al dia.
  const conSaldo = cuentas.filter((c) => filtroClase === "todas" || grupoDeClase(c.clase) === filtroClase);

  // Cuantas hay de cada clase: no se ofrece un filtro que deja la tabla vacia,
  // porque parece que el sistema perdio datos.
  // Se cuenta por GRUPO, no por clase: la pestaña «Nota de entrega» tiene que
  // decir cuantas cuentas va a mostrar, y muestra tambien las de debito.
  const porClase = cuentas.reduce<Record<string, number>>(
    (a, c) => { const g = grupoDeClase(c.clase); return { ...a, [g]: (a[g] ?? 0) + 1 }; }, {});
  const totalSaldo = conSaldo.reduce((a, c) => a + c.saldo, 0);
  const vencido = conSaldo.filter((c) => c.saldo > 0 && c.dias < 0).reduce((a, c) => a + c.saldo, 0);
  const porVencer = conSaldo.filter((c) => c.saldo > 0 && c.dias >= 0 && c.dias <= 8).reduce((a, c) => a + c.saldo, 0);
  const nVencidas = conSaldo.filter((c) => c.saldo > 0 && c.dias < 0).length;

  // La cartera por cliente: una fila con lo que debe, y sus documentos adentro.
  const [buscaCliente, setBuscaCliente] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const clientes = agruparPorCliente(conSaldo);
  const tc = buscaCliente.trim().toLowerCase();
  const clientesVisibles = tc ? clientes.filter((g) => g.cliente.toLowerCase().includes(tc)) : clientes;
  const alternar = (k: string) => setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const todosAbiertos = clientesVisibles.length > 0 && clientesVisibles.every((g) => abiertos.has(g.cliente));
  const nombreClase = (id: string) => CLASES.find((x) => x.id === id)?.label ?? id;
  const resumenClases = (pc: Record<string, number>) =>
    Object.entries(pc).map(([k, v]) => `${v} ${k === "nota_entrega" ? "NE" : nombreClase(k).toLowerCase()}`).join(" · ");

  useExportable(() => ({
    modulo: "",
    seccion: "Cuentas por Cobrar",
    titulo: "Cuentas por Cobrar",
    detalle: [
      filtroClase === "todas" ? "Todas las clases" : `Clase: ${CLASES.find((x) => x.id === filtroClase)?.label ?? filtroClase}`,
      `Por cobrar ${textoCelda(totalSaldo, "usd")} · Vencido ${textoCelda(vencido, "usd")} · Por vencer ${textoCelda(porVencer, "usd")}`,
      `${clientesVisibles.length} cliente(s)${tc ? ` · búsqueda «${buscaCliente.trim()}»` : ""}`,
    ],
    columnas: [
      { titulo: "Cliente" }, { titulo: "Documento", tipo: "codigo" }, { titulo: "Clase" }, { titulo: "Monto", tipo: "usd" },
      { titulo: "Abonado", tipo: "usd" }, { titulo: "Saldo", tipo: "usd" }, { titulo: "Vence", tipo: "fecha" }, { titulo: "Estado" },
    ],
    // Por cliente: sus documentos y, al final de cada uno, lo que debe en total.
    filas: clientesVisibles.flatMap((g) => [
      ...g.cuentas.map((c) => [
        c.contraparte, c.documento, CLASES.find((x) => x.id === c.clase)?.label ?? null, c.monto, c.abonado, c.saldo, c.vence,
        c.estado === "liquidada" ? "Liquidada" : estadoDe(c.saldo, c.dias).label,
      ]),
      [`Total ${g.cliente}`, `${g.documentos} documento(s)`, null, g.monto, g.abonado, g.saldo, null,
       g.masVieja && g.masVieja.dias < 0 ? `Vencido ${textoCelda(g.vencido, "usd")}` : null],
    ]),
    totales: [
      `Total · ${clientesVisibles.length} cliente(s)`, `${clientesVisibles.reduce((a, g) => a + g.documentos, 0)} documento(s)`, "",
      clientesVisibles.reduce((a, g) => a + g.monto, 0), clientesVisibles.reduce((a, g) => a + g.abonado, 0),
      clientesVisibles.reduce((a, g) => a + g.saldo, 0), "", "",
    ],
    nota: "Montos en USD. El saldo es el monto menos lo abonado.",
  }));

  return (
    <>
      <PageHeader
        title="Cuentas por Cobrar"
        breadcrumbs={[{ label: "Finanzas" }, { label: "Cuentas por Cobrar" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PildoraPanel etiqueta="Nueva cuenta" icono="plus">
              {(cerrar) => (
                <FormularioCuenta tipo="cobrar" empresa={empresaKey}
                  onCreada={() => setRecarga((n) => n + 1)} onCerrar={cerrar} />
              )}
            </PildoraPanel>
            <ImportarCartera tipo="cobrar" empresa={empresaKey} onImportada={() => setRecarga((n) => n + 1)} />
            <PildoraPanel etiqueta="Registrar abono" icono="cash">
              {(cerrar) => panelAbono(cerrar)}
            </PildoraPanel>
            <BotonDescargar empresa={empresaKey} />
          </div>
        }
      />

      <FiltroClase conteo={porClase} total={cuentas.length}
        valor={filtroClase} onCambio={setFiltroClase} />

      <SectionCard title="Resumen de Cartera">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total por Cobrar" value={fmtUsd(totalSaldo)} accent />
          <StatCard label="Vencido" value={fmtUsd(vencido)} />
          <StatCard label="Por Vencer (≤8d)" value={fmtUsd(porVencer)} />
          <StatCard label="Cuentas Vencidas" value={String(nVencidas)} />
        </div>
      </SectionCard>

      {nVencidas > 0 && (
        <div className="mt-4">
          <AlertCard tone="danger" titulo="Cartera Vencida"
            mensaje={`${nVencidas} cuenta(s) vencida(s) por ${fmtUsd(vencido)}. La venta a un cliente moroso requiere aprobación.`} />
        </div>
      )}

      <div className="mt-6">
      <SectionCard title="Cartera" description="Lo que debe cada cliente. Toca un cliente para ver sus documentos.">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input type="search" className="sumi-campo sumi-campo--auto min-w-[12rem] flex-1 sm:max-w-sm" placeholder="Buscar cliente"
              aria-label="Buscar cliente" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
            <Button variant="ghost" onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(clientesVisibles.map((g) => g.cliente)))}>
              {todosAbiertos ? "Contraer todos" : "Desplegar todos"}
            </Button>
            <span className="text-xs text-muted">{clientesVisibles.length} cliente(s)</span>
          </div>
          <EstadoDatos
            cargando={carga.cargando}
            error={carga.error}
            vacio={clientesVisibles.length === 0}
            tituloVacio={tc ? "Ningún cliente coincide" : "Sin Cuentas por Cobrar"}
            mensajeVacio={
              tc ? `No hay clientes con «${buscaCliente.trim()}».`
                : filtroClase === "todas"
                ? "Nadie debe nada todavía. Carga una con «Nueva cuenta» o importa la cartera."
                : `No hay ninguna cuenta de esa clase. Hay ${cuentas.length} en total: toca «Todas».`
            }
          >
            <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Cliente</th>
                  <th className="py-2.5 pr-3 font-medium">Documentos</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Monto</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Saldo</th>
                  <th className="py-2.5 pr-3 font-medium">Vence</th>
                  <th className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              {clientesVisibles.map((g) => {
                const abierto = abiertos.has(g.cliente);
                const eg = g.masVieja ? estadoDe(g.saldo, g.masVieja.dias) : { label: "Pagado", tone: "ok" as Tone };
                return (
                  <tbody key={g.cliente} className="border-b border-border">
                    <tr onClick={() => alternar(g.cliente)} tabIndex={0} aria-expanded={abierto}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); alternar(g.cliente); } }}
                      className="cursor-pointer bg-surface hover:bg-surface-2">
                      <td className="py-3 pr-3">
                        <span className="flex items-center gap-2">
                          <span className={`text-muted transition ${abierto ? "rotate-90" : ""}`} aria-hidden><Icon name="chevronRight" size={14} /></span>
                          <b className="font-semibold text-text">{g.cliente}</b>
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted">{g.documentos} · {resumenClases(g.porClase)}</td>
                      <td className="py-3 pr-3 text-right tabular-nums text-muted">{fmtUsd(g.monto)}</td>
                      <td className="py-3 pr-3 text-right font-semibold tabular-nums text-text">
                        {fmtUsd(g.saldo)}
                        {g.vencido > 0 && g.vencido < g.saldo && <span className="block text-[11px] font-normal text-danger">vencido {fmtUsd(g.vencido)}</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted">{g.masVieja ? `desde ${fechaVista(g.masVieja.vence)}` : "—"}</td>
                      <td className="py-3"><StatusBadge tone={eg.tone}>{eg.label}</StatusBadge></td>
                    </tr>
                    {abierto && g.cuentas.map((c) => {
                      const e = estadoDe(c.saldo, c.dias);
                      return (
                        <tr key={c.id} onClick={() => setAbierta(c.id)} tabIndex={0}
                          onKeyDown={(ev) => { if (ev.key === "Enter") setAbierta(c.id); }}
                          className="cursor-pointer bg-surface-2/60 text-xs hover:bg-surface-2">
                          <td className="py-2 pl-8 pr-3 font-mono text-muted">{c.documento}</td>
                          <td className="py-2 pr-3 text-muted">{nombreClase(c.clase)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted">{fmtUsd(c.monto)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-text">{fmtUsd(c.saldo)}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-muted">{fechaVista(c.vence)}</td>
                          <td className="py-2">
                            {/* Liquidada gana sobre vencida: una cuenta cerrada ya
                                no le debe nada a nadie, aunque su fecha pasara. */}
                            {c.estado === "liquidada"
                              ? <StatusBadge tone="ok">Liquidada</StatusBadge>
                              : <StatusBadge tone={e.tone}>{e.label}</StatusBadge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
          </EstadoDatos>
        </SectionCard>
      </div>

      {abierta !== null && (
        <Modal titulo="Cuenta por Cobrar" onCerrar={() => { setAbierta(null); setEditando(null); }}>
          {editando ? (
            <EditarCuenta
              cuenta={editando}
              onGuardada={() => { setEditando(null); setRecarga((n) => n + 1); }}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <DetalleCuenta
              cuentaId={abierta}
              empresa={empresaKey}
              onCambio={() => setRecarga((n) => n + 1)}
              onEditar={(d) => setEditando(d)}
            />
          )}
        </Modal>
      )}
    </>
  );
}
