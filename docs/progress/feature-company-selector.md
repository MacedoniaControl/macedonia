# Progreso — feature/company-selector

## Estado

En progreso.

## Qué se hizo

- Checklist de implementación accionable: `docs/checklists/feature-company-selector.md`.
- Decisión de scope multiempresa (propuesta Opción A): `docs/decisions/company-scope.md`.
- Contrato del componente del selector para Salem: `docs/contracts/company-selector-component.md`.
- Criterios de aceptación y casos borde redactados.
- Se asumió Opción A para destrabar la implementación server-side de la empresa activa.
- La sesión ahora expone `userId`, `companies[]` y `activeCompanyId`.
- Se agregaron helpers `getActiveCompany()` y `assertCompanyAccess()` en `lib/auth/company-scope.ts`.
- Se agregó la server action `setActiveCompany()` en `app/auth/company/actions.ts`.
- El login demo ya refleja empresa activa y empresas accesibles para verificar el contrato sin tocar aún el layout de Salem.

## Archivos tocados

- docs/checklists/feature-company-selector.md (Claude-Greeg)
- docs/decisions/company-scope.md (Claude-Greeg)
- docs/contracts/company-selector-component.md (Claude-Greeg)
- lib/auth/company-access.ts
- lib/auth/company-scope.ts
- lib/auth/session.ts
- lib/auth/authenticate.ts
- lib/auth/demo-users.ts
- lib/audit/events.ts
- app/auth/company/actions.ts
- app/auth/login/page.tsx

## Qué falta

- Integrar `setActiveCompany()` al `CompanySelector` de Salem dentro del header admin.
- Consumir `getActiveCompany()` desde `/admin` y módulos futuros para filtrar queries por empresa.
- Decidir si la vista consolidada queda activa en MVP o se deja solo preparada.
- Definir redirect post-login por rol usando este mismo `activeCompanyId`.

## Dependencias

- feature/ui-system (componente en `components/layout` ya publicado por Salem).
- feature/dashboard`/`app/admin` para consumir la empresa activa real.
- Confirmación funcional de Greeg sobre vista consolidada en MVP.

## Errores conocidos

- Aún no se consumen estos helpers desde rutas `/admin`, así que el scoping real de módulos sigue pendiente.
- La vista consolidada está soportada server-side, pero no existe aún UI conectada para activarla.

## Siguiente paso

- Conectar el `CompanySelector` publicado por Salem contra `setActiveCompany()` y montar el primer consumo real en `/admin`.
