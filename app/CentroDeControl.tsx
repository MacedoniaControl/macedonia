// Centro de Control Estratégico: elegir empresa. Solo se ve CON sesión.
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { EMPRESAS, EMPRESA_IDS } from "@/lib/ux/empresas";
import { getHistory } from "@/lib/ux/history-data";
import { fmtUsd } from "@/lib/ux/format";

const consolidado = getHistory("all").totals;

export function CentroDeControl() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Fondo: halo naranja (Sumigases) a la izquierda + azul (Sudematin) a la derecha */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(48rem_26rem_at_-8%_-6%,rgba(234,106,30,0.16),transparent),radial-gradient(48rem_26rem_at_108%_-6%,rgba(42,42,140,0.20),transparent)]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-white">M</span>
            <span className="font-semibold text-text">Macedonia</span>
          </span>
          <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted sm:block">
            Sumigases Oriente · Sudematin
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12">
          <div className="text-center">
            <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-text sm:text-5xl">
              Centro de Control Estratégico
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Elige la empresa para entrar a su panel. Cada una opera por separado — inventario,
              cilindros, ventas, cotizaciones y rentabilidad — con sus propios números.
            </p>
          </div>

          {/* Dos puertas: una por empresa */}
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {EMPRESA_IDS.map((id) => {
              const emp = EMPRESAS[id];
              const t = getHistory(id).totals;
              return (
                <Link
                  key={id}
                  href={`/admin/${id}/dashboard`}
                  className={`theme-${id} group flex flex-col rounded-2xl border-2 border-border bg-surface p-6 shadow-sm transition hover:border-brand hover:shadow-md focus-visible:border-brand`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--color-brand-soft)" }}>
                      <img src={emp.logo} alt="" className="h-8 w-auto max-w-[40px] object-contain" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-text">{emp.nombreCorto}</p>
                      <p className="text-xs text-muted">{emp.nombre} · RIF {emp.rif}</p>
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-3">
                    <div className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted">Ventas hist.</dt>
                      <dd className="truncate text-base font-semibold tabular-nums text-text">{fmtUsd(t.venta)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted">Margen</dt>
                      <dd className="text-base font-semibold tabular-nums text-text">{t.margen}%</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted">ROI</dt>
                      <dd className="text-base font-semibold tabular-nums text-ok">{t.roi}%</dd>
                    </div>
                  </dl>

                  <span className="mt-6 inline-flex items-center gap-2 self-start rounded-xl bg-brand-strong px-4 py-2.5 text-sm font-medium text-white transition group-hover:brightness-90">
                    <Icon name="dashboard" size={16} />
                    Entrar al Dashboard de {emp.nombreCorto}
                    <span className="transition group-hover:translate-x-0.5"><Icon name="chevronRight" size={16} /></span>
                  </span>
                </Link>
              );
            })}
          </div>

        </section>
      </div>
    </main>
  );
}
