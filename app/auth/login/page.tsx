import { redirect } from "next/navigation";
import { demoAuthUsers } from "@/lib/auth/demo-users";
import { roleLabels } from "@/lib/auth/roles";
import { getPostLoginRoute } from "@/lib/auth/post-login-route";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { LoginForm } from "@/app/auth/login/login-form";

export default async function LoginPage() {
  const currentSession = await getCurrentSessionUser();

  if (currentSession) {
    const destination = getPostLoginRoute(currentSession);
    redirect(destination.route);
  }

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

          <LoginForm returnTo={null} />
        </section>
      </div>
    </main>
  );
}
