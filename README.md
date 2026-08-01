# Macedonia / SumiControl

**Macedonia** (marca visible) es el sistema operativo de **Sumigases Oriente C.A.** y **Sudematin & GM**:
inventario, cilindros, cotizaciones, notas de entrega y rentabilidad, conciliado con Valery
(el sistema fiscal). Internamente el proyecto se sigue llamando **SumiControl**.

App: https://sumicontrol.vercel.app

## Documentacion base

- **📐 [BLUEPRINT](./docs/planning/BLUEPRINT.md)** — el plano completo del sistema: arquitectura,
  modelo de dominio, reglas de negocio, sistema de diseño, integración con Valery y cómo migrar a
  backend. **Empieza aquí para replicar o reconstruir el proyecto.**
- **🧩 [Prompt para una app nueva](./docs/planning/PROMPT-NUEVA-APP.txt)** — el blueprint
  convertido en prompt listo para pegar en Claude Code y construir otro sistema con estas lecciones.
- **⭐ [Estado del proyecto](./docs/planning/project_state.md)** — dónde estamos hoy, módulos,
  pendientes y riesgos. Mantener actualizado ante cada cambio significativo.
- Planning original (histórico): [PLANNING.md](./PLANNING.md)
- Planning detallado: [docs/planning/sumicontrol-planning.md](./docs/planning/sumicontrol-planning.md)
- Plan de colaboracion: [docs/collaboration-plan.md](./docs/collaboration-plan.md)
- Prompts de arranque: [docs/prompts](./docs/prompts)
- Decisiones clave: [docs/decisions](./docs/decisions)
- Seguimiento por modulo: [docs/progress](./docs/progress)
- Prompt maestro de coordinacion: [docs/prompts/master-agent-prompt.md](./docs/prompts/master-agent-prompt.md)

## Stack

**Hoy (demo funcional):** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Recharts · Vercel. Estado en `localStorage`, sin backend.

**Siguiente fase:** Supabase (Postgres + Auth + Storage + RLS) con login propio usuario/contraseña.
Ver [BLUEPRINT §9](./docs/planning/BLUEPRINT.md).

## Flujo de trabajo

No trabajar directo sobre `main`.

```text
feature/* -> dev -> main
```

Cada modulo debe mantener actualizado su archivo en `docs/progress`.
