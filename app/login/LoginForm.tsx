"use client";

import { useActionState, useState } from "react";
import { entrar, type EstadoLogin } from "./actions";
import { Icon } from "@/components/ui/Icon";

const inicial: EstadoLogin = { error: null };

export function LoginForm({ destino }: { destino: string }) {
  const [estado, accion, pendiente] = useActionState(entrar, inicial);
  // Escribir a ciegas en un teclado de galpón, con guantes, es la primera causa
  // de "no me deja entrar". Poder mirar lo que se escribió evita el intento
  // fallido y el pedido de restablecer la clave.
  const [verClave, setVerClave] = useState(false);

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
        <div className="relative">
          <input
            id="password"
            name="password"
            type={verClave ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="••••••••"
            className="h-12 w-full rounded-xl border border-border-strong bg-surface pl-3.5 pr-12 text-base text-text
                       outline-none transition placeholder:text-muted
                       focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            // No entra en el orden de tabulación: quien navega con teclado va
            // del campo al botón de entrar, sin escalas.
            tabIndex={-1}
            aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={verClave}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl
                       text-muted transition hover:text-text
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Icon name={verClave ? "eye-off" : "eye"} size={18} />
          </button>
        </div>
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
