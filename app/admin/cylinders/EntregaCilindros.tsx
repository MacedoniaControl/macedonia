"use client";

// Entrega de cilindros. Es la pantalla que van a usar seis técnicos desde el
// celular, así que manda la mano gruesa y el pulgar: campos grandes, números
// que se suben y bajan con botones, y nada de escribir si se puede evitar.
//
// Registra lo que pasa en una visita: cuántos llenos se dejan y cuántos vacíos
// se traen. NO tienen por qué coincidir — dejar 5 y traer 3 es una visita
// normal, y el saldo del cliente sube 2.

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { gases, registrarEntrega, type Gas, type LineaEntrega } from "@/lib/cilindros/cilindros-db";

const campo =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Contador con botones grandes: en el celular, teclear números es un estorbo. */
function Contador({
  valor,
  onChange,
  etiqueta,
}: {
  valor: number;
  onChange: (n: number) => void;
  etiqueta: string;
}) {
  const boton =
    "flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-border-strong " +
    "text-lg font-semibold text-text transition active:scale-95 disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Quitar uno a ${etiqueta}`}
        disabled={valor <= 0}
        onClick={() => onChange(Math.max(0, valor - 1))}
        className={boton}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={valor}
        aria-label={etiqueta}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`${campo} w-16 text-center tabular-nums`}
      />
      <button
        type="button"
        aria-label={`Sumar uno a ${etiqueta}`}
        onClick={() => onChange(valor + 1)}
        className={boton}
      >
        +
      </button>
    </div>
  );
}

export function EntregaCilindros({
  empresa,
  onRegistrada,
}: {
  empresa: string;
  onRegistrada: () => void;
}) {
  const [lista, setLista] = useState<Gas[]>([]);
  const [cliente, setCliente] = useState("");
  const [lineas, setLineas] = useState<Record<string, LineaEntrega>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    gases(empresa)
      .then((g) => {
        if (!vigente) return;
        setLista(g);
        setLineas(Object.fromEntries(
          g.map((x) => [x.nombre, { gas: x.nombre, llenosEntregados: 0, vaciosRecibidos: 0 }]),
        ));
      })
      .catch((e) => { if (vigente) setMsg({ ok: false, texto: (e as Error).message }); });
    return () => { vigente = false; };
  }, [empresa]);

  const set = (gas: string, campo: "llenosEntregados" | "vaciosRecibidos", n: number) =>
    setLineas((p) => ({ ...p, [gas]: { ...p[gas], [campo]: n } }));

  const total = Object.values(lineas).reduce(
    (a, l) => a + l.llenosEntregados + l.vaciosRecibidos, 0,
  );

  async function registrar() {
    setMsg(null);
    if (!cliente.trim()) return setMsg({ ok: false, texto: "Escribe el nombre del cliente." });
    if (total === 0) return setMsg({ ok: false, texto: "No has cargado ningún cilindro." });
    if (guardando) return;

    setGuardando(true);
    try {
      const r = await registrarEntrega(cliente, Object.values(lineas), empresa);
      if (!r.ok) return setMsg({ ok: false, texto: r.error });

      setMsg({ ok: true, texto: `Entrega registrada para ${cliente.trim()}.` });
      setCliente("");
      setLineas(Object.fromEntries(
        lista.map((x) => [x.nombre, { gas: x.nombre, llenosEntregados: 0, vaciosRecibidos: 0 }]),
      ));
      onRegistrada();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SectionCard
      title="Registrar entrega"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="cil-cliente" className="mb-1.5 block text-sm font-medium text-text">
            Cliente
          </label>
          <input
            id="cil-cliente"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre del cliente"
            autoCapitalize="characters"
            className={campo}
          />
        </div>

        {lista.map((g) => (
          <div key={g.nombre} className="rounded-2xl border border-border bg-surface-2 p-3">
            <p className="mb-2.5 text-sm font-semibold text-text">{g.nombre}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Llenos que dejas
                </p>
                <Contador
                  valor={lineas[g.nombre]?.llenosEntregados ?? 0}
                  onChange={(n) => set(g.nombre, "llenosEntregados", n)}
                  etiqueta={`Llenos de ${g.nombre} entregados`}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Vacíos que traes
                </p>
                <Contador
                  valor={lineas[g.nombre]?.vaciosRecibidos ?? 0}
                  onChange={(n) => set(g.nombre, "vaciosRecibidos", n)}
                  etiqueta={`Vacíos de ${g.nombre} recibidos`}
                />
              </div>
            </div>

            {/* La diferencia se muestra en el momento: el técnico ve en el acto
                si el cliente queda debiendo cilindros o devolviendo de más. */}
            {(() => {
              const d = (lineas[g.nombre]?.llenosEntregados ?? 0) - (lineas[g.nombre]?.vaciosRecibidos ?? 0);
              if (d === 0) return null;
              return (
                <p className="mt-2 text-xs text-muted">
                  {d > 0
                    ? `El cliente queda con ${d} cilindro(s) más de ${g.nombre}.`
                    : `El cliente devuelve ${-d} cilindro(s) más de los que recibe.`}
                </p>
              );
            })()}
          </div>
        ))}

        {msg && (
          <p
            role={msg.ok ? "status" : "alert"}
            className={`rounded-xl px-3 py-2.5 text-sm ${
              msg.ok
                ? "border border-ok/30 bg-ok/10 text-ok"
                : "border border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {msg.texto}
          </p>
        )}

        <button
          type="button"
          onClick={registrar}
          disabled={guardando}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand-strong
                     text-base font-semibold text-white transition active:scale-[0.99]
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="cylinder" size={18} />
          {guardando ? "Registrando…" : `Registrar entrega${total > 0 ? ` · ${total} cilindro(s)` : ""}`}
        </button>
      </div>
    </SectionCard>
  );
}
