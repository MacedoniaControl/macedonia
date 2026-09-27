"use client";

// Vive dentro de Parque. Cambiar de estado dentro del almacén (llenado, daño,
// reparación) y dar de alta cilindros nuevos. Los gases también se manejan
// aquí: un gas nuevo entra con sus primeros cilindros («+ Gas nuevo…») y un
// gas sin cilindros se puede quitar. Antes era un botón aparte, «Gases y
// depósitos», que hacía lo mismo por otra puerta. Cambiar de estado lo hace cualquiera que opere cilindros;
// dar de alta es de la gerencia (Owner y Administrador): son activos que entran,
// como una compra, y la base del servidor lo vuelve a comprobar.

import { useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { SectionCard } from "@/components/ui/SectionCard";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  activarGas, cambiarEstado, desactivarGas, gases, ingresarCilindros, saldos,
  type EstadoCilindro,
} from "@/lib/cilindros/cilindros-db";

const campo =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Valor del selector para «+ Gas nuevo…»: ningún gas se llama así. */
const NUEVO = "__nuevo__";

const ESTADOS: { id: EstadoCilindro; label: string }[] = [
  { id: "lleno", label: "Lleno" },
  { id: "vacio", label: "Vacío" },
  { id: "en_llenado", label: "En llenado" },
  { id: "fuera_servicio", label: "Fuera de servicio" },
];

export function AltaCilindros({
  empresa,
  gerencia,
  recarga,
  onRegistrada,
}: {
  empresa: string;
  gerencia: boolean;
  recarga: number;
  onRegistrada: () => void;
}) {
  const g = useCarga(`gases:${empresa}:${recarga}`, () => gases(empresa));
  const lista = g.datos ?? [];
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Alta. Sin elegir, el primer gas de la lista.
  const [gasAltaElegido, setGasAlta] = useState("");
  const gasAlta = gasAltaElegido || lista[0]?.nombre || "";
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [cantAlta, setCantAlta] = useState(0);
  const [estadoAlta, setEstadoAlta] = useState<"lleno" | "vacio">("lleno");

  // Cambio de estado
  const [gasMovElegido, setGasMov] = useState("");
  const gasMov = gasMovElegido || lista[0]?.nombre || "";
  const [cantMov, setCantMov] = useState(0);
  const [desde, setDesde] = useState<EstadoCilindro>("vacio");
  const [hacia, setHacia] = useState<EstadoCilindro>("lleno");
  const [notaMov, setNotaMov] = useState("");
  // Cuántos hay en cada estado, para no mover más de los que existen.
  const s = useCarga(`estados:${empresa}:${recarga}`, () => saldos(empresa));
  const hay = (gas: string, estado: EstadoCilindro) => (s.datos ?? []).find((x) => x.gas === gas && x.estado === estado)?.cantidad ?? 0;

  // Gases activos que ya no tienen ni un cilindro: son los únicos que se pueden quitar.
  const sinCilindros = s.datos
    ? lista.filter((x) => (s.datos ?? []).filter((y) => y.gas === x.nombre).reduce((a, y) => a + y.cantidad, 0) === 0)
    : [];

  async function darAlta() {
    setMsg(null);
    if (cantAlta <= 0) return setMsg({ ok: false, texto: "La cantidad debe ser mayor que cero." });
    const esNuevo = gasAlta === NUEVO;
    if (esNuevo && !nombreNuevo.trim()) return setMsg({ ok: false, texto: "Escribe el nombre del gas nuevo." });
    setGuardando(true);
    try {
      let gas = gasAlta;
      if (esNuevo) {
        const a = await activarGas(nombreNuevo, empresa);
        if (!a.ok) return setMsg({ ok: false, texto: a.error });
        gas = a.nombre;
      }
      const r = await ingresarCilindros(gas, cantAlta, estadoAlta, empresa);
      if (!r.ok) {
        if (esNuevo) { setGasAlta(gas); setNombreNuevo(""); onRegistrada(); }
        return setMsg({ ok: false, texto: `${r.error ?? "No se pudo dar de alta."}${esNuevo ? ` El gas ${gas} quedó agregado, sin cilindros.` : ""}` });
      }
      setMsg({ ok: true, texto: `${cantAlta} cilindro(s) de ${gas} agregados al parque.${esNuevo ? " Gas nuevo en la lista." : ""}` });
      setCantAlta(0);
      if (esNuevo) { setGasAlta(gas); setNombreNuevo(""); }
      onRegistrada();
    } finally {
      setGuardando(false);
    }
  }

  async function mover() {
    setMsg(null);
    if (cantMov <= 0) return setMsg({ ok: false, texto: "La cantidad debe ser mayor que cero." });
    if (desde === hacia) return setMsg({ ok: false, texto: "El estado de origen y destino son el mismo." });
    setGuardando(true);
    try {
      const r = await cambiarEstado(gasMov, cantMov, desde, hacia, empresa, notaMov);
      if (!r.ok) return setMsg({ ok: false, texto: r.error ?? "No se pudo mover." });
      setMsg({ ok: true, texto: `${cantMov} cilindro(s) de ${gasMov} pasaron a «${ESTADOS.find((e) => e.id === hacia)?.label.toLowerCase()}».` });
      setCantMov(0); setNotaMov("");
      onRegistrada();
    } finally {
      setGuardando(false);
    }
  }

  const selGas = (v: string, set: (s: string) => void, id: string) => (
    <select id={id} value={v} onChange={(e) => set(e.target.value)} className={campo}>
      {lista.map((g) => <option key={g.nombre} value={g.nombre}>{g.nombre}</option>)}
    </select>
  );

  return (
    <div className={`grid grid-cols-1 gap-4 ${gerencia ? "lg:grid-cols-2" : ""}`}>
      <SectionCard title="Cambiar de Estado" description="Llenado en planta, daños y reparaciones. No cambia el total del parque.">
        <div className="space-y-3">
          <div>
            <label htmlFor="mov-gas" className="mb-1.5 block text-sm font-medium text-text">Gas</label>
            {selGas(gasMov, setGasMov, "mov-gas")}
          </div>
          <div>
            <label htmlFor="mov-cant" className="mb-1.5 block text-sm font-medium text-text">Cantidad</label>
            <CampoNumero id="mov-cant" valor={cantMov} onChange={setCantMov} className={campo} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mov-desde" className="mb-1.5 block text-sm font-medium text-text">De</label>
              <select id="mov-desde" value={desde}
                onChange={(e) => setDesde(e.target.value as EstadoCilindro)} className={campo}>
                {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mov-hacia" className="mb-1.5 block text-sm font-medium text-text">A</label>
              <select id="mov-hacia" value={hacia}
                onChange={(e) => setHacia(e.target.value as EstadoCilindro)} className={campo}>
                {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">
            Hay <b className="tabular-nums text-text">{hay(gasMov, desde)}</b> de {gasMov || "este gas"} en «{ESTADOS.find((e) => e.id === desde)?.label.toLowerCase()}».
            {cantMov > hay(gasMov, desde) && <span className="text-danger"> No alcanza para mover {cantMov}.</span>}
          </p>
          <div>
            <label htmlFor="mov-nota" className="mb-1.5 block text-sm font-medium text-text">Motivo</label>
            <input id="mov-nota" value={notaMov} onChange={(e) => setNotaMov(e.target.value)}
              placeholder={hacia === "fuera_servicio" ? "Qué daño tiene" : "Opcional"} className={campo} />
          </div>
          <button type="button" onClick={mover} disabled={guardando}
            className="h-12 w-full rounded-xl border border-border-strong text-sm font-semibold text-text
                       transition disabled:cursor-not-allowed disabled:opacity-60">
            {guardando ? "Guardando…" : "Registrar cambio"}
          </button>
        </div>
      </SectionCard>

      {gerencia && (
      <SectionCard title="Dar de Alta" description="Cilindros nuevos que entran al parque: suman al total.">
        <div className="space-y-3">
          <div>
            <label htmlFor="alta-gas" className="mb-1.5 block text-sm font-medium text-text">Gas</label>
            <select id="alta-gas" value={gasAlta} onChange={(e) => setGasAlta(e.target.value)} className={campo}>
              {lista.map((x) => <option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}
              <option value={NUEVO}>+ Gas nuevo…</option>
            </select>
          </div>
          {gasAlta === NUEVO && (
            <div>
              <label htmlFor="alta-nuevo" className="mb-1.5 block text-sm font-medium text-text">Nombre del gas nuevo</label>
              <input id="alta-nuevo" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="HELIO, ACETILENO 8K…" autoCapitalize="characters" autoComplete="off" className={campo} />
            </div>
          )}
          <div>
            <label htmlFor="alta-cant" className="mb-1.5 block text-sm font-medium text-text">Cantidad</label>
            <CampoNumero id="alta-cant" valor={cantAlta} onChange={setCantAlta} className={campo} />
          </div>
          <div>
            <label htmlFor="alta-estado" className="mb-1.5 block text-sm font-medium text-text">Entran</label>
            <select id="alta-estado" value={estadoAlta}
              onChange={(e) => setEstadoAlta(e.target.value as "lleno" | "vacio")} className={campo}>
              <option value="lleno">Llenos</option>
              <option value="vacio">Vacíos</option>
            </select>
          </div>
          <button type="button" onClick={darAlta} disabled={guardando}
            className="h-12 w-full rounded-xl bg-brand-strong text-sm font-semibold text-white
                       transition disabled:cursor-not-allowed disabled:opacity-60">
            {guardando ? "Guardando…" : "Dar de alta"}
          </button>

          {/* Quitar un gas: solo los que no tienen cilindros. Con cilindros
              desaparecería de las listas y sus cilindros seguirían contando. */}
          {sinCilindros.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted">Gases sin cilindros. Si ya no los manejan, quítalos de las listas:</p>
              <div className="flex flex-wrap gap-2">
                {sinCilindros.map((x) => (
                  <ConfirmDialog key={x.nombre}
                    title={`¿Quitar ${x.nombre}?`}
                    message="Deja de aparecer en Entrega, Rampa y Parque. Su historial se conserva. Para volver a usarlo, dale de alta con «+ Gas nuevo…» y el mismo nombre."
                    confirmLabel="Sí, quitar" cancelLabel="No"
                    onConfirm={async () => {
                      setMsg(null);
                      const r = await desactivarGas(x.nombre, empresa);
                      if (!r.ok) return setMsg({ ok: false, texto: r.error ?? "No se pudo quitar." });
                      setMsg({ ok: true, texto: `${x.nombre} ya no aparece en las listas.` });
                      if (gasAlta === x.nombre) setGasAlta("");
                      if (gasMov === x.nombre) setGasMov("");
                      onRegistrada();
                    }}
                    trigger={(abrir) => (
                      <button type="button" onClick={abrir}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm text-text hover:border-danger/40 hover:text-danger">
                        {x.nombre} <span aria-hidden>✕</span><span className="sr-only">Quitar</span>
                      </button>
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>
      )}


      {g.error && !msg && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger lg:col-span-2">{g.error}</p>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"}
          className={`rounded-xl px-3 py-2.5 text-sm lg:col-span-2 ${
            msg.ok ? "border border-ok/30 bg-ok/10 text-ok" : "border border-danger/30 bg-danger/10 text-danger"
          }`}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
