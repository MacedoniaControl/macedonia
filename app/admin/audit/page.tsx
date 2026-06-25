import { PageHeader } from "@/components/layout/PageHeader";
import { DataTableShell } from "@/components/ui/DataTableShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text";

const eventos = [
  { fecha: "2026-06-23 14:22", usuario: "owner", accion: "Ver contraseña", entidad: "User: admin", tone: "danger" as const },
  { fecha: "2026-06-23 13:05", usuario: "admin", accion: "Verificación de pago", entidad: "Pago #PM-0042", tone: "ok" as const },
  { fecha: "2026-06-23 11:40", usuario: "cajero", accion: "Descuento aprobado", entidad: "Venta #NV-0188", tone: "warn" as const },
  { fecha: "2026-06-23 10:12", usuario: "almacen", accion: "Ajuste de stock", entidad: "GAS-0002 (+12)", tone: "warn" as const },
  { fecha: "2026-06-22 18:30", usuario: "owner", accion: "Cambio de tasa", entidad: "BCV 49,50", tone: "info" as const },
  { fecha: "2026-06-22 16:08", usuario: "admin", accion: "Importación", entidad: "MATRIZ NOVIEMBRE.xlsx", tone: "info" as const },
  { fecha: "2026-06-22 09:01", usuario: "owner", accion: "Login", entidad: "Sesión", tone: "navy" as const },
];

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro de eventos sensibles: login, ver contraseña, cambios de precio/costo, ajustes, anulaciones, pagos e importaciones."
        breadcrumbs={[{ label: "Sistema" }, { label: "Auditoría" }]}
      />
      <DataTableShell
        title="Eventos de auditoría"
        description="Trazabilidad de acciones críticas (demo)."
        searchPlaceholder="Buscar por usuario, acción o entidad…"
        filters={
          <>
            <select className={selectClass} defaultValue="all" aria-label="Tipo de evento">
              <option value="all">Todos los eventos</option>
              <option>Login</option>
              <option>Ver contraseña</option>
              <option>Ajuste de stock</option>
              <option>Cambio de tasa</option>
              <option>Importación</option>
            </select>
            <select className={selectClass} defaultValue="all" aria-label="Usuario">
              <option value="all">Todos los usuarios</option>
              <option>owner</option>
              <option>admin</option>
              <option>cajero</option>
            </select>
          </>
        }
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="py-2.5 pr-3 font-medium">Fecha</th>
              <th className="py-2.5 pr-3 font-medium">Usuario</th>
              <th className="py-2.5 pr-3 font-medium">Acción</th>
              <th className="py-2.5 font-medium">Entidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {eventos.map((e, i) => (
              <tr key={i} className="hover:bg-surface-2">
                <td className="py-2.5 pr-3 font-mono text-xs text-muted">{e.fecha}</td>
                <td className="py-2.5 pr-3 text-text">{e.usuario}</td>
                <td className="py-2.5 pr-3"><StatusBadge tone={e.tone}>{e.accion}</StatusBadge></td>
                <td className="py-2.5 text-muted">{e.entidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </>
  );
}
