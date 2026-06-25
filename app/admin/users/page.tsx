"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { DataTableShell } from "@/components/ui/DataTableShell";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const users = [
  { nombre: "Owner Demo", usuario: "owner", rol: "OWNER", empresa: "Ambas", tone: "brand" as const },
  { nombre: "Admin Demo", usuario: "admin", rol: "ADMIN", empresa: "Ambas", tone: "info" as const },
  { nombre: "Auditor Demo", usuario: "auditor", rol: "AUDITOR", empresa: "Sudematin", tone: "muted" as const },
];

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        description="Gestión de usuarios, roles y permisos. Solo OWNER/ADMIN pueden ver contraseñas (auditado)."
        breadcrumbs={[{ label: "Sistema" }, { label: "Usuarios y roles" }]}
        actions={<Button icon="plus">Nuevo usuario</Button>}
      />
      <DataTableShell title="Usuarios" searchPlaceholder="Buscar por nombre o usuario…">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="py-2.5 pr-3 font-medium">Nombre</th>
              <th className="py-2.5 pr-3 font-medium">Usuario</th>
              <th className="py-2.5 pr-3 font-medium">Rol</th>
              <th className="py-2.5 pr-3 font-medium">Empresa</th>
              <th className="py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.usuario} className="hover:bg-surface-2">
                <td className="py-2.5 pr-3 text-text">{u.nombre}</td>
                <td className="py-2.5 pr-3 font-mono text-xs text-muted">{u.usuario}</td>
                <td className="py-2.5 pr-3"><StatusBadge tone={u.tone}>{u.rol}</StatusBadge></td>
                <td className="py-2.5 pr-3 text-muted">{u.empresa}</td>
                <td className="py-2.5">
                  <ConfirmDialog
                    title="Resetear contraseña"
                    message={`Se generará una contraseña temporal para ${u.nombre}. La acción quedará registrada en auditoría.`}
                    confirmLabel="Resetear"
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Resetear clave
                      </button>
                    )}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>

      <div className="mt-6">
        <SectionCard
          title="Roles y permisos"
          description="Resumen por rol (ver docs/decisions/roles-permissions.md)."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => (
              <div key={r.rol} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="mb-2"><StatusBadge tone={r.tone}>{r.rol}</StatusBadge></div>
                <p className="text-sm text-muted">{r.resumen}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

const roles = [
  { rol: "OWNER", tone: "brand" as const, resumen: "Control total: usuarios, contraseñas, config crítica, aprobaciones y reportes." },
  { rol: "ADMIN", tone: "info" as const, resumen: "Operación completa + aprobaciones + gestión de usuarios. Ve contraseñas." },
  { rol: "AUDITOR", tone: "muted" as const, resumen: "Solo lectura amplia. No ve contraseñas ni opera." },
  { rol: "CAJERO", tone: "ok" as const, resumen: "POS, caja, pagos y cobros. Sin costo/margen." },
  { rol: "VENDEDOR", tone: "ok" as const, resumen: "Cotizaciones y POS. Descuentos requieren aprobación." },
  { rol: "ALMACEN", tone: "warn" as const, resumen: "Inventario, movimientos, despacho y cilindros físicos." },
  { rol: "COMPRAS", tone: "warn" as const, resumen: "Órdenes de compra, proveedores y cuentas por pagar. Ve costo." },
  { rol: "TECNICO_RECARGA", tone: "info" as const, resumen: "Cilindros y recargas (operativo)." },
  { rol: "DISTRIBUIDOR", tone: "navy" as const, resumen: "Portal acotado a lo propio. Fase 2." },
];
