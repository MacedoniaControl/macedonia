"use client";

// Asignar el vendedor externo de un cliente o de una cuenta (Owner y
// Administrador; decide comisiones).
//
//   · Cliente: sus notas nuevas van a ese vendedor. Al cambiarlo se elige si
//     también se mueven sus notas abiertas que siguen al cliente (las marcadas
//     a mano en la cuenta no se tocan).
//   · Cuenta: se marca con un vendedor o como propia, y manda sobre el cliente;
//     o vuelve a seguir al cliente.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { asignarVendedorCliente, asignarVendedorClienteNotas, asignarVendedorCuenta } from "@/lib/finanzas/cuentas-db";
import { fmtUsdCentavos } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

/** Una nota abierta del cliente, para elegir si pasa a la nueva cartera. */
export type NotaAbierta = { id: number; documento: string; emitida: string; saldo: number; vendedorExterno: string | null; vendedorFijo: boolean };

const campo = "sumi-campo";
const lbl = "mb-1 block text-xs font-medium text-muted";
const PROPIA = "__propia", OTRO = "__otro";

/** Elegir un vendedor: cartera propia, uno conocido u otro escrito. */
export function SelectorVendedor({ id, vendedores, valor, onCambio, propiaLabel = "Cartera propia", extra }: {
  id: string; vendedores: string[]; valor: string; onCambio: (v: string) => void; propiaLabel?: string;
  /** Opciones antes de las de siempre (ej.: «Según el cliente»). */
  extra?: { id: string; label: string }[];
}) {
  const fijas = [...(extra ?? []).map((e) => e.id), PROPIA, ...vendedores];
  const [otro, setOtro] = useState(!fijas.includes(valor));
  const [escrito, setEscrito] = useState(fijas.includes(valor) ? "" : valor);
  const sel = otro ? OTRO : valor;
  return (
    <div className="space-y-2">
      <select id={id} className={campo} value={sel}
        onChange={(e) => { const v = e.target.value; setOtro(v === OTRO); onCambio(v === OTRO ? escrito.trim() : v); }}>
        {extra?.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        <option value={PROPIA}>{propiaLabel}</option>
        {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
        <option value={OTRO}>Otro vendedor externo…</option>
      </select>
      {sel === OTRO && (
        <input className={campo} value={escrito} autoFocus placeholder="Nombre del vendedor externo"
          onChange={(e) => { setEscrito(e.target.value); onCambio(e.target.value); }} />
      )}
    </div>
  );
}
export const VALOR_PROPIA = PROPIA;

export function VendedorCliente({ empresa, cliente, actual, vendedores, notas, onHecho, onCerrar }: {
  empresa: string; cliente: string; actual: string | null; vendedores: string[];
  /** Sus notas abiertas. */
  notas: NotaAbierta[];
  onHecho: (texto: string) => void; onCerrar: () => void;
}) {
  const [valor, setValor] = useState(actual ?? PROPIA);
  // «siguen»: pasan las que siguen al cliente · «quedan»: ninguna · «elegir»: las marcadas en la lista.
  const [modo, setModo] = useState<"siguen" | "quedan" | "elegir">("siguen");
  const siguen = notas.filter((n) => !n.vendedorFijo);
  const [elegidas, setElegidas] = useState<Set<number>>(() => new Set(siguen.map((n) => n.id)));
  const alternar = (id: number) => setElegidas((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const totalElegido = notas.filter((n) => elegidas.has(n.id)).reduce((a, n) => a + n.saldo, 0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const nuevo = valor === PROPIA ? null : valor.trim();

  async function guardar() {
    if (valor !== PROPIA && !valor.trim()) return setError("Escribe el nombre del vendedor externo.");
    setGuardando(true); setError(null);
    try {
      const r = modo === "elegir"
        ? await asignarVendedorClienteNotas(empresa, cliente, nuevo, [...elegidas])
        : await asignarVendedorCliente(empresa, cliente, nuevo, modo === "siguen");
      if (!r.ok) return setError(r.error);
      onHecho(`${cliente}: ${nuevo ? `cliente de ${nuevo}` : "cartera propia"}.${r.movidas ? ` ${r.movidas} nota(s) abiertas pasaron a ${nuevo ?? "la cartera propia"}.` : ""}`);
      onCerrar();
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Hoy: <b className="text-text">{actual ?? "cartera propia"}</b>. Las notas nuevas de {cliente} van a la cartera que elijas.
      </p>
      <label className="block">
        <span className={lbl}>Vendedor del cliente</span>
        <SelectorVendedor id="vc-sel" vendedores={vendedores} valor={valor} onCambio={setValor} />
      </label>
      {notas.length > 0 && (
        <fieldset className="space-y-1.5 rounded-xl border border-border p-3 text-sm">
          <legend className="px-1 text-xs font-medium text-muted">Sus {notas.length} nota(s) abiertas</legend>
          <label className="flex items-center gap-2"><input type="radio" name="vc-modo" checked={modo === "siguen"} onChange={() => setModo("siguen")} />
            Pasan a la nueva cartera{siguen.length < notas.length ? ` las ${siguen.length} que siguen al cliente` : ""}</label>
          <label className="flex items-center gap-2"><input type="radio" name="vc-modo" checked={modo === "quedan"} onChange={() => setModo("quedan")} />
            Se quedan donde están; solo cambian las nuevas</label>
          <label className="flex items-center gap-2"><input type="radio" name="vc-modo" checked={modo === "elegir"} onChange={() => setModo("elegir")} />
            Elegir cuáles pasan</label>
          {modo === "elegir" ? (
            <div className="mt-2 rounded-lg border border-border">
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-xs">
                <span className="text-muted">{elegidas.size} de {notas.length} · <b className="tabular-nums text-text">{fmtUsdCentavos(totalElegido)}</b></span>
                <span className="flex gap-2">
                  <button type="button" className="text-brand hover:underline" onClick={() => setElegidas(new Set(notas.map((n) => n.id)))}>Todas</button>
                  <button type="button" className="text-muted hover:underline" onClick={() => setElegidas(new Set())}>Ninguna</button>
                </span>
              </div>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                {notas.map((n) => (
                  <li key={n.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-xs hover:bg-surface-2">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={elegidas.has(n.id)} onChange={() => alternar(n.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-text">{n.documento}</span>
                        <span className="block text-muted">{fechaVista(n.emitida)} · hoy en {n.vendedorExterno ?? "cartera propia"}{n.vendedorFijo ? " (marcada)" : ""}</span>
                      </span>
                      <span className="tabular-nums text-text">{fmtUsdCentavos(n.saldo)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted">Las que no marques se quedan donde están.</p>
            </div>
          ) : (
            <p className="text-xs text-muted">Las notas marcadas a mano con otro vendedor o como propias no se tocan.</p>
          )}
        </fieldset>
      )}
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button icon="check" className="flex-1" cargando={guardando} textoCargando="Guardando…" onClick={guardar}>Guardar</Button>
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}

const SEGUIR = "__seguir";

export function VendedorCuenta({ cuentaId, documento, actual, fija, delCliente, vendedores, onHecho, onCerrar }: {
  cuentaId: number; documento: string; actual: string | null; fija: boolean; delCliente: string | null; vendedores: string[];
  onHecho: (texto: string) => void; onCerrar: () => void;
}) {
  const [valor, setValor] = useState(fija ? (actual ?? PROPIA) : SEGUIR);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (valor !== PROPIA && valor !== SEGUIR && !valor.trim()) return setError("Escribe el nombre del vendedor externo.");
    setGuardando(true); setError(null);
    try {
      const r = await asignarVendedorCuenta(cuentaId, valor === PROPIA || valor === SEGUIR ? null : valor.trim(), valor === SEGUIR);
      if (!r.ok) return setError(r.error);
      onHecho(`${documento}: ${r.vendedor ? `cartera de ${r.vendedor}` : "cartera propia"}${valor === SEGUIR ? " (sigue al cliente)" : ""}.`);
      onCerrar();
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {documento} está en <b className="text-text">{actual ?? "cartera propia"}</b>{fija ? ", marcada en la cuenta" : ", siguiendo al cliente"}.
        Lo que marques aquí manda sobre el vendedor del cliente.
      </p>
      <label className="block">
        <span className={lbl}>Vendedor de esta cuenta</span>
        <SelectorVendedor id="vcu-sel" vendedores={vendedores} valor={valor} onCambio={setValor}
          extra={[{ id: SEGUIR, label: `Seguir al cliente (${delCliente ?? "cartera propia"})` }]} />
      </label>
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button icon="check" className="flex-1" cargando={guardando} textoCargando="Guardando…" onClick={guardar}>Guardar</Button>
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}
