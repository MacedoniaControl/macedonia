# Planning — SumiControl

> **Higiene 2026-06-23 (Claude-Greeg):** este planning quedó adelgazado a **visión + índice**.
> Las reglas de negocio, el modelo de datos y los flujos detallados **ya no se describen aquí**;
> viven en su documento canónico (ver §5 Fuente de verdad). El detalle extenso previo (specs por
> módulo, plan día por día, checklist de demo) está preservado en el **historial de git** y en los
> docs enlazados. Regla: **una sola fuente de verdad por tema.**

## 1. Resumen ejecutivo

SumiControl es una plataforma SaaS **interna** para Sumigases Oriente C.A. y Sudematin: control
administrativo, inventario por empresa/almacén, ventas internas, cotizaciones, notas de entrega,
cilindros y recargas, caja, compras, cuentas por cobrar/pagar, reportes, ROI e importación de datos
(Excel / Valery / Profit).

No es e-commerce ni tienda pública. Es una herramienta operativa para dueños, administradores,
cajeros, vendedores, almacén y personal interno.

## 2. Objetivo y alcance

- **Objetivo:** demo avanzada usable parcialmente, con data real donde exista y simulada donde falte.
- **Es:** control interno, operativo y administrativo, modular y multiempresa.
- **No es:** e-commerce, tienda pública, portal de referidos, ni WhatsApp como flujo central.
- Alice queda postergado como producto neutral futuro; la arquitectura debe permitir reutilización.

## 3. Prioridades

1. Dashboard administrativo y KPIs.
2. Productos, catálogo e inventario por almacén.
3. Cilindros y recargas.
4. Cotizaciones, notas de entrega y POS interno.
5. Caja, cuentas por cobrar/pagar y compras.
6. Reportes, ROI e importaciones.
7. Configuración, roles/permisos y auditoría mínima.

## 4. Stack y repositorios

- Next.js · TypeScript · Tailwind CSS · Prisma · PostgreSQL/Supabase · Supabase Storage · Vercel.
- Login propio (usuario + contraseña). No NextAuth en esta fase.
- Repo: `https://github.com/Pantera95/Sumi` (flujo `feature/* -> dev -> main`).

## 5. Fuente de verdad (índice)

> Cada tema se mantiene en UN solo documento. El planning solo enlaza; no duplica.

| Tema | Documento canónico |
|---|---|
| Multiempresa / scope de empresa | `docs/decisions/company-scope.md` |
| Roles y permisos | `docs/decisions/roles-permissions.md` |
| Contraseñas (riesgo aceptado) | `docs/decisions/security-passwords.md` |
| Inventario | `docs/decisions/inventory-rules.md` |
| Cilindros y recargas | `docs/decisions/cylinder-rules.md` |
| Caja, pagos y verificación | `docs/decisions/payments-cash.md` |
| Moneda, tasa BCV e IVA | `docs/decisions/currency-tax-rate.md` |
| Documentos y correlativos | `docs/decisions/documents-correlativos.md` |
| ROI / Rentabilidad | `docs/decisions/roi-rentability.md` |
| Higiene del planning | `docs/decisions/planning-hygiene.md` |
| Redirect post-login | `docs/contracts/post-login-redirect.md` |
| Contrato del selector de empresa | `docs/contracts/company-selector-component.md` |
| Checklist dashboard | `docs/checklists/feature-dashboard.md` |
| Checklist company-selector | `docs/checklists/feature-company-selector.md` |
| Modelo de datos | `prisma/schema.prisma` |
| Data demo real 2024 (dashboard) | `docs/data/dashboard-mock-2024.md` |
| Data demo real 2024 (catálogo) | `docs/data/catalog-inventory-mock-2024.md` |
| Colaboración, ramas, accesos | `docs/collaboration-plan.md` |
| Deploy / Vercel | `docs/deployment/vercel-workflow.md`, `docs/deployment/deploy-log.md` |
| Avance por módulo | `docs/progress/feature-*.md` |
| Demo (guion) | `docs/demo/guion-demo.md` |

## 6. Estado actual

- Estado y diagnóstico: `docs/status/` (ver el más reciente).
- Capa UX/UI en vivo: `https://sumicontrol.vercel.app`.

---

> Para el detalle histórico (specs por módulo, plan día por día, checklist de demo original que
> estaban en este archivo), consultar el historial de git de este mismo fichero o los documentos
> enlazados en §5.
