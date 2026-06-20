import { CompanySwitcher } from "@/app/auth/company/company-switcher";
import { LogoutForm } from "@/app/auth/login/logout-form";
import { getCompanySelectorState } from "@/lib/auth/company-selector-state";
import { canViewPasswords, getPermissionLabels } from "@/lib/auth/guards";
import { roleLabels } from "@/lib/auth/roles";

export default async function AuthSessionPage() {
  const companySelectorState = await getCompanySelectorState();
  const currentSession = companySelectorState.session;
  const currentPermissionLabels = getPermissionLabels(currentSession.role);

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(7,12,22,0.92))] p-8 shadow-2xl shadow-black/20">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-100/70">
            Sesion activa
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
            Handoff temporal antes del admin real
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300/80 sm:text-base">
            Esta pantalla evita 404 mientras `app/admin` no exista en esta rama.
            Usa el mismo contrato que luego consumira el layout administrativo:
            sesion, empresa activa, permisos y cambio de empresa server-side.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <article className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/10 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-100/75">
                Contexto resuelto
              </p>
              <div className="mt-4 space-y-2 text-sm leading-7 text-slate-100/85">
                <p>
                  {currentSession.fullName} · {roleLabels[currentSession.role as keyof typeof roleLabels] ?? currentSession.role}
                </p>
                <p>Email: {currentSession.email}</p>
                <p>
                  Empresa activa: {companySelectorState.activeCompanyLabel}
                </p>
                <p>Fuente: {currentSession.source}</p>
              </div>
              <p className="mt-4 text-sm text-slate-300/80">
                {canViewPasswords(currentSession.role)
                  ? "Este rol puede ver contrasenas visibles con auditoria."
                  : "Este rol no puede ver contrasenas visibles."}
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-200/70">
                Cambio de empresa
              </p>
              <div className="mt-4">
                <CompanySwitcher
                  companies={companySelectorState.companies}
                  activeCompanyId={companySelectorState.activeCompanyId}
                  canSeeConsolidated={companySelectorState.canSeeConsolidated}
                />
              </div>
            </article>
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-200/70">
              Permisos activos
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {currentPermissionLabels.map((permission) => (
                <span
                  key={permission.key}
                  className="rounded-full bg-slate-900/80 px-3 py-1 text-xs text-slate-200/85"
                >
                  {permission.label}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="/auth/login"
              className="rounded-full border border-white/15 bg-slate-950/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
            >
              Volver al login
            </a>
            <LogoutForm />
          </div>
        </section>
      </div>
    </main>
  );
}
