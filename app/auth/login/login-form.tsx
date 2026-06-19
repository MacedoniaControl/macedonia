"use client";

import { useActionState } from "react";
import { authenticateUser } from "@/app/auth/login/actions";
import type { LoginFormState } from "@/app/auth/login/actions";

const initialLoginFormState: LoginFormState = {
  status: "idle",
  message: "",
};

type LoginFormProps = {
  returnTo?: string | null;
};

export function LoginForm({ returnTo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    authenticateUser,
    initialLoginFormState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input name="returnTo" type="hidden" value={returnTo ?? ""} />
      <div className="space-y-2">
        <label
          className="text-sm font-medium tracking-wide text-slate-200/80"
          htmlFor="identifier"
        >
          Usuario o correo
        </label>
        <input
          id="identifier"
          name="identifier"
          placeholder="owner o owner@sumicontrol.local"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-amber-300/40"
        />
      </div>

      <div className="space-y-2">
        <label
          className="text-sm font-medium tracking-wide text-slate-200/80"
          htmlFor="password"
        >
          Contrasena
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="owner123"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-amber-300/40"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "Validando acceso..." : "Entrar al demo"}
      </button>

      {state.message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            state.status === "success"
              ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border border-rose-300/20 bg-rose-300/10 text-rose-100"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
          fuente de autenticacion: {state.source ?? "desconocida"}
        </p>
      ) : null}
    </form>
  );
}
