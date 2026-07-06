"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { usePersistedState } from "@/lib/ux/use-persisted-state";

const inputClass = "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

type Config = {
  empresaDefecto: string;
  consolidada: string;
  tasa: string;
  iva: string;
  rangoTasa: string;
  plantilla: string;
};

const DEFAULTS: Config = { empresaDefecto: "sumigases", consolidada: "on", tasa: "49.50", iva: "16", rangoTasa: "3", plantilla: "nuevo" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const metodos = [
  { m: "Efectivo USD / Bs", req: "—", verif: "Verificado auto", tone: "ok" as const },
  { m: "Punto de venta", req: "Comprobante", verif: "Pendiente", tone: "warn" as const },
  { m: "Transferencia Bs", req: "Referencia", verif: "Pendiente", tone: "warn" as const },
  { m: "Pago móvil", req: "Referencia", verif: "Pendiente", tone: "warn" as const },
  { m: "Zelle", req: "Referencia", verif: "Pendiente", tone: "warn" as const },
  { m: "Binance", req: "Referencia", verif: "Pendiente", tone: "warn" as const },
];

export default function SettingsPage() {
  const [saved, setSaved] = usePersistedState<Config>("config", DEFAULTS);
  const [form, setForm] = useState<Config>(saved);
  const [msg, setMsg] = useState("");
  const set = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setMsg("");
    setForm({ ...form, [k]: e.target.value });
  };

  function guardar() {
    setSaved(form);
    setMsg("Configuración guardada. Los valores persisten en este navegador.");
  }

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Parámetros base del sistema. La configuración crítica queda reservada a OWNER."
        breadcrumbs={[{ label: "Sistema" }, { label: "Configuración" }]}
        actions={<Button icon="check" onClick={guardar}>Guardar cambios</Button>}
      />

      {msg && <p className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Empresas" description="Multiempresa: Sumigases y Sudematin." action={<StatusBadge tone="brand">2 activas</StatusBadge>}>
          <div className="space-y-3">
            <Field label="Empresa por defecto">
              <select className={inputClass} value={form.empresaDefecto} onChange={set("empresaDefecto")}>
                <option value="sumigases">Sumigases</option>
                <option value="sudematin">Sudematin</option>
              </select>
            </Field>
            <Field label="Vista consolidada (OWNER/ADMIN)" hint="Si se desactiva, cada empresa se ve por separado.">
              <select className={inputClass} value={form.consolidada} onChange={set("consolidada")}>
                <option value="on">Habilitada</option>
                <option value="off">Solo preparada (no MVP)</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Moneda y tasa" description="USD/Bs, tasa BCV e IVA." action={<StatusBadge tone="warn">tasa demo</StatusBadge>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tasa BCV (Bs/USD)"><input className={inputClass} value={form.tasa} onChange={set("tasa")} /></Field>
            <Field label="IVA (%)"><input className={inputClass} value={form.iva} onChange={set("iva")} /></Field>
            <Field label="Tasa especial sin aprobación (±%)" hint="Fuera de rango: aprueba OWNER/ADMIN."><input className={inputClass} value={form.rangoTasa} onChange={set("rangoTasa")} /></Field>
            <Field label="Moneda base"><input className={inputClass} value="USD" readOnly /></Field>
          </div>
        </SectionCard>

        <SectionCard title="Documentos" description="Correlativos y plantillas.">
          <div className="space-y-3">
            <Field label="Correlativo" hint="Por empresa + tipo, reinicio anual.">
              <input className={inputClass} value="NE-2026-000123" readOnly />
            </Field>
            <Field label="Plantilla activa">
              <select className={inputClass} value={form.plantilla} onChange={set("plantilla")}>
                <option value="nuevo">Modelo nuevo</option>
                <option value="viejo">Modelo viejo</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Métodos de pago" description="Requisito y verificación por método.">
          <ul className="divide-y divide-border text-sm">
            {metodos.map((x) => (
              <li key={x.m} className="flex items-center justify-between gap-2 py-2">
                <span className="text-text">{x.m}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{x.req}</span>
                  <StatusBadge tone={x.tone}>{x.verif}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <p className="mt-4 text-xs text-muted">
        Los valores guardados persisten localmente (demo). Reglas en `docs/decisions/` (currency-tax-rate, documents-correlativos, payments-cash).
      </p>
    </>
  );
}
