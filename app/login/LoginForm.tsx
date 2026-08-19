"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";
import { Icon } from "@/components/ui/Icon";

const inicial: EstadoLogin = { error: null };

export function LoginForm({ destino }: { destino: string }) {
  const [estado, accion, pendiente] = useActionState(entrar, inicial);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="destino" value={destino} />

      <div>
        <label htmlFor="usuario" className="mb-1.5 block text-sm font-medium text-text">
          Usuario
        </label>
        <input
          id="usuario"
          name="usuario"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          placeholder="tu usuario"
          className="h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text
                     outline-none transition placeholder:text-muted
                     focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text
                     outline-none transition placeholder:text-muted
                     focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={16} /></span>
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-strong px-4
                   text-base font-semibold text-white transition
                   hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand/40
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>

      <p className="pt-1 text-center text-xs text-muted">
        ¿Olvidaste tu contraseña? Pídele al administrador que te la restablezca.
      </p>
    </form>
  );
}
