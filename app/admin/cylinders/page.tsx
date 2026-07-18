"use client";

import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { useNotifications, addNotif, updateNotif, type Notif } from "@/lib/ux/notifications";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";

type EstadosGas = { lleno: number; vacio: number; enCliente: number; pendiente: number };
type Inventario = Record<string, EstadosGas>;
type Mov = { id: number; hora: string; gas: string; op: string; detalle: string; nota: string; tone: Tone };

const GASES_BASE = ["Oxígeno", "Argón", "Nitrógeno", "Argomix", "CO2", "UAP", "Acetileno"];
const INV_BASE: Inventario = {
  Oxígeno: { lleno: 24, vacio: 12, enCliente: 6, pendiente: 3 },
  Argón: { lleno: 10, vacio: 7, enCliente: 3, pendiente: 2 },
  Nitrógeno: { lleno: 8, vacio: 5, enCliente: 2, pendiente: 1 },
  Argomix: { lleno: 6, vacio: 4, enCliente: 1, pendiente: 1 },
  CO2: { lleno: 7, vacio: 6, enCliente: 1, pendiente: 1 },
  UAP: { lleno: 5, vacio: 2, enCliente: 1, pendiente: 0 },
  Acetileno: { lleno: 9, vacio: 6, enCliente: 2, pendiente: 1 },
};

const CAPS = ["6 M³", "9 M³", "10 M³", "1 M³"];
const OPS: Record<string, string> = {
  intercambio: "Intercambio directo (entra vacío, sale lleno)",
  entrega: "Entrega sin retorno (sale lleno)",
  recarga: "Recarga (vacío → lleno)",
  retorno: "Retorno de cliente (vuelve vacío)",
  recepcion: "Recepción de cilindro de cliente",
};
const AUTORIZADORES = [
  { u: "owner", n: "Owner Demo (OWNER)" },
  { u: "admin", n: "Admin Demo (ADMIN)" },
];
const ESTADOS: { key: keyof EstadosGas; label: string; tone: Tone }[] = [
  { key: "lleno", label: "Lleno", tone: "ok" },
  { key: "vacio", label: "Vacío", tone: "muted" },
  { key: "enCliente", label: "En cliente", tone: "info" },
  { key: "pendiente", label: "Pendiente", tone: "warn" },
];

const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";
const labelCls = "mb-1 block text-xs font-medium text-muted";
const empty: EstadosGas = { lleno: 0, vacio: 0, enCliente: 0, pendiente: 0 };

// Aplica una operación a un estado de gas. Devuelve null si no es factible.
function aplicar(e: EstadosGas, op: string, q: number): { e: EstadosGas; nota: string; tone: Tone } | null {
  const n = { ...e };
  if (op === "intercambio") {
    if (n.lleno < q) return null;
    n.lleno -= q; n.vacio += q;
    return { e: n, nota: "Entró vacío, salió lleno. Se cobra recarga.", tone: "ok" };
  }
  if (op === "entrega") {
    if (n.lleno < q) return null;
    n.lleno -= q; n.pendiente += q;
    return { e: n, nota: "Salió lleno sin retorno. Queda pendiente por retorno.", tone: "warn" };
  }
  if (op === "recarga") {
    if (n.vacio < q) return null;
    n.vacio -= q; n.lleno += q;
    return { e: n, nota: "Recargado: vacío → lleno.", tone: "ok" };
  }
  if (op === "retorno") {
    if (n.pendiente < q) return null;
    n.pendiente -= q; n.vacio += q;
    return { e: n, nota: "Cliente devolvió vacío. Pendiente saldado.", tone: "info" };
  }
  n.enCliente += q;
  return { e: n, nota: "Recepción de cilindro de cliente. No aumenta stock propio.", tone: "info" };
}

export default function CylindersPage() {
  const [gases, setGases] = usePersistedState<string[]>("cyl:gases", GASES_BASE);
  const [inv, setInv] = usePersistedState<Inventario>("cyl:inv", INV_BASE);
  const [movs, setMovs] = usePersistedState<Mov[]>("cyl:movs", []);
  const notifs = useNotifications();

  const [gas, setGas] = useState(GASES_BASE[0]);
  const [op, setOp] = useState("intercambio");
  const [cap, setCap] = useState(CAPS[0]);
  const [cant, setCant] = useState(1);
  const [cliente, setCliente] = useState("");
  const [autoriza, setAutoriza] = useState(AUTORIZADORES[0].u);
  const [msg, setMsg] = useState("");
  const [nuevoGas, setNuevoGas] = useState("");
  const [gasMsg, setGasMsg] = useState("");

  const est = (g: string): EstadosGas => inv[g] ?? empty;
  const totalPendiente = gases.reduce((a, g) => a + est(g).pendiente, 0);
  const pendientesAutorizacion = notifs.filter((n) => n.tipo === "cilindro" && n.estado === "pendiente");

  // Aplica al inventario las autorizaciones aprobadas que aún no se han aplicado.
  useEffect(() => {
    const aprobadas = notifs.filter((n) => n.tipo === "cilindro" && n.estado === "aprobada" && !n.applied);
    if (aprobadas.length === 0) return;
    aprobadas.forEach((n) => {
      const p = n.payload as { gas: string; op: string; cap: string; cant: number; cliente?: string; autoriza: string };
      updateNotif(n.id, { applied: true }); // marca primero para evitar doble aplicación
      setInv((prev) => {
        const r = aplicar(prev[p.gas] ?? empty, p.op, p.cant);
        if (!r) {
          setMovs((m) => [{ id: Date.now() + Math.random(), hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }), gas: p.gas, op: "No aplicado", detalle: `${p.cant} × ${p.gas} ${p.cap}`, nota: "Aprobado pero sin stock suficiente al momento.", tone: "danger" }, ...m]);
          return prev;
        }
        setMovs((m) => [{ id: Date.now() + Math.random(), hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }), gas: p.gas, op: OPS[p.op].split(" (")[0], detalle: `${p.cant} × ${p.gas} ${p.cap}${p.cliente ? ` · ${p.cliente}` : ""}`, nota: `${r.nota} Autorizado por ${p.autoriza}.`, tone: r.tone }, ...m]);
        return { ...prev, [p.gas]: r.e };
      });
    });
  }, [notifs, setInv, setMovs]);

  function agregarGas() {
    setGasMsg("");
    const n = nuevoGas.trim();
    if (!n) return setGasMsg("ERR:Escribe el nombre del gas.");
    if (gases.some((g) => g.toLowerCase() === n.toLowerCase())) return setGasMsg("ERR:Ese gas ya existe.");
    setGases((prev) => [...prev, n]);
    setInv((prev) => ({ ...prev, [n]: { ...empty } }));
    setGasMsg(`Gas "${n}" agregado.`);
    setNuevoGas("");
  }

  function solicitar() {
    setMsg("");
    const q = Number(cant);
    if (!q || q < 1) return setMsg("ERR:La cantidad debe ser al menos 1.");
    if (!aplicar(est(gas), op, q)) return setMsg(`ERR:No hay suficiente stock de ${gas} para esta operación.`);
    const aut = AUTORIZADORES.find((a) => a.u === autoriza)!;
    const notif: Notif = {
      id: `${Date.now()}`,
      tipo: "cilindro",
      titulo: "Autorización de movimiento de cilindros",
      mensaje: `${OPS[op].split(" (")[0]} · ${q} × ${gas} ${cap}${cliente ? ` · ${cliente}` : ""}`,
      para: aut.n,
      estado: "pendiente",
      hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
      payload: { gas, op, cap, cant: q, cliente, autoriza: aut.n },
    };
    addNotif(notif);
    setMsg(`Solicitud enviada a ${aut.n}. Debe aprobarla desde la campana de notificaciones o el panel de pendientes.`);
    setCant(1); setCliente("");
  }

  return (
    <>
      <PageHeader
        title="Cilindros y recargas"
        description="Inventario por tipo de gas y estado. Los movimientos requieren autorización de un OWNER/ADMIN."
        breadcrumbs={[{ label: "Inventario" }, { label: "Cilindros y recargas" }]}
        actions={<StatusBadge tone="brand">{gases.length} gases</StatusBadge>}
      />

      {totalPendiente > 0 && (
        <div className="mb-4">
          <AlertCard tone="warn" titulo="Cilindros pendientes por retorno"
            mensaje={`Hay ${totalPendiente} cilindro(s) entregados sin vacío de vuelta (todos los gases).`} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {gases.map((g) => {
          const e = est(g);
          const total = e.lleno + e.vacio + e.enCliente + e.pendiente;
          return (
            <SectionCard key={g} title={g} description={`${total} cilindros en total`}
              action={e.pendiente > 0 ? <StatusBadge tone="warn">{e.pendiente} pend.</StatusBadge> : <StatusBadge tone="ok">al día</StatusBadge>}>
              <div className="grid grid-cols-4 gap-2">
                {ESTADOS.map((s) => (
                  <div key={s.key} className="rounded-lg border border-border-strong bg-surface-2 p-2 text-center">
                    <p className="text-xl font-semibold text-text">{e[s.key]}</p>
                    <p className={`mt-0.5 text-[10px] font-medium ${s.tone === "ok" ? "text-ok" : s.tone === "warn" ? "text-warn" : s.tone === "info" ? "text-info" : "text-muted"}`}>{s.label}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setGas(g); document.getElementById("mov-form")?.scrollIntoView({ behavior: "smooth" }); }}
                className="mt-3 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-brand hover:bg-brand-soft">
                Registrar movimiento de {g}
              </button>
            </SectionCard>
          );
        })}

        <SectionCard title="Agregar gas" description="Suma un tipo de gas nuevo al inventario.">
          <div className="space-y-2">
            <input className={inputClass} value={nuevoGas} placeholder="Ej: Helio, mezcla especial…" onChange={(e) => setNuevoGas(e.target.value)} />
            {gasMsg && <p className={`rounded-lg px-2 py-1 text-xs ${gasMsg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{gasMsg.replace("ERR:", "")}</p>}
            <Button icon="plus" onClick={agregarGas} className="w-full">Agregar gas</Button>
          </div>
        </SectionCard>
      </div>

      {pendientesAutorizacion.length > 0 && (
        <div className="mt-6">
          <SectionCard title="Pendientes de autorización" description="El OWNER/ADMIN asignado aprueba o rechaza; al aprobar se aplica al inventario."
            action={<StatusBadge tone="warn">{pendientesAutorizacion.length}</StatusBadge>}>
            <ul className="space-y-2">
              {pendientesAutorizacion.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-strong bg-surface-2 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-text">{n.mensaje}</span>
                    <span className="block text-xs text-muted">Autoriza: {n.para} · {n.hora}</span>
                  </span>
                  <span className="flex gap-2">
                    <Button variant="secondary" icon="check" onClick={() => updateNotif(n.id, { estado: "aprobada" })}>Aprobar</Button>
                    <Button variant="ghost" onClick={() => updateNotif(n.id, { estado: "rechazada" })}>Rechazar</Button>
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}

      <div id="mov-form" className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <SectionCard title="Registrar movimiento" description="Requiere autorización de un OWNER/ADMIN.">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="gas">Gas</label>
                <select id="gas" className={inputClass} value={gas} onChange={(e) => setGas(e.target.value)}>
                  {gases.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="cap">Capacidad</label>
                <select id="cap" className={inputClass} value={cap} onChange={(e) => setCap(e.target.value)}>
                  {CAPS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="op">Operación</label>
              <select id="op" className={inputClass} value={op} onChange={(e) => setOp(e.target.value)}>
                {Object.entries(OPS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="cant">Cantidad</label>
                <input id="cant" type="number" min={1} className={inputClass} value={cant} onChange={(e) => setCant(Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cli">Cliente (opcional)</label>
                <input id="cli" className={inputClass} value={cliente} placeholder="Nombre" onChange={(e) => setCliente(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="aut">Autoriza (OWNER/ADMIN)</label>
              <select id="aut" className={inputClass} value={autoriza} onChange={(e) => setAutoriza(e.target.value)}>
                {AUTORIZADORES.map((a) => <option key={a.u} value={a.u}>{a.n}</option>)}
              </select>
            </div>
            {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="bell" onClick={solicitar} className="w-full">Solicitar autorización</Button>
          </div>
        </SectionCard>

        <SectionCard title="Movimientos" description={`${movs.length} aplicado(s).`}>
          {movs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Aún no hay movimientos aplicados. Al aprobar una solicitud, el movimiento se aplica al gas y aparece aquí.</p>
          ) : (
            <ul className="space-y-2">
              {movs.map((m) => (
                <li key={m.id} className="rounded-xl border border-border-strong bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge tone={m.tone}>{m.gas} · {m.op}</StatusBadge>
                    <span className="font-mono text-[11px] text-muted">{m.hora}</span>
                  </div>
                  <p className="mt-1 text-sm text-text">{m.detalle}</p>
                  <p className="text-xs text-muted">{m.nota}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted">Demo client-side (persistente). Autorización según `docs/decisions/roles-permissions.md`.</p>
    </>
  );
}
