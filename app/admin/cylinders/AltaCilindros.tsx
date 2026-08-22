"use client";

// Dar de alta cilindros al parque, y moverlos de estado dentro del almacén
// (llenado, baja por daño). No es lo que hace el técnico a diario: esto lo usa
// quien administra el parque, cuando llegan cilindros nuevos o se da de baja uno.

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  gases, ingresarCilindros, cambiarEstado,
  type Gas, type EstadoCilindro,
} from "@/lib/cilindros/cilindros-db";

const campo =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

const ESTADOS: { id: EstadoCilindro; label: string }[] = [
  { id: "lleno", label: "Lleno" },
  { id: "vacio", label: "Vacío" },
  { id: "en_llenado", label: "En llenado" },
  { id: "fuera_servicio", label: "Fuera de servicio" },
];

export function AltaCilindros({
  empresa,
  onRegistrada,
}: {
  empresa: string;
  onRegistrada: () => void;
}) {
  const [lista, setLista] = useState<Gas[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Alta
  const [gasAlta, setGasAlta] = useState("");
  const [cantAlta, setCantAlta] = useState(0);
  const [estadoAlta, setEstadoAlta] = useState<"lleno" | "vacio">("lleno");

  // Cambio de estado
  const [gasMov, setGasMov] = useState("");
  const [cantMov, setCantMov] = useState(0);
  const [desde, setDesde] = useState<EstadoCilindro>("vacio");
  const [hacia, setHacia] = useState<EstadoCilindro>("lleno");

  useEffect(() => {
    let vigente = true;
    gases(empresa)
      .then((g) => {
        if (!vigente) return;
        setLista(g);
        if (g[0]) { setGasAlta(g[0].nombre); setGasMov(g[0].nombre); }
      })
      .catch((e) => { if (vigente) setMsg({ ok: false, texto: (e as Error).message }); });
    return () => { vigente = false; };
  }, [empresa]);

  async function darAlta() {
    setMsg(null);
    if (cantAlta <= 0) return setMsg({ ok: false, texto: "La cantidad debe ser mayor que cero." });
    setGuardando(true);
    try {
      const r = await ingresarCilindros(gasAlta, cantAlta, estadoAlta, empresa);
      if (!r.ok) return setMsg({ ok: false, texto: r.error ?? "No se pudo dar de alta." });
      setMsg({ ok: true, texto: `${cantAlta} cilindro(s) de ${gasAlta} agregados al parque.` });
      setCantAlta(0);
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
      const r = await cambiarEstado(gasMov, cantMov, desde, hacia, empresa);
      if (!r.ok) return setMsg({ ok: false, texto: r.error ?? "No se pudo mover." });
      setMsg({ ok: true, texto: `${cantMov} cilindro(s) de ${gasMov} pasaron a ${hacia.replace("_", " ")}.` });
      setCantMov(0);
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
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Dar de alta" description="Cilindros nuevos que entran al parque.">
        <div className="space-y-3">
          <div>
            <label htmlFor="alta-gas" className="mb-1.5 block text-sm font-medium text-text">Gas</label>
            {selGas(gasAlta, setGasAlta, "alta-gas")}
          </div>
          <div>
            <label htmlFor="alta-cant" className="mb-1.5 block text-sm font-medium text-text">Cantidad</label>
            <input id="alta-cant" type="number" inputMode="numeric" min={0} value={cantAlta}
              onChange={(e) => setCantAlta(Math.max(0, Number(e.target.value) || 0))}
              className={`${campo} tabular-nums`} />
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
        </div>
      </SectionCard>

      <SectionCard title="Cambiar de estado" description="Llenado en planta, baja por daño, corrección.">
        <div className="space-y-3">
          <div>
            <label htmlFor="mov-gas" className="mb-1.5 block text-sm font-medium text-text">Gas</label>
            {selGas(gasMov, setGasMov, "mov-gas")}
          </div>
          <div>
            <label htmlFor="mov-cant" className="mb-1.5 block text-sm font-medium text-text">Cantidad</label>
            <input id="mov-cant" type="number" inputMode="numeric" min={0} value={cantMov}
              onChange={(e) => setCantMov(Math.max(0, Number(e.target.value) || 0))}
              className={`${campo} tabular-nums`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          <button type="button" onClick={mover} disabled={guardando}
            className="h-12 w-full rounded-xl border border-border-strong text-sm font-semibold text-text
                       transition disabled:cursor-not-allowed disabled:opacity-60">
            {guardando ? "Guardando…" : "Registrar cambio"}
          </button>
        </div>
      </SectionCard>

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
