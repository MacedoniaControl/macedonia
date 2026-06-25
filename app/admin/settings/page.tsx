import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
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
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Parámetros base del sistema. La configuración crítica queda reservada a OWNER."
        breadcrumbs={[{ label: "Sistema" }, { label: "Configuración" }]}
        actions={<Button>Guardar cambios</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Empresas" description="Multiempresa: Sumigases y Sudematin." action={<StatusBadge tone="brand">2 activas</StatusBadge>}>
          <div className="space-y-3">
            <Field label="Empresa por defecto">
              <select className={inputClass} defaultValue="sumigases">
                <option value="sumigases">Sumigases</option>
                <option value="sudematin">Sudematin</option>
              </select>
            </Field>
            <Field label="Vista consolidada (OWNER/ADMIN)" hint="Si se desactiva, cada empresa se ve por separado.">
              <select className={inputClass} defaultValue="on">
                <option value="on">Habilitada</option>
                <option value="off">Solo preparada (no MVP)</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Moneda y tasa" description="USD/Bs, tasa BCV e IVA." action={<StatusBadge tone="warn">tasa demo</StatusBadge>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tasa BCV (Bs/USD)"><input className={inputClass} defaultValue="49.50" /></Field>
            <Field label="IVA (%)"><input className={inputClass} defaultValue="16" /></Field>
            <Field label="Tasa especial sin aprobación (±%)" hint="Fuera de rango: aprueba OWNER/ADMIN."><input className={inputClass} defaultValue="3" /></Field>
            <Field label="Moneda base"><input className={inputClass} defaultValue="USD" readOnly /></Field>
          </div>
        </SectionCard>

        <SectionCard title="Documentos" description="Correlativos y plantillas.">
          <div className="space-y-3">
            <Field label="Correlativo" hint="Por empresa + tipo, reinicio anual.">
              <input className={inputClass} defaultValue="NE-2026-000123" readOnly />
            </Field>
            <Field label="Plantilla activa">
              <select className={inputClass} defaultValue="nuevo">
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
        Demo de presentación. Los valores se conectarán al backend (ver `docs/decisions/currency-tax-rate.md`,
        `documents-correlativos.md`, `payments-cash.md`).
      </p>
    </>
  );
}
