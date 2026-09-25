"use client";

// Entrega de cilindros. Es la pantalla que van a usar los técnicos desde el
// celular, así que manda la mano gruesa y el pulgar: campos grandes, números
// que se suben y bajan con botones, y nada de escribir si se puede evitar.
//
// Registra lo que pasa en una visita (o un retiro en planta): cuántos llenos
// se dejan y cuántos vacíos se traen. NO tienen por qué coincidir — dejar 5 y
// traer 3 es una visita normal, y el saldo del cliente sube 2.
//
// Reemplaza a «Declarar salida», que registraba los mismos llenos por otra
// puerta. Cuando se dejan llenos pide quién autoriza y quién se los lleva: la
// base lo exige y antes esta pantalla no lo mandaba, así que fallaba.

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { useCarga } from "@/lib/ux/use-carga";
import { useSesion } from "@/components/auth/SesionProvider";
import {
  autorizantes, cilindrosDelCliente, gases, registrarEntrega, saldos, sugerirClientes, type LineaEntrega,
} from "@/lib/cilindros/cilindros-db";

const campo =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Contador con botones grandes: en el celular, teclear números es un estorbo. */
function Contador({ valor, onChange, etiqueta, max }: { valor: number; onChange: (n: number) => void; etiqueta: string; max?: number }) {
  const boton =
    "flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-border-strong " +
    "text-lg font-semibold text-text transition active:scale-95 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Quitar uno a ${etiqueta}`} disabled={valor <= 0}
        onClick={() => onChange(Math.max(0, valor - 1))} className={boton}>−</button>
      <input type="number" inputMode="numeric" min={0} value={valor} aria-label={etiqueta}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`${campo} w-16 text-center tabular-nums`} />
      <button type="button" aria-label={`Sumar uno a ${etiqueta}`} disabled={max !== undefined && valor >= max}
        onClick={() => onChange(valor + 1)} className={boton}>+</button>
    </div>
  );
}

const cero = (nombres: string[]) => Object.fromEntries(nombres.map((n) => [n, { gas: n, llenosEntregados: 0, vaciosRecibidos: 0 }]));

export function EntregaCilindros({ empresa, recarga, onRegistrada }: { empresa: string; recarga: number; onRegistrada: () => void }) {
  const sesion = useSesion();
  const base = useCarga(`entrega:${empresa}:${recarga}`, async () => {
    const [g, s, a] = await Promise.all([gases(empresa), saldos(empresa), autorizantes(empresa)]);
    const llenos: Record<string, number> = {};
    for (const x of s) if (x.estado === "lleno") llenos[x.gas] = x.cantidad;
    return { gases: g.map((x) => x.nombre), llenos, autorizan: a };
  });
  const lista = base.datos?.gases ?? [];
  const llenos = base.datos?.llenos ?? {};
  const autorizan = base.datos?.autorizan ?? [];

  const [cliente, setCliente] = useState("");
  const [sugeridos, setSugeridos] = useState<string[]>([]);
  const [tiene, setTiene] = useState<Record<string, number>>({});
  const [lineas, setLineas] = useState<Record<string, LineaEntrega>>({});
  const [autoriza, setAutoriza] = useState("");
  const [retira, setRetira] = useState(sesion?.nombre ?? "");
  const [documento, setDocumento] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Mientras se escribe el cliente: sugerencias y lo que ya tiene en su poder.
  useEffect(() => {
    const t = setTimeout(async () => {
      const [s, c] = await Promise.all([sugerirClientes(empresa, cliente), cilindrosDelCliente(empresa, cliente)]).catch(() => [[], {}] as [string[], Record<string, number>]);
      setSugeridos(s); setTiene(c);
    }, 300);
    return () => clearTimeout(t);
  }, [cliente, empresa]);

  const linea = (gas: string) => lineas[gas] ?? { gas, llenosEntregados: 0, vaciosRecibidos: 0 };
  const set = (gas: string, k: "llenosEntregados" | "vaciosRecibidos", n: number) =>
    setLineas((p) => ({ ...p, [gas]: { ...linea(gas), [k]: n } }));
  const total = Object.values(lineas).reduce((a, l) => a + l.llenosEntregados + l.vaciosRecibidos, 0);
  const dejaLlenos = Object.values(lineas).some((l) => l.llenosEntregados > 0);

  async function registrar() {
    setMsg(null);
    if (!cliente.trim()) return setMsg({ ok: false, texto: "Escribe el nombre del cliente." });
    if (total === 0) return setMsg({ ok: false, texto: "No has cargado ningún cilindro." });
    if (dejaLlenos && !autoriza) return setMsg({ ok: false, texto: "Elige quién autoriza que salgan los llenos." });
    if (dejaLlenos && !retira.trim()) return setMsg({ ok: false, texto: "Indica quién se lleva los cilindros." });
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await registrarEntrega(cliente, Object.values(lineas), empresa, {
        autorizadoPor: dejaLlenos ? autoriza : null, retiradoPor: dejaLlenos ? retira : null, documento,
      });
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      setMsg({ ok: true, texto: `Entrega registrada para ${cliente.trim().toUpperCase()}.${r.avisos.length ? ` ${r.avisos.join(" ")}` : ""}` });
      setCliente(""); setLineas(cero(lista)); setDocumento(""); setAutoriza("");
      onRegistrada();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SectionCard title="Registrar Entrega" description="Lo que se deja y lo que se trae en una visita, o lo que un cliente retira en planta.">
      <div className="space-y-4">
        <div>
          <label htmlFor="cil-cliente" className="mb-1.5 block text-sm font-medium text-text">Cliente</label>
          <input id="cil-cliente" list="cil-clientes" value={cliente} onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre del cliente" autoCapitalize="characters" autoComplete="off" className={campo} />
          {/* Sugerencias, no una lista cerrada: el técnico en la calle no puede
              quedar trabado porque el cliente todavía no está en el directorio. */}
          <datalist id="cil-clientes">{sugeridos.map((s) => <option key={s} value={s} />)}</datalist>
          {Object.values(tiene).some((n) => n > 0) && (
            <p className="mt-1.5 text-xs text-muted">
              Tiene en su poder: {Object.entries(tiene).filter(([, n]) => n > 0).map(([g, n]) => `${n} de ${g}`).join(" · ")}
            </p>
          )}
        </div>

        {base.error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{base.error}</p>}

        {lista.map((g) => {
          const l = linea(g);
          const hay = llenos[g] ?? 0;
          const d = l.llenosEntregados - l.vaciosRecibidos;
          return (
            <div key={g} className="rounded-2xl border border-border bg-surface-2 p-3">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-text">{g}</p>
                <p className="text-xs text-muted">
                  En planta: <b className="tabular-nums text-text">{hay}</b> lleno(s)
                  {(tiene[g] ?? 0) > 0 && <> · el cliente tiene <b className="tabular-nums text-text">{tiene[g]}</b></>}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Llenos que dejas</p>
                  <Contador valor={l.llenosEntregados} max={hay} onChange={(n) => set(g, "llenosEntregados", n)} etiqueta={`Llenos de ${g} entregados`} />
                  {l.llenosEntregados > hay && <p className="mt-1 text-xs text-danger">Solo hay {hay} en planta.</p>}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Vacíos que traes</p>
                  <Contador valor={l.vaciosRecibidos} onChange={(n) => set(g, "vaciosRecibidos", n)} etiqueta={`Vacíos de ${g} recibidos`} />
                  {l.vaciosRecibidos > (tiene[g] ?? 0) && cliente.trim().length >= 2 && (
                    <p className="mt-1 text-xs text-warn">
                      {(tiene[g] ?? 0) === 0 ? "No figura con cilindros de este gas" : `Figura con ${tiene[g]}`}: lo que traiga de más entra al parque.
                    </p>
                  )}
                </div>
              </div>
              {/* La diferencia en el momento: el técnico ve si el cliente queda
                  debiendo cilindros o devolviendo de más. */}
              {d !== 0 && (
                <p className="mt-2 text-xs text-muted">
                  {d > 0 ? `El cliente queda con ${d} cilindro(s) más de ${g}.` : `El cliente devuelve ${-d} cilindro(s) más de los que recibe.`}
                </p>
              )}
            </div>
          );
        })}

        {dejaLlenos && (
          <div className="space-y-3 rounded-2xl border border-brand/30 bg-brand/5 p-3">
            <p className="text-sm font-semibold text-text">Salida de Llenos</p>
            <p className="text-xs text-muted">Queda escrito quién autoriza y quién se los lleva: si un cilindro no vuelve, es a quien se le reclama.</p>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-text">Autoriza</span>
              <select value={autoriza} onChange={(e) => setAutoriza(e.target.value)} className={campo}>
                <option value="">Elige…</option>
                {autorizan.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              {!base.cargando && autorizan.length === 0 && (
                <span className="mt-1 block text-xs text-warn">No hay Owner ni Administrador activos en esta empresa para autorizar.</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-text">Quién se los lleva</span>
              <input value={retira} onChange={(e) => setRetira(e.target.value)} placeholder="Chofer, técnico o el cliente" className={campo} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-text">N° de nota de entrega</span>
              <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Opcional" inputMode="numeric" className={campo} />
            </label>
          </div>
        )}

        {msg && (
          <p role={msg.ok ? "status" : "alert"}
            className={`rounded-xl px-3 py-2.5 text-sm ${msg.ok ? "border border-ok/30 bg-ok/10 text-ok" : "border border-danger/30 bg-danger/10 text-danger"}`}>
            {msg.texto}
          </p>
        )}

        <button type="button" onClick={registrar} disabled={guardando}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand-strong text-base font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
          <Icon name="cylinder" size={18} />
          {guardando ? "Registrando…" : `Registrar entrega${total > 0 ? ` · ${total} cilindro(s)` : ""}`}
        </button>
      </div>
    </SectionCard>
  );
}
