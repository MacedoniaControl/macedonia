// Lo que se ve mientras llega una sección del panel.
//
// Sin este archivo, tocar otro apartado del menú dejaba la pantalla anterior
// quieta hasta que el servidor respondía: parecía que el clic no había hecho
// nada. Con él, Next.js cambia al instante a este esqueleto (y lo deja listo
// de antemano al precargar los enlaces), y la sección llega encima.

export default function Cargando() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Cargando la sección">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
        <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="h-12 animate-pulse rounded-xl border border-border bg-surface" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-border bg-surface" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
