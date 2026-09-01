"use client";

import { Fragment, useActionState, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { crearUsuario, cambiarActivo, type Resultado, type UsuarioFila } from "./actions";
import { FichaPermisos } from "./FichaPermisos";
import { EMPRESAS } from "@/lib/ux/empresas";

const inicial: Resultado = { error: null, ok: null };

const ROLES = [
  { id: "owner", label: "Owner", ayuda: "Todo, ambas empresas. Único que ve los registros." },
  { id: "admin", label: "Administrador", ayuda: "Su empresa. Ve y carga gastos y utilidad." },
  { id: "vendedor", label: "Vendedor", ayuda: "Documentos e inventario. Solo precios de venta." },
  { id: "tecnico", label: "Técnico de recargas", ayuda: "Cilindros y recargas de su empresa." },
];

const tono: Record<string, Tone> = { owner: "brand", admin: "info", vendedor: "ok", tecnico: "navy" };
const input =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function UsuariosPanel({ usuarios }: { usuarios: UsuarioFila[] }) {
  const [estado, accion, pendiente] = useActionState(crearUsuario, inicial);
  const [rol, setRol] = useState("vendedor");
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const esOwner = rol === "owner";

  async function alternar(u: UsuarioFila) {
    const r = await cambiarActivo(u.id, !u.activo);
    setAviso(r.error ?? r.ok);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SectionCard title="Usuarios" description="Quién puede entrar al sistema y con qué alcance.">
        {usuarios.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Todavía no hay usuarios registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Nombre</th>
                  <th className="py-2 pr-3 font-medium">Usuario</th>
                  <th className="py-2 pr-3 font-medium">Rol</th>
                  <th className="py-2 pr-3 font-medium">Empresa</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <Fragment key={u.id}>
                  <tr className="border-b border-border/60">
                    <td className="py-2.5 pr-3 text-text">
                      <button
                        type="button"
                        onClick={() => setAbierto(abierto === u.id ? null : u.id)}
                        aria-expanded={abierto === u.id}
                        className="inline-flex min-h-11 items-center gap-1.5 text-left hover:text-brand"
                      >
                        <span className={`transition ${abierto === u.id ? "rotate-90" : ""}`}>›</span>
                        {u.nombre}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{u.usuario}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge tone={tono[u.rol] ?? "muted"}>
                        {ROLES.find((r) => r.id === u.rol)?.label ?? u.rol}
                      </StatusBadge>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {u.empresaId ? EMPRESAS[u.empresaId as "sumigases"]?.nombreCorto : "Ambas"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge tone={u.activo ? "ok" : "muted"}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button variant="secondary" onClick={() => alternar(u)}>
                        {u.activo ? "Desactivar" : "Reactivar"}
                      </Button>
                    </td>
                  </tr>
                  {abierto === u.id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <FichaPermisos usuario={u} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aviso && <p className="mt-3 text-sm text-muted">{aviso}</p>}
      </SectionCard>

      <SectionCard title="Crear usuario" description="Solo el Owner puede dar de alta.">
        <form action={accion} className="space-y-3">
          <div>
            <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-text">
              Nombre de la persona
            </label>
            <input id="nombre" name="nombre" required className={input} placeholder="José Pérez" />
          </div>

          <div>
            <label htmlFor="usuario" className="mb-1 block text-sm font-medium text-text">
              Usuario para entrar
            </label>
            <input
              id="usuario"
              name="usuario"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={input}
              placeholder="jose"
            />
            <p className="mt-1 text-xs text-muted">
              Con esto entra. Solo letras, números, punto, guion y guion bajo.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-text">
              Contraseña inicial
            </label>
            <input
              id="password"
              name="password"
              type="text"
              required
              minLength={8}
              className={input}
              placeholder="mínimo 8 caracteres"
            />
            <p className="mt-1 text-xs text-muted">
              Se muestra a propósito: tienes que anotarla y entregarla en persona.
              Nadie más podrá verla después.
            </p>
          </div>

          <div>
            <label htmlFor="rol" className="mb-1 block text-sm font-medium text-text">Rol</label>
            <select id="rol" name="rol" value={rol} onChange={(e) => setRol(e.target.value)} className={input}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{ROLES.find((r) => r.id === rol)?.ayuda}</p>
          </div>

          {/* La ficha de vendedor ES el alta del usuario: no hay un registro
              aparte que alguien tenga que crear después y pueda olvidarse. */}
          {rol === "vendedor" && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Datos del vendedor
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pct" className="mb-1 block text-sm font-medium text-text">
                    % Comisión
                  </label>
                  <input
                    id="pct"
                    name="pctComision"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.1"
                    defaultValue={0.5}
                    className={`${input} tabular-nums`}
                  />
                  <p className="mt-1 text-xs text-muted">Sobre sus ventas propias.</p>
                </div>
                <div>
                  <label htmlFor="tipoVend" className="mb-1 block text-sm font-medium text-text">
                    Tipo
                  </label>
                  <select id="tipoVend" name="tipoVendedor" className={input}>
                    <option value="junior">Junior</option>
                    <option value="senior">Senior</option>
                    <option value="otro">Externo</option>
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="telVend" className="mb-1 block text-sm font-medium text-text">
                  Teléfono
                </label>
                <input id="telVend" name="telefonoVendedor" className={input} placeholder="0414-0000000" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="empresa" className="mb-1 block text-sm font-medium text-text">Empresa</label>
            <select id="empresa" name="empresa" className={input} disabled={esOwner}>
              {esOwner ? (
                <option value="">Ambas (Owner)</option>
              ) : (
                Object.values(EMPRESAS).map((e) => (
                  <option key={e.id} value={e.id}>{e.nombreCorto}</option>
                ))
              )}
            </select>
          </div>

          {estado.error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {estado.error}
            </p>
          )}
          {estado.ok && (
            <p role="status" className="rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
              <Icon name="check" size={14} /> {estado.ok}
            </p>
          )}

          <button
            type="submit"
            disabled={pendiente}
            className="h-11 w-full rounded-xl bg-brand-strong text-sm font-semibold text-white transition
                       hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendiente ? "Creando…" : "Crear usuario"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
