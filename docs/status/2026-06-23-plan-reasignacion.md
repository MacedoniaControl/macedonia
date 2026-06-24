# Plan de reasignación y prioridades — 2026-06-23

> Autor: Claude-Greeg (planning + coordinación). Reemplaza la planificación operativa vigente
> tras el retiro de `Codex-Greeg`. Sustituye al diagnóstico `2026-06-16-diagnostico.md` en lo
> referente a quién hace qué.

## Cambio de contexto

- `Codex-Greeg` se retira. Quedan como **implementadores**: `Salem` + `Codex-Salem` (y `Greeg`).
- `Claude-Greeg` = planning + coordinación (no escribe código).
- Throughput de implementación se reduce ⇒ hay que **priorizar** y **reasignar** lo huérfano.

## Estado real por módulo

| Módulo / rama | Estado | Owner anterior | Owner propuesto |
|---|---|---|---|
| `feature/auth-roles` | Código avanzado (login, sesión, guards, schema) — **huérfano**, local sin pushear | Codex-Greeg | **Reasignar** (Codex-Salem o Greeg) |
| `feature/company-selector` | Avanzado (scope server, `setActiveCompany`, resolver post-login, selector temporal) — huérfano | Codex-Greeg | **Reasignar** (Codex-Salem o Greeg) |
| `feature/ui-system` + `feature/dashboard` | En curso por Salem; capa UX/UI ya en vivo (patch) | Salem | Salem / Codex-Salem |
| products, inventory, cilindros, quotes/NE, pos, cash, CxC/CxP, compras, reportes, ROI, imports, settings, audit | Sin código; con **checklists/decisiones/mocks** listos | — | Cola, asignar por prioridad |

## Reasignación inmediata (decisión de Greeg)

1. **Lo más urgente:** decidir quién termina el código huérfano de auth + company-selector. Está
   casi listo; solo falta integrarlo en `/admin` (consumir `getCompanySelectorState()` y
   `getActiveCompany()`, quitar el selector temporal de `/auth/login`). Propongo: **Codex-Salem**,
   ya que toca el header/layout que Salem controla.
2. **Preservar ese código:** hoy solo está local en `feature/company-selector`. **Pushear ya**
   (`git push -u origin feature/company-selector`) para no perderlo.

## Orden de prioridad sugerido (MVP)

1. Integrar **auth + selector de empresa** en `/admin` (cierra el flujo de entrada).
2. **Dashboard real** consumiendo empresa activa (hoy la UI vive con mock; conectar `getActiveCompany`).
3. **Productos + inventario** (catálogo real 2024 ya está en `docs/data/`).
4. **Cilindros y recargas** (diferencial del negocio).
5. **Cotizaciones → notas de entrega → POS** (flujo comercial; NE = punto único de descuento).
6. **Caja, CxC/CxP, compras**.
7. **Reportes + ROI** (data y matriz reales ya disponibles).
8. **Importaciones** (flujo guiado ya diseñado).

## Riesgos / decisiones abiertas que bloquean

- **A1 (seguridad):** la sesión demo es falsificable — cerrar antes de uso real (ver `docs/reviews/feature-auth-roles-review.md`).
- **`app/admin`** no existe en la rama de auth: el redirect post-login degrada a `/auth/session`.
  Al integrar con la UI de Salem, conectar rutas `/admin/*` reales.
- **Reconciliar** el patch UX (`patch/greeg-ux-ui`, en producción) con `feature/ui-system` de Salem
  para no mantener dos sistemas de UI.
- **Vista consolidada** en MVP: ¿activa o solo preparada? (pendiente de Greeg).
- **Vercel Hobby:** sin miembros y sin deploy por CLI; flujo = push GitHub + `vercel promote`.

## Acciones inmediatas

- [ ] Greeg: pushear `feature/company-selector` (preserva el código huérfano + la higiene del planning).
- [ ] Greeg: agregar a `salemtawil` (Write) en GitHub.
- [ ] Greeg: confirmar quién implementa auth/company-selector y vista consolidada en MVP.
- [ ] Claude-Greeg: cuando se confirmen owners, bajar a checklist el siguiente módulo de la cola.
