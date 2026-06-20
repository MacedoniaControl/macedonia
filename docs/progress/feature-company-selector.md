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
- Se agregó un selector temporal de prueba en `/auth/login` para cambiar empresa activa y validar el contrato de punta a punta mientras Salem conecta el header definitivo.
- Se implementó `lib/auth/post-login-route.ts` como resolver único del redirect post-login.
- Se agregó `/auth/session` como landing temporal segura para sesiones activas mientras `app/admin` no exista en esta rama.
- `/auth/login` ahora redirige automáticamente a la ruta resuelta cuando ya hay sesión activa o cuando el login termina bien.
- Se agregó `lib/auth/company-selector-state.ts` como adapter server-side reutilizable para entregar al UI el estado ya normalizado del selector.

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
- app/auth/company/company-switcher.tsx
- app/auth/login/page.tsx
- app/auth/session/page.tsx
- app/auth/login/actions.ts
- app/auth/login/login-form.tsx
- lib/auth/post-login-route.ts
- lib/auth/company-selector-state.ts

## Qué falta

- Integrar `setActiveCompany()` al `CompanySelector` de Salem dentro del header admin.
- Consumir `getActiveCompany()` desde `/admin` y módulos futuros para filtrar queries por empresa.
- Decidir si la vista consolidada queda activa en MVP o se deja solo preparada.
- Retirar el selector temporal de `/auth/login` cuando `/admin` quede consumiendo el componente final.
- Reemplazar la degradación temporal a `/auth/session` por rutas `/admin/*` reales cuando esa rama se integre aquí.
- Hacer que `/admin` consuma `getCompanySelectorState()` para reemplazar estado local demo del header.

## Dependencias

- feature/ui-system (componente en `components/layout` ya publicado por Salem).
- feature/dashboard`/`app/admin` para consumir la empresa activa real.
- Confirmación funcional de Greeg sobre vista consolidada en MVP.

## Errores conocidos

- Aún no se consumen estos helpers desde rutas `/admin`, así que el scoping real de módulos sigue pendiente.
- La vista consolidada está soportada server-side, pero aún no existe UI conectada dentro del layout real de `/admin`.
- El resolver post-login hoy degrada a `/auth/session` porque esta rama todavía no trae `app/admin`.
- Salem todavía mantiene `activeCompanyId` local en su shell remoto; falta conectar ese punto a este adapter.

## Siguiente paso

- Conectar el `CompanySelector` publicado por Salem contra `setActiveCompany()` y `getCompanySelectorState()` para reemplazar `/auth/session` por el consumo real en `/admin`.
