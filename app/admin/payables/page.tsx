"use client";

import { useState } from "react";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { listarCuentas, abonar, type Cuenta as CuentaDb, type CuentaDetalle } from "@/lib/finanzas/cuentas-db";
import { FiltroClase } from "@/components/finanzas/FiltroClase";
import { CLASES, grupoDeClase } from "@/lib/finanzas/retencion";
import { DetalleCuenta } from "@/components/finanzas/DetalleCuenta";
import { EditarCuenta } from "@/components/finanzas/EditarCuenta";
import { Modal } from "@/components/ui/Modal";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { parseMonto, fmtMonto } from "@/lib/ux/monto";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { FormularioCuenta } from "@/components/finanzas/FormularioCuenta";
import { ImportarCartera } from "@/components/finanzas/ImportarCartera";
import { useCarga } from "@/lib/ux/use-carga";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";
import { fmtUsd } from "@/lib/ux/format";
import { MarcaRevision } from "@/components/finanzas/MarcaRevision";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { textoCelda } from "@/lib/ux/tabla-export";

type Cta = { id: number; proveedor: string; doc: string; monto: number; abonado: number; venc: string };
const estadoDe = (saldo: number, d: number): { label: string; tone: Tone } =>
  saldo <= 0 ? { label: "Pagada", tone: "ok" }
  : d < 0 ? { label: `Vencida (${-d}d)`, tone: "danger" }
  : d <= 7 ? { label: `Alerta (${d}d)`, tone: "warn" }
  : { label: "Al día", tone: "info" };
const inputClass = "sumi-campo";

// «Descargar» baja las cuentas tal como se ven, con su filtro de clase.
export default function PayablesPage() {
  return <ProveedorExportar><CuentasPorPagar /></ProveedorExportar>;
}

function CuentasPorPagar() {
  const empresaKey = useEmpresaActiva();
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresaKey}:${recarga}`, () => listarCuentas(empresaKey, "pagar"));
  const ctas: CuentaDb[] = carga.datos ?? [];
  const [docSel, setDocSel] = useState("");
  // Texto, no numero: parseMonto decide que significa. Guardar un numero
  // obligaba a convertir en cada tecla y perdia lo que se estaba escribiendo.
  const [abono, setAbono] = useState("");
  const [msg, setMsg] = useState("");
  // El exito NO puede vivir dentro del panel: al confirmar, el panel se cierra
  // y el mensaje se iba con el. Quien abonaba no veia ninguna respuesta.
  const [exito, setExito] = useState("");
  // Que cuenta se esta mirando, y si esta en modo edicion. Son dos estados
  // distintos: se puede abrir el detalle sin editar.
  const [abierta, setAbierta] = useState<number | null>(null);
  const [editando, setEditando] = useState<CuentaDetalle | null>(null);
  const [filtroClase, setFiltroClase] = useState<string>("todas");

  async function registrarAbono(): Promise<boolean> {
    setMsg("");
    const a = parseMonto(abono);
    const c = ctas.find((x) => x.documento === docSel);
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

    // saldo y dias los calcula la BASE, contra la fecha de hoy real.
  const conSaldo = ctas
    .filter((c) => filtroClase === "todas" || grupoDeClase(c.clase) === filtroClase)
    .map((c) => ({ ...c, d: c.dias }));

  // Cuantas hay de cada clase, para no ofrecer un filtro que deja la tabla
  // vacia: un filtro con cero resultados parece que el sistema perdio datos.
  // Se cuenta por GRUPO, no por clase: la pestaña «Nota de entrega» tiene que
  // decir cuantas cuentas va a mostrar, y muestra tambien las de debito.
  const porClase = ctas.reduce<Record<string, number>>(
    (a, c) => { const g = grupoDeClase(c.clase); return { ...a, [g]: (a[g] ?? 0) + 1 }; }, {});

  // Funcion que devuelve JSX, no componente: un componente definido adentro de
  // otro es un tipo nuevo en cada render, React lo remonta y el input pierde
  // el foco a cada tecla.
  const panelAbono = (cerrar: () => void) => (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text">Registrar abono</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Documento</span>
        <select className={inputClass} value={docSel} onChange={(e) => setDocSel(e.target.value)}>
          <option value="">Elige un documento…</option>
          {conSaldo.filter((c) => c.saldoNeto > 0).map((c) => (
            <option key={c.documento} value={c.documento}>
              {c.documento} · {c.contraparte} · saldo {fmtUsd(c.saldoNeto)}
            </option>
          ))}
        </select>
      </label>
      <CampoMonto etiqueta="Abono" valor={abono} onChange={setAbono} />
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
  // Todo en NETO. La retencion no se le paga al proveedor -se le entera al
  // SENIAT-, asi que la deuda con el es el total menos lo retenido. Greeg pidio
  // que el panel muestre esa cifra, que es la que hay que mover.
  const total = conSaldo.reduce((a, c) => a + c.saldoNeto, 0);

  // «A Pagar» es el neto: la factura menos el IVA retenido, que va al SENIAT.
  useExportable(() => ({
    modulo: "",
    seccion: "Cuentas por Pagar",
    titulo: "Cuentas por Pagar",
    detalle: [
      filtroClase === "todas" ? "Todas las clases" : `Clase: ${CLASES.find((x) => x.id === filtroClase)?.label ?? filtroClase}`,
      `Total a pagar ${textoCelda(total, "usd")}`,
    ],
    columnas: [
      { titulo: "Proveedor" }, { titulo: "Documento", tipo: "codigo" }, { titulo: "Clase" }, { titulo: "Total Factura", tipo: "usd" },
      { titulo: "IVA Retenido", tipo: "usd" }, { titulo: "A Pagar", tipo: "usd" }, { titulo: "Abonado", tipo: "usd" },
      { titulo: "Saldo", tipo: "usd" }, { titulo: "Vence", tipo: "fecha" }, { titulo: "Estado" },
    ],
    filas: conSaldo.map((c) => [
      c.contraparte, c.documento, CLASES.find((x) => x.id === c.clase)?.label ?? null, c.monto, c.ivaRetenido ?? null,
      c.neto, c.abonado, c.saldoNeto, c.vence, c.estado === "liquidada" ? "Liquidada" : estadoDe(c.saldoNeto, c.d).label,
    ]),
    totales: [
      `Total · ${conSaldo.length} cuenta(s)`, "", "", conSaldo.reduce((a, c) => a + c.monto, 0),
      conSaldo.reduce((a, c) => a + (c.ivaRetenido ?? 0), 0), conSaldo.reduce((a, c) => a + c.neto, 0),
      conSaldo.reduce((a, c) => a + c.abonado, 0), total, "", "",
    ],
    nota: "Montos en USD. A Pagar es el total de la factura menos el IVA retenido.",
  }));
  // Cuentas cuyo desglose no es el 16% plano: facturas con renglones exentos.
  // Greeg pidio que se le avise, porque si se recalculan con el IVA automatico
  // sube la retencion, y eso es plata que se entera al SENIAT.
  const aRevisar = conSaldo.filter((c) => c.revision.atipico);
  // En unas el exento viene como columna aparte y se puede sumar; en otras
  // quedo metido dentro de la base y solo se nota por la tasa. Se cuentan
  // aparte para no dar a entender que el monto cubre todas.
  const conExento = aRevisar.filter((c) => c.revision.atipico && c.revision.motivo === "exento");
  const exento = conExento.reduce(
    (a, c) => a + (c.revision.atipico && c.revision.motivo === "exento" ? c.revision.exento : 0), 0);
  const vencido = conSaldo.filter((c) => c.saldoNeto > 0 && c.d < 0).reduce((a, c) => a + c.saldoNeto, 0);
  const alerta = conSaldo.filter((c) => c.saldoNeto > 0 && c.d >= 0 && c.d <= 7).reduce((a, c) => a + c.saldoNeto, 0);
  const nVenc = conSaldo.filter((c) => c.saldoNeto > 0 && c.d < 0).length;

  return (
    <>
      <PageHeader
        title="Cuentas por Pagar"
        breadcrumbs={[{ label: "Finanzas" }, { label: "Cuentas por Pagar" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PildoraPanel etiqueta="Nueva cuenta" icono="plus">
              {(cerrar) => (
                <FormularioCuenta tipo="pagar" empresa={empresaKey}
                  onCreada={() => setRecarga((n) => n + 1)} onCerrar={cerrar} />
              )}
            </PildoraPanel>
            <ImportarCartera tipo="pagar" empresa={empresaKey} onImportada={() => setRecarga((n) => n + 1)} />
            <PildoraPanel etiqueta="Registrar abono" icono="cash">
              {(cerrar) => panelAbono(cerrar)}
            </PildoraPanel>
            <BotonDescargar empresa={empresaKey} />
          </div>
        }
      />
      {exito && (
        <div className="mb-4">
          <AlertCard tone="ok" titulo="Abono Registrado" mensaje={exito} />
        </div>
      )}
      <FiltroClase conteo={porClase} total={ctas.length}
        valor={filtroClase} onCambio={setFiltroClase} />

      <SectionCard title="Resumen">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total a Pagar" value={fmtUsd(total)} accent />
          <StatCard label="Vencido" value={fmtUsd(vencido)} />
          <StatCard label="Alerta (≤7d)" value={fmtUsd(alerta)} />
          <StatCard label="Cuentas Vencidas" value={String(nVenc)} />
        </div>
      </SectionCard>
      {nVenc > 0 && (
        <div className="mt-4">
          <AlertCard tone="danger" titulo="Pagos Vencidos" mensaje={`${nVenc} cuenta(s) vencida(s) por ${fmtUsd(vencido)}.`} />
        </div>
      )}
      {aRevisar.length > 0 && (
        <div className="mt-4">
          <AlertCard
            tone="warn"
            titulo="Facturas que no están gravadas al 16%"
            mensaje={
              `${aRevisar.length} cuenta(s) llevan renglones exentos. ` +
              (conExento.length
                ? `En ${conExento.length} son ${fmtUsd(exento)} sin IVA; ` +
                  `en las otras ${aRevisar.length - conExento.length} lo exento viene sumado dentro de la base. `
                : "") +
              "Están marcadas en la tabla. Si las editas, carga la base y el IVA a mano: " +
              "el 16% automático los gravaría de más y subiría la retención."
            }
          />
        </div>
      )}
      <div className="mt-6">
        <SectionCard title="Cuentas" description="Generadas automáticamente al recibir compras.">
          <EstadoDatos
            cargando={carga.cargando}
            error={carga.error}
            vacio={conSaldo.length === 0}
            tituloVacio="Sin Cuentas por Pagar"
            mensajeVacio={
              // Con un filtro puesto la tabla puede estar vacia AUNQUE haya
              // cuentas. Decir "no hay deudas" seria mentir: hay, pero no de
              // esa clase.
              filtroClase === "todas"
                ? "No hay deudas cargadas. Usa «Nueva cuenta» o importa la cartera."
                : `No hay ninguna cuenta de esa clase. Hay ${ctas.length} en total: toca «Todas».`
            }
          >
            <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 font-medium">Proveedor</th>
                  <th className="py-2.5 pr-3 font-medium">Documento</th>
                  <th className="py-2.5 pr-3 font-medium">Clase</th>
                  <th className="py-2.5 pr-3 text-right font-medium">A Pagar</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Saldo</th>
                  <th className="py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conSaldo.map((c) => {
                  const e = estadoDe(c.saldoNeto, c.d);
                  return (
                    <tr key={c.id} onClick={() => setAbierta(c.id)}
                      className="cursor-pointer hover:bg-surface-2"
                      tabIndex={0}
                      onKeyDown={(ev) => { if (ev.key === "Enter") setAbierta(c.id); }}>
                      <td className="py-2.5 pr-3 text-text">{c.contraparte}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">
                        {c.documento}
                        <MarcaRevision revision={c.revision} />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {CLASES.find((x) => x.id === c.clase)?.label ?? "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {fmtUsd(c.neto)}
                        {/* Si hay retencion, el total de la factura es otro.
                            Se deja a la vista para poder conciliar con el papel. */}
                        {c.ivaRetenido ? (
                          <span className="block text-[11px] text-muted/80">
                            factura {fmtUsd(c.monto)}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-text">{fmtUsd(c.saldoNeto)}</td>
                      <td className="py-2.5">
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
            </table>
          </div>
          </EstadoDatos>
        </SectionCard>
      </div>

      {abierta !== null && (
        <Modal titulo="Cuenta por Pagar" onCerrar={() => { setAbierta(null); setEditando(null); }}>
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
