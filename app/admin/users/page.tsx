"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePersistedState } from "@/lib/ux/use-persisted-state";

type Usuario = { nombre: string; usuario: string; rol: string; empresa: string };

const SEED: Usuario[] = [
  { nombre: "Owner Demo", usuario: "owner", rol: "OWNER", empresa: "Ambas" },
  { nombre: "Admin Demo", usuario: "admin", rol: "ADMIN", empresa: "Ambas" },
  { nombre: "Auditor Demo", usuario: "auditor", rol: "AUDITOR", empresa: "Sudematin" },
];

const ROLES = ["OWNER", "ADMIN", "AUDITOR", "CAJERO", "VENDEDOR", "ALMACEN", "COMPRAS", "TECNICO_RECARGA", "DISTRIBUIDOR"];
const toneRol: Record<string, Tone> = { OWNER: "brand", ADMIN: "info", AUDITOR: "muted", CAJERO: "ok", VENDEDOR: "ok", ALMACEN: "warn", COMPRAS: "warn", TECNICO_RECARGA: "info", DISTRIBUIDOR: "navy" };
const inputClass = "h-10 w-full rounded-xl border border-border-strong bg-surface-2 px-3 text-sm text-text";

const rolesInfo = [
  { rol: "OWNER", resumen: "Control total: usuarios, contraseñas, config crítica, aprobaciones y reportes." },
  { rol: "ADMIN", resumen: "Operación completa + aprobaciones + gestión de usuarios. Ve contraseñas." },
  { rol: "AUDITOR", resumen: "Solo lectura amplia. No ve contraseñas ni opera." },
  { rol: "CAJERO", resumen: "POS, caja, pagos y cobros. Sin costo/margen." },
  { rol: "VENDEDOR", resumen: "Cotizaciones y POS. Descuentos requieren aprobación." },
  { rol: "ALMACEN", resumen: "Inventario, movimientos, despacho y cilindros físicos." },
  { rol: "COMPRAS", resumen: "Órdenes de compra, proveedores y cuentas por pagar. Ve costo." },
  { rol: "TECNICO_RECARGA", resumen: "Cilindros y recargas (operativo)." },
  { rol: "DISTRIBUIDOR", resumen: "Portal acotado a lo propio. Fase 2." },
];

export default function UsersPage() {
  const [users, setUsers] = usePersistedState<Usuario[]>("users:lista", SEED);
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState("VENDEDOR");
  const [empresa, setEmpresa] = useState("Sumigases");
  const [msg, setMsg] = useState("");

  function crear() {
    setMsg("");
    if (!nombre.trim() || !usuario.trim()) return setMsg("ERR:Nombre y usuario son obligatorios.");
    if (users.some((u) => u.usuario === usuario.trim().toLowerCase())) return setMsg("ERR:Ese usuario ya existe.");
    setUsers((prev) => [...prev, { nombre: nombre.trim(), usuario: usuario.trim().toLowerCase(), rol, empresa }]);
    setMsg(`Usuario "${usuario.trim().toLowerCase()}" creado con rol ${rol}. Se generó contraseña temporal (auditado).`);
    setNombre(""); setUsuario("");
  }

  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        description="Gestión de usuarios, roles y permisos. Solo OWNER/ADMIN ven contraseñas (auditado)."
        breadcrumbs={[{ label: "Sistema" }, { label: "Usuarios y roles" }]}
        actions={<StatusBadge tone="brand">{users.length} usuario(s)</StatusBadge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.7fr]">
        <SectionCard title="Nuevo usuario">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="nom">Nombre completo</label>
              <input id="nom" className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="usr">Usuario</label>
              <input id="usr" className={inputClass} value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="rol">Rol</label>
                <select id="rol" className={inputClass} value={rol} onChange={(e) => setRol(e.target.value)}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted" htmlFor="emp">Empresa</label>
                <select id="emp" className={inputClass} value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                  <option>Sumigases</option>
                  <option>Sudematin</option>
                  <option>Ambas</option>
                </select>
              </div>
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith("ERR:") ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>{msg.replace("ERR:", "")}</p>}
            <Button icon="plus" onClick={crear} className="w-full">Crear usuario</Button>
          </div>
        </SectionCard>

        <SectionCard title="Usuarios" description="Resetear clave requiere confirmación y queda auditado.">
          <div className="sumi-scroll max-w-full overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
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
                    <td className="py-2.5 pr-3"><StatusBadge tone={toneRol[u.rol] ?? "muted"}>{u.rol}</StatusBadge></td>
                    <td className="py-2.5 pr-3 text-muted">{u.empresa}</td>
                    <td className="py-2.5">
                      <ConfirmDialog
                        title="Resetear contraseña"
                        message={`Se generará una contraseña temporal para ${u.nombre}. La acción quedará registrada en auditoría.`}
                        confirmLabel="Resetear"
                        onConfirm={() => setMsg(`Contraseña temporal generada para ${u.usuario} (evento auditado).`)}
                        trigger={(open) => (
                          <button type="button" onClick={open} className="text-sm font-medium text-brand hover:underline">Resetear clave</button>
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Roles y permisos" description="Resumen por rol (docs/decisions/roles-permissions.md).">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rolesInfo.map((r) => (
              <div key={r.rol} className="rounded-xl border border-border-strong bg-surface-2 p-3">
                <div className="mb-2"><StatusBadge tone={toneRol[r.rol] ?? "muted"}>{r.rol}</StatusBadge></div>
                <p className="text-sm text-muted">{r.resumen}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
