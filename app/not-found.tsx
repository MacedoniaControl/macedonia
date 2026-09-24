import Link from "next/link";

// Pagina que no existe. La de Next no tenia salida: habia que borrar la
// direccion a mano. "/" lleva a cada quien a su inicio (o al login).
export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-muted">Error 404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">Esta página no existe</h1>
        <p className="mt-2 text-sm text-muted">Puede que el enlace esté viejo o mal escrito.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-medium hover:brightness-95">
          {/* El color va en el span: la regla global `a { color: inherit }` le gana a text-white en el enlace. */}
          <span className="text-white">Ir al inicio</span>
        </Link>
      </div>
    </main>
  );
}
