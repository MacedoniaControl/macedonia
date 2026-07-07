"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/ux/use-persisted-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";

type EstadosGas = { lleno: number; vacio: number; enCliente: number; pendiente: number };
type Inventario = Record<string, EstadosGas>;
type Mov = { id: number; hora: string; gas: string; op: string; detalle: string; nota: string; tone: Tone };

// Gases de Sumigases (base). Se pueden agregar más desde la UI.
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
const OPS = [
  { v: "intercambio", label: "Intercambio directo (entra vacío, sale lleno)" },
  { v: "entrega", label: "Entrega sin retorno (sale lleno)" },
  { v: "recarga", label: "Recarga (vacío → lleno)" },
  { v: "retorno", label: "Retorno de cliente (vuelve vacío)" },
  { v: "recepcion", label: "Recepción de cilindro de cliente" },
];
const ESTADOS: { key: keyof EstadosGas; label: string; tone: Tone }[] = [
  { key: "lleno", label: "Lleno", tone: "ok" },
  { key: "vacio", label: "Vacío", tone: "muted" },
  { key: "enCliente", label: "En cliente", tone: "info" },
  { key: "pendiente", label: "Pendiente", tone: "warn" },
];

const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";
const labelCls = "mb-1 block text-xs font-medium text-muted";
const empty: EstadosGas = { lleno: 0, vacio: 0, enCliente: 0, pendiente: 0 };

export default function CylindersPage() {
  const [gases, setGases] = usePersistedState<string[]>("cyl:gases", GASES_BASE);
  const [inv, setInv] = usePersistedState<Inventario>("cyl:inv", INV_BASE);
  const [movs, setMovs] = usePersistedState<Mov[]>("cyl:movs", []);

  const [gas, setGas] = useState(GASES_BASE[0]);
  const [op, setOp] = useState("intercambio");
  const [cap, setCap] = useState(CAPS[0]);
  const [cant, setCant] = useState(1);
  const [cliente, setCliente] = useState("");
  const [error, setError] = useState("");
  const [nuevoGas, setNuevoGas] = useState("");
  const [gasMsg, setGasMsg] = useState("");

  const est = (g: string): EstadosGas => inv[g] ?? empty;
  const totalPendiente = gases.reduce((a, g) => a + est(g).pendiente, 0);

  function agregarGas() {
    setGasMsg("");
    const n = nuevoGas.trim();
    if (!n) return setGasMsg("ERR:Escribe el nombre del gas.");
    if (gases.some((g) => g.toLowerCase() === n.toLowerCase())) return setGasMsg("ERR:Ese gas ya existe.");
    setGases((prev) => [...prev, n]);
    setInv((prev) => ({ ...prev, [n]: { ...empty } }));
    setGasMsg(`Gas "${n}" agregado a cilindros y recargas.`);
    setNuevoGas("");
  }

  function registrar() {
    setError("");
    const q = Number(cant);
    if (!q || q < 1) return setError("La cantidad debe ser al menos 1.");
    const e = { ...est(gas) };
    let nota = "";
    let tone: Tone = "ok";

    if (op === "intercambio") {
      if (e.lleno < q) return setError(`No hay suficientes ${gas} llenos.`);
      e.lleno -= q; e.vacio += q;
      nota = "Entró vacío, salió lleno. Se cobra recarga. Sin pendiente.";
    } else if (op === "entrega") {
      if (e.lleno < q) return setError(`No hay suficientes ${gas} llenos.`);
      e.lleno -= q; e.pendiente += q;
      nota = "Salió lleno sin retorno. Queda pendiente por retorno.";
      tone = "warn";
    } else if (op === "recarga") {
      if (e.vacio < q) return setError(`No hay suficientes ${gas} vacíos para recargar.`);
      e.vacio -= q; e.lleno += q;
      nota = "Recargado: vacío → lleno.";
    } else if (op === "retorno") {
      if (e.pendiente < q) return setError(`No hay tantos ${gas} pendientes por retorno.`);
      e.pendiente -= q; e.vacio += q;
      nota = "Cliente devolvió vacío. Pendiente saldado.";
      tone = "info";
    } else {
      e.enCliente += q;
      nota = "Recepción de cilindro de cliente. No aumenta stock propio (requiere aprobación).";
      tone = "info";
    }

    setInv((prev) => ({ ...prev, [gas]: e }));
    setMovs((prev) => [
      {
        id: Date.now(),
        hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
        gas,
        op: (OPS.find((o) => o.v === op)?.label ?? op).split(" (")[0],
        detalle: `${q} × ${gas} ${cap}${cliente ? ` · ${cliente}` : ""}`,
        nota, tone,
      },
      ...prev,
    ]);
    setCant(1); setCliente("");
  }

  return (
    <>
      <PageHeader
        title="Cilindros y recargas"
        description="Inventario de cilindros por tipo de gas y estado. Registra movimientos y observa cada gas actualizarse en vivo."
        breadcrumbs={[{ label: "Inventario" }, { label: "Cilindros y recargas" }]}
        actions={<StatusBadge tone="brand">{gases.length} gases</StatusBadge>}
      />

      {totalPendiente > 0 && (
        <div className="mb-4">
          <AlertCard tone="warn" titulo="Cilindros pendientes por retorno"
            mensaje={`Hay ${totalPendiente} cilindro(s) entregados sin vacío de vuelta (todos los gases). Usa "Retorno de cliente" al recibirlos.`} />
        </div>
      )}

      {/* Un apartado por gas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {gases.map((g) => {
          const e = est(g);
          const total = e.lleno + e.vacio + e.enCliente + e.pendiente;
          return (
            <SectionCard key={g} title={g} description={`${total} cilindros en total`}
              action={e.pendiente > 0 ? <StatusBadge tone="warn">{e.pendiente} pend.</StatusBadge> : <StatusBadge tone="ok">al día</StatusBadge>}>
              <div className="grid grid-cols-4 gap-2">
                {ESTADOS.map((s) => (
                  <div key={s.key} className="rounded-lg border border-border bg-surface-2 p-2 text-center">
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

        {/* Agregar gas */}
        <SectionCard title="Agregar gas" description="Suma un tipo de gas nuevo al inventario.">
          <div className="space-y-2">
            <input className={inputClass} value={nuevoGas} placeholder="Ej: Helio, Mezcla especial…"
              onChange={(e) => setNuevoGas(e.target.value)} />
            {gasMsg && <p className={`rounded-lg px-2 py-1 text-xs ${gasMsg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{gasMsg.replace("ERR:", "")}</p>}
            <Button icon="plus" onClick={agregarGas} className="w-full">Agregar gas</Button>
          </div>
        </SectionCard>
      </div>

      {/* Registrar movimiento */}
      <div id="mov-form" className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <SectionCard title="Registrar movimiento">
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
                {OPS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
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
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <Button icon="plus" onClick={registrar} className="w-full">Registrar movimiento</Button>
          </div>
        </SectionCard>

        <SectionCard title="Movimientos" description={`${movs.length} registrado(s).`}>
          {movs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Aún no hay movimientos. Registra uno y aparecerá aquí con su efecto en el inventario del gas.</p>
          ) : (
            <ul className="space-y-2">
              {movs.map((m) => (
                <li key={m.id} className="rounded-xl border border-border bg-surface-2 p-3">
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
      <p className="mt-4 text-xs text-muted">Demo client-side (persistente). Reglas en `docs/decisions/cylinder-rules.md`.</p>
    </>
  );
}
