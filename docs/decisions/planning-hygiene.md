# Propuesta — Higiene del planning (quitar lo innecesario)

> Estado: **PROPUESTA para revisión de Greeg.** No ejecuta cambios todavía; solo documenta el plan.
> Autor: Claude-Greeg.

## Problema

Las reglas viven hoy en **dos lugares**: el planning gigante (`docs/planning/sumicontrol-planning.md`,
~1533 líneas) **y** los `docs/decisions/*`. Eso duplica contenido y crea ambigüedad sobre cuál manda.

## Principio: una sola fuente de verdad por tema

| Tipo de contenido | Fuente única (autoridad) |
|---|---|
| Reglas de negocio | `docs/decisions/*` |
| Modelo de datos | `prisma/schema.prisma` |
| Colaboración / ramas / Vercel | `docs/collaboration-plan.md`, `docs/deployment/*` |
| Checklists por feature | `docs/checklists/*` |
| Contratos de componentes/integración | `docs/contracts/*` |
| Estado/fechas/avance | `docs/status/*`, `docs/progress/*` |
| Demo | `docs/demo/*` |
| Visión / alcance / índice | `docs/planning/sumicontrol-planning.md` (adelgazado) |

El planning deja de contener reglas; solo **enlaza** a su fuente.

## Duplicaciones detectadas (a recortar del planning)

| Sección del planning | Ya cubierto en | Acción |
|---|---|---|
| §6 Contraseñas | `decisions/security-passwords.md` | enlazar, quitar texto |
| §10 Multiempresa | `decisions/company-scope.md` | enlazar, quitar texto |
| §11 Roles | `decisions/roles-permissions.md` | enlazar, quitar texto |
| §18 Inventario | `decisions/inventory-rules.md` | enlazar, quitar texto |
| §21 Cilindros | `decisions/cylinder-rules.md` | enlazar, quitar texto |
| §22 Caja/pagos | `decisions/payments-cash.md` | enlazar, quitar texto |
| §26 Moneda/IVA | `decisions/currency-tax-rate.md` | enlazar, quitar texto |
| §27 Documentos | `decisions/documents-correlativos.md` | enlazar, quitar texto |
| §28 ROI | `decisions/roi-rentability.md` | enlazar, quitar texto |
| §8–9 Ramas / división por agentes | `collaboration-plan.md` | enlazar, quitar texto |
| §13 Dashboard (detalle) | `checklists/feature-dashboard.md` | enlazar, quitar texto |
| §15 Importador (detalle) | `checklists/*` / decisiones futuras | resumir + enlazar |
| §31 Modelo de datos | `prisma/schema.prisma` | enlazar, quitar prosa |
| §32 Plan por días (fechas pasadas) | — | **archivar** en `docs/status/` como histórico |
| §33 Checklist de demo | `demo/guion-demo.md` | enlazar, quitar texto |

## Estructura propuesta del planning adelgazado (~150 líneas)

```text
1. Resumen ejecutivo
2. Objetivo y alcance (qué es / qué NO es)
3. Prioridades
4. Stack y repos
5. Fuente de verdad  ← tabla de enlaces a decisions/contracts/checklists/prisma
6. Estado actual      ← enlace a docs/status del día
```

Todo lo demás se recorta o se mueve, sin perder información (el detalle ya vive en su doc canónico).

## Qué NO se hace

- No se borra ninguna regla: solo se eliminan **copias** y cada tema apunta a su doc canónico.
- No se tocan reglas de negocio, modelo de datos, ni código.
- No se modifican ramas ajenas; el cambio es doc-only en una rama puntual + PR.

## Plan de ejecución (si Greeg aprueba)

1. Crear rama `docs/planning-hygiene`.
2. Adelgazar `sumicontrol-planning.md` a la estructura de arriba (con la tabla "Fuente de verdad").
3. Archivar §32 (plan por días) en `docs/status/2026-planning-dias-historico.md`.
4. Añadir en cada `decisions/*` y `collaboration-plan.md` una nota "Fuente de verdad de: <tema>".
5. PR a `dev` para revisión.

## Beneficio

- Cero ambigüedad sobre qué documento manda.
- Planning legible en 2 min; el detalle, en su doc.
- Menos riesgo de que dos sesiones editen reglas en sitios distintos.
