"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useEmpresaActiva } from "@/lib/ux/use-empresa";
import { leerConfig, guardarConfig, type Configuracion } from "@/lib/config/config-db";

const inputClass = "sumi-campo";

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
  const empresaKey = useEmpresaActiva();
  // La configuración vive en la BASE, no en el navegador: el IVA y la tasa
  // tienen que ser los mismos para todos. Dos vendedores con IVA distinto emiten
  // totales distintos por el mismo producto.
  const [form, setForm] = useState<Config>(DEFAULTS);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    leerConfig(empresaKey)
      .then((c) => {
        if (!vigente) return;
        setForm({
          ...DEFAULTS,
          iva: c.iva_pct ?? DEFAULTS.iva,
          tasa: c.tasa_manual && c.tasa_manual !== "0" ? c.tasa_manual : DEFAULTS.tasa,
          rangoTasa: c.dias_vencimiento_cotizacion ?? DEFAULTS.rangoTasa,
        });
      })
      .catch((e) => { if (vigente) setMsg((e as Error).message); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [empresaKey]);
  const set = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setMsg("");
    setForm({ ...form, [k]: e.target.value });
  };

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    setMsg("");
    try {
      const r = await guardarConfig({
        iva_pct: form.iva,
        tasa_manual: form.tasa,
        dias_vencimiento_cotizacion: form.rangoTasa,
      }, empresaKey);
      // Decir "guardado" cuando la base rechazó es peor que no decir nada: la
      // persona se va creyendo que el IVA cambió y sigue emitiendo con el viejo.
      setMsg(r.ok
        ? "Configuración guardada. Aplica para toda la empresa, no solo para este navegador."
        : `No se pudo guardar: ${r.error}`);
    } finally {
      setGuardando(false);
    }
  }

  const [bcv, setBcv] = useState<{ loading: boolean; msg: string; err: boolean }>({ loading: false, msg: "", err: false });
  async function actualizarBCV() {
    setBcv({ loading: true, msg: "Consultando bcv.org.ve…", err: false });
    try {
      const r = await fetch("/api/bcv", { cache: "no-store" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "No disponible");
      const next = { ...form, tasa: String(d.tasa) };
      setForm(next);
      // La tasa del BCV se guarda para toda la empresa: si cada quien tuviera la
      // suya, dos personas convertirían el mismo monto a dólares distintos.
      await guardarConfig({ tasa_manual: String(d.tasa) }, empresaKey);
      setBcv({ loading: false, err: false, msg: `Tasa BCV actualizada a ${d.tasa} Bs/USD${d.fecha ? ` · ${d.fecha}` : ""}.` });
    } catch (e) {
      setBcv({ loading: false, err: true, msg: `No se pudo actualizar desde el BCV (${String(e)}). Ingrésala manual.` });
    }
  }

  return (
    <>
      <PageHeader
        title="Configuración"
        breadcrumbs={[{ label: "Sistema" }, { label: "Configuración" }]}
        actions={<Button icon="check" onClick={guardar} disabled={guardando || cargando} cargando={guardando} textoCargando="Guardando…">Guardar cambios</Button>}
      />

      {msg && <p className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{msg}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <SectionCard title="Moneda y tasa" description="USD/Bs, tasa BCV e IVA." >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tasa BCV (Bs/USD)"><input className={inputClass} value={form.tasa} onChange={set("tasa")} /></Field>
            <Field label="IVA (%)"><input className={inputClass} value={form.iva} onChange={set("iva")} /></Field>
            <Field label="Tasa especial sin aprobación (±%)" hint="Fuera de rango: aprueba OWNER/ADMIN."><input className={inputClass} value={form.rangoTasa} onChange={set("rangoTasa")} /></Field>
            <Field label="Moneda base"><input className={inputClass} value="USD" readOnly /></Field>
          </div>
          <div className="mt-3">
            <Button variant="secondary" icon="roi" onClick={actualizarBCV} disabled={bcv.loading}>
              {bcv.loading ? "Consultando BCV…" : "Actualizar desde BCV"}
            </Button>
            {bcv.msg && <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${bcv.err ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{bcv.msg}</p>}
            <p className="mt-1 text-[11px] text-muted">Trae el precio oficial del dólar de bcv.org.ve y actualiza la tasa.</p>
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
            {/* La fila envuelve en pantallas chicas: "Transferencia Bs" más el
                requisito y la insignia no entran en 320px, y el nombre del
                método quedaba cortado. */}
            {metodos.map((x) => (
              <li key={x.m} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2">
                <span className="min-w-0 text-text">{x.m}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{x.req}</span>
                  <StatusBadge tone={x.tone}>{x.verif}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <p className="mt-4 text-xs text-muted">
      </p>
    </>
  );
}
