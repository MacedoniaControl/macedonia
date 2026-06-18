"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { setActiveCompany } from "@/app/auth/company/actions";
import type { SessionCompanyOption } from "@/lib/auth/company-access";

type CompanySwitcherProps = {
  companies: SessionCompanyOption[];
  activeCompanyId: string | null;
  canSeeConsolidated: boolean;
};

export function CompanySwitcher({
  companies,
  activeCompanyId,
  canSeeConsolidated,
}: CompanySwitcherProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"success" | "error" | null>(null);

  async function handleChange(nextCompanyId: string | null) {
    if (isPending || nextCompanyId === activeCompanyId) {
      return;
    }

    setIsPending(true);
    setMessage(null);
    setStatus(null);

    const result = await setActiveCompany(nextCompanyId);

    setMessage(result.message);
    setStatus(result.status);
    setIsPending(false);

    startTransition(() => {
      router.refresh();
    });
  }

  if (companies.length === 0) {
    return (
      <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
        Esta sesion no tiene empresas asignadas.
      </p>
    );
  }

  if (companies.length === 1 && !canSeeConsolidated) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100">
        Empresa fija: <span className="font-semibold">{companies[0]?.name}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canSeeConsolidated ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleChange(null)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeCompanyId === null
                ? "bg-cyan-300 text-slate-950"
                : "border border-white/10 bg-slate-950/70 text-slate-200 hover:border-cyan-300/40"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Consolidado
          </button>
        ) : null}

        {companies.map((company) => (
          <button
            key={company.id}
            type="button"
            disabled={isPending}
            onClick={() => handleChange(company.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              company.id === activeCompanyId
                ? "bg-amber-300 text-slate-950"
                : "border border-white/10 bg-slate-950/70 text-slate-200 hover:border-amber-300/40"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {company.name}
          </button>
        ))}
      </div>

      {message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            status === "success"
              ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border border-rose-300/20 bg-rose-300/10 text-rose-100"
          }`}
        >
          {message}
        </p>
      ) : null}

      {isPending ? (
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
          Actualizando empresa activa...
        </p>
      ) : null}
    </div>
  );
}
