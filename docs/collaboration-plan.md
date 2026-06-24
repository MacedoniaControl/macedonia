# Plan de colaboracion

Este documento define como trabajaran las sesiones activas sin pisarse, con integracion rapida y ownership claro.

> **Actualizacion 2026-06-23:** la cuenta `Codex-Greeg` se retira (no se renueva). `Claude-Greeg`
> **asume el planning y la coordinacion general** del repo (ramas, integracion a `dev`, avisos,
> docs/decisions, docs/progress, higiene del planning). `Claude-Greeg` no escribe codigo de
> implementacion; coordina y prepara el trabajo para las sesiones que sí implementan.

## Objetivo

- Avanzar en paralelo sin conflictos innecesarios.
- Evitar que varias sesiones editen al mismo tiempo archivos base.
- Integrar cambios pequenos y frecuentes sobre `dev`.
- Mantener trazabilidad por modulo en `docs/progress`.

## Sesiones activas

- `Greeg`: owner del producto y decisiones finales
- `Claude-Greeg`: **planning + coordinacion general** (decisiones, checklists, criterios de
  aceptacion, revision, ramas, integracion a `dev`, avisos). No escribe codigo de implementacion.
- `Salem`: owner principal de UI y dashboard
- `Codex-Salem`: implementacion tecnica junto a Salem
- ~~`Codex-Greeg`~~: **retirada (2026-06-23)**. Su planning lo asume `Claude-Greeg`; el codigo que
  dejo (auth-roles, company-selector) queda para reasignar a una sesion que implemente.

## Ramas oficiales

```text
main   -> demo estable / referencia
dev    -> integracion diaria
feature/* -> trabajo por modulo
```

Regla principal:

- Nadie trabaja directo en `main`.
- Nadie desarrolla directo en `dev`.
- Todo cambio funcional nace en una rama `feature/*`.

## Reparto recomendado

### Core / auth (coordina Claude-Greeg; implementa Greeg o sesion asignada)

> Antes a cargo de `Codex-Greeg` (retirada). El planning/coordinacion lo lleva `Claude-Greeg`;
> la implementacion de estas ramas debe reasignarse.

Ramas:

- `feature/auth-roles`
- `feature/company-selector`
- `feature/settings`
- `feature/audit-logs`

Ownership principal:

- `prisma/`
- `lib/auth/`
- `lib/permissions/`
- `lib/audit/`
- `app/auth/`
- configuracion base de usuarios, roles y empresas

Responsabilidades:

- login propio
- roles y permisos
- selector de empresa Sumigases / Sudematin
- configuracion base
- auditoria minima
- semillas iniciales relacionadas con usuarios y empresas

### Salem + Codex-Salem

Ramas:

- `feature/ui-system`
- `feature/dashboard`
- `feature/reports`

Ownership principal:

- `components/ui/`
- `components/layout/`
- `components/dashboard/`
- `components/charts/`
- `app/admin/`
- `app/globals.css`

Responsabilidades:

- layout administrativo
- sidebar y header
- sistema visual base
- dashboard principal
- KPIs
- reportes basicos
- responsive desktop y tablet

### Claude-Greeg

Claude-Greeg no debe arrancar editando al mismo tiempo archivos compartidos de infraestructura salvo que se le asigne explicitamente una rama aislada.

Uso recomendado:

- convertir modulos del planning en checklists concretos
- redactar criterios de aceptacion por feature
- aterrizar reglas de negocio en `docs/decisions`
- preparar data mock y seeds propuestas
- revisar PRs o diffs antes de mergear a `dev`
- documentar flujos operativos y casos borde

Si Claude va a escribir codigo:

- asignarle una sola rama puntual
- evitar al inicio `prisma/schema.prisma`, `app/layout.tsx`, `app/globals.css` y `components/ui/*`

## Candados de archivos

Estos archivos o carpetas no deben ser tocados por varias sesiones a la vez sin aviso previo:

- `prisma/schema.prisma`
- `app/layout.tsx`
- `app/globals.css`
- `components/ui/*`
- `components/layout/*`
- `lib/auth/*`
- `lib/permissions/*`
- `package.json`
- `package-lock.json`
- `vercel.json`
- `docs/collaboration-plan.md`
- `PLANNING.md`
- `docs/planning/sumicontrol-planning.md`

Regla:

- si una persona o agente necesita tocar un archivo con candado, lo anuncia antes y lo toma como tarea explicita

## Candado duro por owner

Estas zonas no se modifican sin aprobacion del owner responsable:

- `Greeg + Codex-Greeg`: `prisma/`, `lib/auth/`, `lib/permissions/`, `lib/audit/`, `app/auth/`, `package.json`, `package-lock.json`
- `Salem + Codex-Salem`: `app/admin/`, `components/ui/`, `components/layout/`, `components/dashboard/`, `components/charts/`, `app/globals.css`
- `Solo Greeg`: `main`, `dev`, Vercel, variables de entorno, `vercel.json`, `PLANNING.md`, `docs/planning/sumicontrol-planning.md`, `docs/collaboration-plan.md`

## Reglas obligatorias de bloqueo

Cuando un archivo o carpeta tenga candado duro:

1. No se modifica por intuicion ni por conveniencia.
2. No se hacen refactors globales, renombres masivos ni formateos amplios en esa zona.
3. No se actualizan dependencias ni lockfiles si no forman parte del objetivo directo de la rama.
4. No se mezcla en el mismo commit trabajo propio con cambios sobre zona bloqueada de otro owner.
5. No se abre una segunda sesion tocando al mismo tiempo el mismo candado.

Si alguien necesita tocar una zona bloqueada de otro owner, el proceso es obligatorio:

1. Avisar antes en el chat y en `docs/progress/feature-*.md`.
2. Indicar archivo exacto, motivo y alcance pequeno.
3. Esperar confirmacion del owner o handoff explicito.
4. Hacer el cambio minimo posible.
5. Avisar al cerrar que ya libero el candado.

## Cambios expresamente prohibidos sin permiso

- Cambiar `prisma/schema.prisma` mientras otra sesion trabaja auth o company selector.
- Cambiar `app/globals.css` o `components/ui/*` mientras Salem tenga abierto `feature/ui-system` o `feature/dashboard`.
- Cambiar `package.json`, `package-lock.json` o `vercel.json` sin avisar a todo el equipo.
- Hacer deploy a `dev` o `main` sin que Greeg lo coordine.
- Reemplazar o reescribir planning, collaboration plan o prompts base sin avisarlo antes.

## Regla de ownership

Cada rama tiene un solo duenio tecnico.

Eso significa:

- Greeg decide el enfoque en sus ramas y `Codex-Greeg` implementa con el
- Salem decide el enfoque en sus ramas y `Codex-Salem` implementa con el
- `Claude-Greeg` revisa o prepara contexto, pero no entra a editar lo mismo al mismo tiempo

## Flujo diario recomendado

### Inicio del dia

1. Revisar `dev`.
2. Revisar `docs/collaboration-plan.md`.
3. Elegir la rama del modulo a trabajar.
4. Leer el archivo correspondiente en `docs/progress/`.
5. Definir un objetivo pequeno para ese bloque.

### Durante el trabajo

1. Trabajar solo en la rama del modulo.
2. No mezclar varios modulos en un mismo commit.
3. Actualizar el archivo `docs/progress/feature-*.md`.
4. Si se toca un archivo con candado, avisarlo antes.

### Antes de mergear a `dev`

1. `git fetch origin`
2. `git rebase origin/dev`
3. correr `npm run build`
4. correr `npm run lint`
5. probar el flujo principal afectado
6. actualizar `docs/progress/feature-*.md`

### Integracion

- Integrar a `dev` 1 o 2 veces por dia.
- No acumular ramas gigantes.
- Si una rama toca base compartida, mergearla temprano.

## Deploy y Vercel

- Vercel owner: `Greeg`
- Repo objetivo: `Sumi`
- Panel objetivo: `https://vercel.com/pantera95s-projects`
- Flujo de deploy documentado en `docs/deployment/vercel-workflow.md`

Reglas:

- `feature/*`: preview opcional
- `dev`: staging compartido
- `main`: produccion
- Solo Greeg o una sesion coordinada por Greeg cambia env vars o configuracion del proyecto

## Avisos entre sesiones

- Cada cambio relevante debe reflejarse en `docs/progress/feature-*.md`
- Cada cambio relevante debe anunciarse con mensaje corto al resto
- Si hay handoff, debe incluir que esta hecho, que falta y que no tocar
- Protocolo documentado en `docs/communication/update-protocol.md`
- Plantillas listas en:
  - `docs/communication/update-message-template.txt`
  - `docs/communication/handoff-template.txt`

## Orden recomendado de ejecucion

Este orden minimiza bloqueos entre ustedes:

1. `feature/auth-roles`
2. `feature/company-selector`
3. `feature/ui-system`
4. `feature/dashboard`
5. `feature/products-catalog`
6. `feature/inventory`
7. `feature/cylinders`
8. `feature/quotes-delivery-notes`
9. `feature/pos-sales`
10. `feature/cash-payments`
11. `feature/receivables-payables`
12. `feature/purchases`
13. `feature/reports`
14. `feature/roi-rentabilidad`
15. `feature/imports-valery-profit`
16. `feature/settings`
17. `feature/audit-logs`

## Asignacion inmediata sugerida

Para arrancar hoy:

- Greeg + `Codex-Greeg`: `feature/auth-roles`
- Salem + `Codex-Salem`: `feature/ui-system`
- `Claude-Greeg`: bajar a checklist `feature/company-selector` y `feature/dashboard`, mas decisiones pendientes en `docs/decisions`

Asi ustedes avanzan en paralelo sin tocar todavia el mismo centro de gravedad.

## Formato minimo de avance

Cada modulo debe mantener:

- estado actual
- ultimo cambio realizado
- siguiente paso
- bloqueo, si existe

Plantilla simple:

```md
## Estado
En progreso

## Ultimo cambio
Se monto la estructura inicial del modulo.

## Siguiente paso
Conectar datos y flujo principal.

## Bloqueos
Esperando decision sobre permisos o modelo de datos.
```

## Mensaje corto para pasar a cada sesion

### Para Codex-Greeg

```text
Trabaja solo sobre la rama de esta feature. No toques archivos compartidos fuera de su ownership salvo que sea estrictamente necesario. Antes de cerrar, actualiza docs/progress de la feature y valida build + lint.
```

### Para Codex-Salem

```text
Trabaja solo sobre la rama de esta feature. No toques archivos compartidos fuera de su ownership salvo que sea estrictamente necesario. Antes de cerrar, actualiza docs/progress de la feature y valida build + lint.
```

### Para Claude-Greeg

```text
No edites archivos base compartidos salvo instruccion explicita. Prioriza acceptance criteria, reglas de negocio, checklist funcional, decisiones tecnicas y revision de cambios para reducir conflictos entre ramas.
```

## Criterio de exito

El esquema esta funcionando bien si:

- cada sesion sabe que carpeta y rama le pertenecen
- `dev` recibe cambios pequenos y probados
- los conflictos se reducen a integraciones puntuales
- `docs/progress` refleja el estado real del proyecto
