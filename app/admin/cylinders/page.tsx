"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { AlertCard } from "@/components/ui/AlertCard";
import { Button } from "@/components/ui/Button";

type Estados = { lleno: number; vacio: number; enCliente: number; pendiente: number };

type Mov = {
  id: number;
  hora: string;
  op: string;
  detalle: string;
  nota: string;
  tone: Tone;
};

const GASES = ["Oxígeno", "Argón", "Nitrógeno", "Acetileno", "CO2"];
const CAPS = ["6 M³", "9 M³", "10 M³", "1 M³"];

const OPS = [
  { v: "intercambio", label: "Intercambio directo (entra vacío, sale lleno)" },
  { v: "entrega", label: "Entrega sin retorno (sale lleno)" },
  { v: "recarga", label: "Recarga (vacío → lleno)" },
  { v: "retorno", label: "Retorno de cliente (vuelve vacío)" },
  { v: "recepcion", label: "Recepción de cilindro de cliente" },
];

const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

const labelCls = "mb-1 block text-xs font-medium text-muted";

export default function CylindersPage() {
  const [estados, setEstados] = useState<Estados>({ lleno: 62, vacio: 38, enCliente: 14, pendiente: 9 });
  const [movs, setMovs] = useState<Mov[]>([]);
  const [op, setOp] = useState("intercambio");
  const [gas, setGas] = useState(GASES[0]);
  const [cap, setCap] = useState(CAPS[0]);
  const [cant, setCant] = useState(1);
  const [cliente, setCliente] = useState("");
  const [error, setError] = useState("");

  function registrar() {
    setError("");
    const q = Number(cant);
    if (!q || q < 1) return setError("La cantidad debe ser al menos 1.");

    const e = { ...estados };
    let nota = "";
    let tone: Tone = "ok";

    if (op === "intercambio") {
      if (e.lleno < q) return setError("No hay suficientes cilindros llenos.");
      e.lleno -= q; e.vacio += q;
      nota = "Entró vacío, salió lleno. Se cobra recarga. Sin pendiente.";
    } else if (op === "entrega") {
      if (e.lleno < q) return setError("No hay suficientes cilindros llenos.");
      e.lleno -= q; e.pendiente += q;
      nota = "Salió lleno sin retorno. Queda pendiente por retorno (alerta).";
      tone = "warn";
    } else if (op === "recarga") {
      if (e.vacio < q) return setError("No hay suficientes cilindros vacíos para recargar.");
      e.vacio -= q; e.lleno += q;
      nota = "Recargado: vacío → lleno.";
    } else if (op === "retorno") {
      if (e.pendiente < q) return setError("No hay tantos pendientes por retorno.");
      e.pendiente -= q; e.vacio += q;
      nota = "Cliente devolvió vacío. Pendiente saldado.";
      tone = "info";
    } else if (op === "recepcion") {
      e.enCliente += q;
      nota = "Recepción de cilindro de cliente. No aumenta stock propio (requiere aprobación para convertir).";
      tone = "info";
    }

    const label = OPS.find((o) => o.v === op)?.label ?? op;
    setEstados(e);
    setMovs((prev) => [
      {
        id: Date.now(),
        hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
        op: label.split(" (")[0],
        detalle: `${q} × ${gas} ${cap}${cliente ? ` · ${cliente}` : ""}`,
        nota,
        tone,
      },
      ...prev,
    ]);
    setCant(1);
    setCliente("");
  }

  const cards: { label: string; value: number; tone: Tone }[] = [
    { label: "Lleno", value: estados.lleno, tone: "ok" },
    { label: "Vacío", value: estados.vacio, tone: "muted" },
    { label: "En cliente", value: estados.enCliente, tone: "info" },
    { label: "Pendiente por retorno", value: estados.pendiente, tone: estados.pendiente > 0 ? "warn" : "ok" },
  ];

  return (
    <>
      <PageHeader
        title="Cilindros y recargas"
        description="Control por cantidad y estado. Registra movimientos y observa el inventario actualizarse en vivo."
        breadcrumbs={[{ label: "Inventario" }, { label: "Cilindros y recargas" }]}
      />

      <SectionCard title="Cilindros por estado" description="Se actualiza con cada movimiento.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-2xl font-semibold text-text">{c.value}</p>
              <div className="mt-1.5"><StatusBadge tone={c.tone}>{c.label}</StatusBadge></div>
            </div>
          ))}
        </div>
      </SectionCard>

      {estados.pendiente > 0 && (
        <div className="mt-4">
          <AlertCard
            tone="warn"
            titulo="Cilindros pendientes por retorno"
            mensaje={`Hay ${estados.pendiente} cilindro(s) entregados sin vacío de vuelta. Usa “Retorno de cliente” al recibirlos.`}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <SectionCard title="Registrar movimiento">
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="op">Operación</label>
              <select id="op" className={inputClass} value={op} onChange={(e) => setOp(e.target.value)}>
                {OPS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="gas">Tipo de gas</label>
                <select id="gas" className={inputClass} value={gas} onChange={(e) => setGas(e.target.value)}>
                  {GASES.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="cap">Capacidad</label>
                <select id="cap" className={inputClass} value={cap} onChange={(e) => setCap(e.target.value)}>
                  {CAPS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="cant">Cantidad</label>
                <input id="cant" type="number" min={1} className={inputClass} value={cant}
                  onChange={(e) => setCant(Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cli">Cliente (opcional)</label>
                <input id="cli" className={inputClass} value={cliente} placeholder="Nombre"
                  onChange={(e) => setCliente(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button icon="plus" onClick={registrar} className="w-full">Registrar movimiento</Button>
          </div>
        </SectionCard>

        <SectionCard title="Movimientos" description={`${movs.length} registrado(s) en esta sesión.`}>
          {movs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Aún no hay movimientos. Registra uno y aparecerá aquí con su efecto en el inventario.
            </p>
          ) : (
            <ul className="space-y-2">
              {movs.map((m) => (
                <li key={m.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge tone={m.tone}>{m.op}</StatusBadge>
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

      <p className="mt-4 text-xs text-muted">
        Demo funcional client-side (sin backend). Las reglas siguen `docs/decisions/cylinder-rules.md`.
        La conversión de cilindro de cliente a stock propio requiere aprobación OWNER/ADMIN.
      </p>
    </>
  );
}
