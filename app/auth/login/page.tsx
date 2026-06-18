import { CompanySwitcher } from "@/app/auth/company/company-switcher";
import { demoAuthUsers } from "@/lib/auth/demo-users";
import { canViewPasswords, getPermissionLabels } from "@/lib/auth/guards";
import { roleLabels } from "@/lib/auth/roles";
import { canSeeConsolidated } from "@/lib/auth/company-access";
import { getActiveCompany } from "@/lib/auth/company-scope";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { LoginForm } from "@/app/auth/login/login-form";
import { LogoutForm } from "@/app/auth/login/logout-form";

export default async function LoginPage() {
  const currentSession = await getCurrentSessionUser();
  const currentPermissionLabels = currentSession
    ? getPermissionLabels(currentSession.role)
    : [];
  const resolvedActiveCompany = currentSession
    ? await getActiveCompany(currentSession)
    : null;
  const activeCompany = currentSession?.companies.find((company) => {
    return company.id === currentSession.activeCompanyId;
  });

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(7,12,22,0.92))] p-8 shadow-2xl shadow-black/20">
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-amber-200/75">
              Auth Roles
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Acceso interno de SumiControl
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-300/80 sm:text-base">
              Este login es la base del modulo `feature/auth-roles`. Valida
              credenciales demo y deja lista la ruta para conectar sesiones
              reales con Prisma, roles, permisos y selector multiempresa.
            </p>
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-amber-300/15 bg-amber-200/8 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-amber-100/75">
              Reglas activas
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-200/80">
              <li>Login propio. No se usa NextAuth en esta fase.</li>
              <li>
                Owner y Admin podran ver contrasenas visibles con auditoria.
              </li>
              <li>
                Owner y Admin podran cambiar entre Sumigases y Sudematin.
              </li>
            </ul>
          </div>

          {currentSession ? (
            <div className="mt-8 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/10 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-100/75">
                Sesion detectada
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-100/85">
                {currentSession.fullName} · {currentSession.role} ·{" "}
                {activeCompany?.name ??
                  (currentSession.activeCompanyId === null
                    ? "Consolidado"
                    : "Sin empresa activa")}
                .
              </p>
              <p className="mt-2 text-sm text-slate-300/80">
                {canViewPasswords(currentSession.role)
                  ? "Este rol puede ver contrasenas visibles con auditoria."
                  : "Este rol no puede ver contrasenas visibles."}
              </p>
              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Prueba temporal de company selector
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-200/80">
                  Scope server resuelto:{" "}
                  {resolvedActiveCompany?.name ??
                    (currentSession.activeCompanyId === null
                      ? "Consolidado"
                      : "Sin empresa valida")}
                  .
                </p>
                <div className="mt-4">
                  <CompanySwitcher
                    companies={currentSession.companies}
                    activeCompanyId={currentSession.activeCompanyId}
                    canSeeConsolidated={canSeeConsolidated(currentSession.role)}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {currentSession.companies.map((company) => (
                  <span
                    key={company.id}
                    className="rounded-full border border-cyan-300/20 bg-cyan-950/50 px-3 py-1 text-xs text-cyan-100/85"
                  >
                    {company.name}
                    {company.id === currentSession.activeCompanyId ? " · activa" : ""}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {currentPermissionLabels.map((permission) => (
                  <span
                    key={permission.key}
                    className="rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-200/85"
                  >
                    {permission.label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-300/60">
                fuente: {currentSession.source}
              </p>
              <LogoutForm />
            </div>
          ) : null}

          <div className="mt-8 grid gap-4">
            {demoAuthUsers.map((user) => (
              <article
                key={user.email}
                className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4"
              >
                <p className="text-sm font-semibold text-white">{user.fullName}</p>
                <p className="mt-1 text-sm text-slate-300/75">
                  {roleLabels[user.role]} ·{" "}
                  {user.companies.map((company) => company.name).join(" + ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300/75">
                  <span className="rounded-full bg-slate-900/80 px-3 py-1">
                    usuario: {user.username}
                  </span>
                  <span className="rounded-full bg-slate-900/80 px-3 py-1">
                    clave: {user.password}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/85 p-8 shadow-2xl shadow-black/20">
          <div className="mb-6 space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-100/70">
              Demo usable
            </p>
            <h2 className="text-2xl font-semibold text-white">
              Validar acceso con usuarios seed
            </h2>
            <p className="text-sm leading-7 text-slate-300/75">
              Usa un correo o usuario demo. La siguiente iteracion conectara
              este flujo a base de datos, sesiones y permisos por ruta.
            </p>
          </div>

          <LoginForm />
        </section>
      </div>
    </main>
  );
}
