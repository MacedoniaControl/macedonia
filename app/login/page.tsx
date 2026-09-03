import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar · Macedonia" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;
  // Solo rutas internas: evita que un enlace externo use el login como trampolín.
  const seguro = destino && destino.startsWith("/") && !destino.startsWith("//") ? destino : "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Macedonia</h1>
          <p className="mt-1.5 text-sm text-muted">Centro de Control</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <LoginForm destino={seguro} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Sumigases Oriente · Sudematin &amp; GM
        </p>
      </div>
    </main>
  );
}
