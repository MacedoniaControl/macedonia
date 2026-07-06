import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

const pilares = [
  { icon: "dashboard" as const, t: "Visión ejecutiva", d: "KPIs, ROI y gráficas dinámicas con cifras reales del negocio." },
  { icon: "cylinder" as const, t: "Cilindros y recargas", d: "Estados, intercambios y pendientes por retorno bajo control." },
  { icon: "cash" as const, t: "Finanzas claras", d: "Caja, cobros, pagos y cartera con verificación por método." },
];

const metricas = [
  { v: "$310.865", l: "ventas 2024" },
  { v: "48%", l: "margen bruto" },
  { v: "53,3%", l: "ROI general" },
  { v: "2", l: "empresas" },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Fondo elegante: gradiente navy + halo de marca */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_80%_-10%,rgba(234,106,30,0.14),transparent),radial-gradient(50rem_28rem_at_-10%_110%,rgba(18,58,107,0.18),transparent)]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-white">S</span>
            <span className="font-semibold text-text">SumiControl</span>
          </span>
          <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted sm:block">
            Sumigases Oriente · Sudematin
          </span>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-text sm:text-6xl">
            El control operativo de <span className="text-brand">Sumigases</span>, en una sola plataforma
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            Inventario, cilindros, ventas, cotizaciones, caja y rentabilidad — diseñado a la medida
            del negocio de gases industriales, no un ERP genérico.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/admin/dashboard"><Button icon="dashboard">Entrar al panel</Button></Link>
            <Link href="/admin/roi"><Button variant="secondary" icon="roi">Ver rentabilidad</Button></Link>
          </div>

          <dl className="mt-14 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
            {metricas.map((m) => (
              <div key={m.l} className="bg-surface px-4 py-5">
                <dt className="text-xs uppercase tracking-wide text-muted">{m.l}</dt>
                <dd className="mt-1 text-2xl font-semibold text-text">{m.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="grid gap-4 pb-10 sm:grid-cols-3">
          {pilares.map((p) => (
            <div key={p.t} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon name={p.icon} />
              </span>
              <h2 className="mt-3 text-base font-semibold text-text">{p.t}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">{p.d}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
