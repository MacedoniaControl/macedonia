# Plan de colaboracion

Este documento define como trabajaran Greeg y Salem con 2 sesiones de Codex y 1 sesion de Claude Code sin pisarse, con integracion rapida y ownership claro.

## Objetivo

- Avanzar en paralelo sin conflictos innecesarios.
- Evitar que varias sesiones editen al mismo tiempo archivos base.
- Integrar cambios pequenos y frecuentes sobre `dev`.
- Mantener trazabilidad por modulo en `docs/progress`.

## Sesiones activas

- `Greeg`: owner principal de Core y reglas base
- `Codex-Greeg`: implementacion tecnica junto a Greeg
- `Claude-Greeg`: checklist, decisiones, criterios de aceptacion y revision
- `Salem`: owner principal de UI y dashboard
- `Codex-Salem`: implementacion tecnica junto a Salem

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

### Greeg + Codex-Greeg

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

Regla:

- si una persona o agente necesita tocar un archivo con candado, lo anuncia antes y lo toma como tarea explicita

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
