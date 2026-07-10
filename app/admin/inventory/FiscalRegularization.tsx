"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  useFiscal,
  semaforoNota,
  lineasInsuficientes,
  stockValery,
  stockMaestro,
  convertirDirecta,
  regularizarEnBloque,
  type NotaEntrega,
  type FiscalTx,
  type CompraProveedor,
} from "@/lib/ux/inventory-fiscal";

const fieldClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

export function FiscalRegularization() {
  const { notas, ledger } = useFiscal();
  const [directa, setDirecta] = useState<NotaEntrega | null>(null);
  const [wizard, setWizard] = useState<NotaEntrega | null>(null);
  const [flash, setFlash] = useState("");

  const pendientes = useMemo(() => notas.filter((n) => n.estado === "pendiente"), [notas]);
  const facturadas = useMemo(() => notas.filter((n) => n.estado === "facturada"), [notas]);

  function onDone(factura: string) {
    setDirecta(null);
    setWizard(null);
    setFlash(`Factura fiscal ${factura} emitida en Valery. Maestro (M) intacto · balance S saldado.`);
    setTimeout(() => setFlash(""), 6000);
  }

  return (
    <>
      {flash && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
          <Icon name="check" size={16} /> {flash}
        </p>
      )}

      {/* Leyenda del semáforo */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
        <span className="font-medium text-text">Guía:</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-ok" /> Hay stock fiscal → conversión directa</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: "#f59e0b" }} /> ⚠️ Sin stock fiscal → requiere regularización de compra</span>
      </div>

      <SectionCard
        title="Bandeja de Notas de Entrega (SaaS)"
        description={`${pendientes.length} nota(s) por convertir a Factura Fiscal (Valery).`}
      >
        <div className="sumi-scroll max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="py-2.5 pr-3 font-medium">N°</th>
                <th className="py-2.5 pr-3 font-medium">Cliente fiscal</th>
                <th className="py-2.5 pr-3 font-medium">Fecha</th>
                <th className="py-2.5 pr-3 font-medium">Ítems</th>
                <th className="py-2.5 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendientes.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted">No hay notas pendientes de facturar.</td></tr>
              )}
              {pendientes.map((n) => {
                const sem = semaforoNota(n, ledger);
                const faltantes = lineasInsuficientes(n, ledger);
                return (
                  <tr key={n.id} className="align-top hover:bg-surface-2">
                    <td className="py-3 pr-3 font-mono text-xs text-muted">{n.numero}</td>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-text">{n.cliente.nombre}</div>
                      <div className="text-xs text-muted">{n.cliente.rif}</div>
                    </td>
                    <td className="py-3 pr-3 text-muted">{n.fecha}</td>
                    <td className="py-3 pr-3 text-muted">
                      {n.lineas.length} ítem(s)
                      {sem === "ambar" && (
                        <div className="mt-1 text-xs text-warn">{faltantes.length} sin stock fiscal</div>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {sem === "verde" ? (
                        <Button className="bg-ok text-white hover:opacity-90" icon="check" onClick={() => setDirecta(n)}>
                          Convertir a Factura Fiscal
                        </Button>
                      ) : (
                        <Button
                          className="text-white hover:opacity-90"
                          style={{ background: "#f59e0b" }}
                          icon="alert"
                          onClick={() => setWizard(n)}
                        >
                          ⚠️ Regularizar y facturar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {facturadas.length > 0 && (
        <>
          <div className="h-4" />
          <SectionCard title="Facturadas" description={`${facturadas.length} nota(s) regularizadas en Valery.`}>
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2.5 pr-3 font-medium">N°</th>
                    <th className="py-2.5 pr-3 font-medium">Cliente</th>
                    <th className="py-2.5 pr-3 font-medium">Factura fiscal</th>
                    <th className="py-2.5 font-medium">Flujo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {facturadas.map((n) => (
                    <tr key={n.id} className="hover:bg-surface-2">
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted">{n.numero}</td>
                      <td className="py-2.5 pr-3 text-text">{n.cliente.nombre}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-ok">{n.facturaFiscal}</td>
                      <td className="py-2.5">
                        {n.flujo === "B"
                          ? <StatusBadge tone="warn">B · con compra</StatusBadge>
                          : <StatusBadge tone="ok">A · directa</StatusBadge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {directa && <ModalDirecta nota={directa} ledger={ledger} onClose={() => setDirecta(null)} onDone={onDone} />}
      {wizard && <WizardRegularizacion nota={wizard} ledger={ledger} onClose={() => setWizard(null)} onDone={onDone} />}
    </>
  );
}

// ---------------------------------------------------------------- Overlay base
function Overlay({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-xl">{children}</div>
    </div>
  );
}

function ImpactoLinea({ codigo, cantidad, ledger }: { codigo: string; cantidad: number; ledger: FiscalTx[] }) {
  const v = stockValery(codigo, ledger);
  const m = stockMaestro(codigo, ledger);
  return (
    <span className="text-xs text-muted">
      V: {v} → <span className="text-danger">{Math.round((v - cantidad) * 1000) / 1000}</span> · M: {m} <span className="text-ok">(intacto)</span>
    </span>
  );
}

// ---------------------------------------------------------------- Flujo A · confirmación directa
function ModalDirecta({ nota, ledger, onClose, onDone }: { nota: NotaEntrega; ledger: FiscalTx[]; onClose: () => void; onDone: (f: string) => void }) {
  return (
    <Overlay label="Convertir a factura fiscal">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ok/15 text-ok"><Icon name="check" size={18} /></span>
        <h2 className="text-base font-semibold text-text">Convertir a Factura Fiscal</h2>
      </div>
      <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-sm">
        <div className="font-medium text-text">{nota.cliente.nombre}</div>
        <div className="text-xs text-muted">{nota.cliente.rif}{nota.cliente.direccion ? ` · ${nota.cliente.direccion}` : ""}</div>
      </div>
      <ul className="mt-3 space-y-2">
        {nota.lineas.map((l) => (
          <li key={l.codigo} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm">
            <span className="text-text">{l.nombre} <span className="text-muted">×{l.cantidad}</span></span>
            <ImpactoLinea codigo={l.codigo} cantidad={l.cantidad} ledger={ledger} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Se descuenta de Valery (V) y se salda el balance informal (S). El inventario Maestro (M) no se mueve: la mercancía ya fue entregada.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button className="bg-ok text-white hover:opacity-90" icon="check"
          onClick={() => { const { factura } = convertirDirecta(nota.id); onDone(factura); }}>
          Confirmar y facturar
        </Button>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------- Flujo B · wizard
function WizardRegularizacion({ nota, ledger, onClose, onDone }: { nota: NotaEntrega; ledger: FiscalTx[]; onClose: () => void; onDone: (f: string) => void }) {
  const [paso, setPaso] = useState(1);
  const [compra, setCompra] = useState<CompraProveedor>({ facturaProveedor: "", proveedor: "", costo: 0 });
  const faltantes = lineasInsuficientes(nota, ledger);
  const ok = compra.facturaProveedor.trim() && compra.proveedor.trim();

  return (
    <Overlay label="Regularización asistida">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "#f59e0b22", color: "#f59e0b" }}><Icon name="alert" size={18} /></span>
        <div>
          <h2 className="text-base font-semibold text-text">Regularización de compra</h2>
          <p className="text-xs text-muted">Paso {paso} de 2 · {nota.numero} · {nota.cliente.nombre}</p>
        </div>
      </div>

      {/* barra de pasos */}
      <div className="mt-4 flex gap-1">
        <div className={`h-1.5 flex-1 rounded-full ${paso >= 1 ? "bg-brand" : "bg-border"}`} />
        <div className={`h-1.5 flex-1 rounded-full ${paso >= 2 ? "bg-brand" : "bg-border"}`} />
      </div>

      {paso === 1 && (
        <div className="mt-4">
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
            Para facturar este producto, primero debemos registrar la <strong className="text-text">Factura de Compra del Proveedor</strong> para cargar el inventario en Valery.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <label className="mb-1 block text-xs text-muted">N° Factura Proveedor</label>
              <input className={fieldClass} value={compra.facturaProveedor} onChange={(e) => setCompra({ ...compra, facturaProveedor: e.target.value })} placeholder="Ej. 00-123456" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Proveedor</label>
              <input className={fieldClass} value={compra.proveedor} onChange={(e) => setCompra({ ...compra, proveedor: e.target.value })} placeholder="Razón social" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Costo unitario ($)</label>
              <input className={fieldClass} type="number" value={compra.costo || ""} onChange={(e) => setCompra({ ...compra, costo: Number(e.target.value) || 0 })} placeholder="0.00" />
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-border p-3 text-xs text-muted">
            <div className="mb-1 font-medium text-text">Productos a cargar ({faltantes.length}):</div>
            {faltantes.map((l) => {
              const v = stockValery(l.codigo, ledger);
              return <div key={l.codigo}>· {l.nombre} — déficit {Math.max(0, l.cantidad - v)} (V actual {v})</div>;
            })}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button disabled={!ok} onClick={() => setPaso(2)}>Continuar</Button>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="mt-4">
          <p className="text-sm text-muted">Al ejecutar, se procesan <strong className="text-text">dos transacciones encadenadas</strong> en Valery:</p>
          <ol className="mt-3 space-y-2 text-sm">
            <li className="rounded-xl border border-border bg-surface-2 p-3">
              <span className="font-medium text-text">1. Compra fiscal</span> — inyecta el inventario en Valery (V sube). Factura {compra.facturaProveedor} · {compra.proveedor}
            </li>
            <li className="rounded-xl border border-border bg-surface-2 p-3">
              <span className="font-medium text-text">2. Venta fiscal</span> — emite la factura de venta (V baja) y salda el balance S.
            </li>
          </ol>
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-xs text-ok">
            <Icon name="check" size={14} /> El Inventario Maestro (M) se mantiene intacto — afecta_inventario_real = false.
          </p>
          <div className="mt-5 flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
            <Button style={{ background: "#f59e0b" }} className="text-white hover:opacity-90"
              onClick={() => { const { factura } = regularizarEnBloque(nota.id, compra); onDone(factura); }}>
              Ejecutar Regularización
            </Button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
