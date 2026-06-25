# Checklist de implementación — feature/company-selector

> Owner técnico: Greeg + Codex-Greeg. Preparado por Claude-Greeg.
> Lee primero: `docs/decisions/company-scope.md` (decisión de scope — **bloqueante**).

## Objetivo en una línea

OWNER/ADMIN pueden elegir y cambiar entre `Sumigases` y `Sudematin`; los demás roles quedan
acotados a su(s) empresa(s) asignada(s), y **todas las queries del sistema se filtran por la
empresa activa** sin fuga entre empresas.

## Dependencias (orden importa)

- ⛔ Depende de `feature/auth-roles`: necesita `Company`, `UserCompanyAccess` y la sesión con
  `companies[]` + `activeCompanyId`. **No empezar el scoping hasta que la sesión exponga esto.**
- ⛔ Depende de la decisión `company-scope.md` aprobada (Opción A recomendada).
- 🔗 Bloquea a: products-catalog, inventory, cylinders, sales, reports, roi (todos filtran por empresa).

## Checklist

### 1. Datos / seed
> **Estado (2026-06-23):** backend y scoping **implementados** por la sesión de auth (ver
> `docs/progress/feature-company-selector.md`). Falta la UI de Salem y conectar `/admin`.

- [x] `Company` con `id`, `name`, `slug`, `isActive`. Seed: Sumigases, Sudematin.
- [x] `UserCompany` (userId ↔ companyId) para acotar roles no-admin.
- [x] Sesión expone `companies[]` + `activeCompanyId`.
- [x] Seed/demo de usuarios con empresas accesibles distintas.

### 2. Backend / scoping (lo más crítico)
- [x] Helper único `getActiveCompany()` server-side (`lib/auth/company-scope.ts`).
- [x] Helper `assertCompanyAccess()` que rechaza si no pertenece.
- [x] Server action `setActiveCompany()` que valida `companyId ∈ companies[]` (`app/auth/company/actions.ts`).
- [x] Soporte de empresa activa = `null` ⇒ consolidada (server-side; falta UI).
- [x] El `companyId` sale del helper, NUNCA del body del cliente.
- [x] Adapter `getCompanySelectorState()` para entregar el estado normalizado al UI.

### 3. UI del selector — PENDIENTE (Salem)
- [ ] Componente selector en el header (consume `components/layout/*` — coordinar con Salem).
- [ ] Visible solo si `session.companies.length > 1` (OWNER/ADMIN); oculto/estático para mono-empresa.
- [ ] Muestra empresa activa y permite cambiar; al cambiar refresca data del módulo actual.
- [ ] Opción "Consolidado" visible solo para OWNER/ADMIN (deshabilitada con tooltip si no entra al MVP).

### 4. Permisos
- [x] Roles no-admin quedan forzados a su empresa (scope server-side).
- [x] Acceso a empresa sin permiso ⇒ rechazado por `assertCompanyAccess()`.
- [ ] Registrar cambio de empresa en AuditLog (pendiente).

## Criterios de aceptación

1. OWNER inicia sesión, ve selector con ambas empresas y una activa por defecto.
2. OWNER cambia a Sudematin y los datos visibles (productos/stock/reportes) cambian a Sudematin.
3. VENDEDOR asignado solo a Sumigases NO ve el selector y solo ve datos de Sumigases.
4. Un request manipulado pidiendo `companyId` de otra empresa devuelve 403, no datos.
5. La vista inicial nunca arranca en "Consolidado": siempre una empresa concreta (§10.7).
6. Cambiar de empresa no requiere re-login.
7. (Si se persiste) al volver a entrar, recupera la última empresa elegida.

## Casos borde / test cases

- Usuario sin ninguna empresa asignada ⇒ mensaje claro, no pantalla rota.
- Usuario con exactamente 1 empresa ⇒ sin selector, scope fijo.
- `activeCompanyId` apunta a empresa desactivada (`isActive=false`) ⇒ fallback a una válida.
- OWNER en "Consolidado" abre un módulo que aún no soporta consolidado ⇒ degradar a la 1ª empresa o avisar.
- Cambio de empresa con formulario a medio llenar ⇒ definir si se descarta (propongo: avisar antes de cambiar).
- Dos pestañas abiertas en empresas distintas ⇒ con Opción A (cookie) la última gana; documentar como limitación conocida.

## Riesgos → acciones concretas para otros agentes

- **Riesgo:** cada módulo filtra empresa a su manera ⇒ fuga de datos.
  **Acción (Codex-Greeg):** publicar `getActiveCompany()` y `assertCompanyAccess()` en `lib/` y exigir
  que todo módulo lo use. Documentar en el README del módulo.
- **Riesgo:** el selector vive en `components/layout/*` (candado de Salem).
  **Acción (Claude-Greeg → Salem/Codex-Salem):** acordar el contrato del componente (props:
  `companies`, `activeCompanyId`, `onChange`) en `feature/ui-system` para que Greeg lo consuma sin tocar layout.
- **Riesgo:** ProductMaster compartido vs. CompanyProduct por empresa (§10.8) se confunde.
  **Acción:** el selector filtra por `CompanyProduct.companyId`, nunca por `ProductMaster`. Anotar en
  el checklist de products-catalog cuando se redacte.

## Siguiente paso sugerido

1. Aprobar `company-scope.md` (Greeg).
2. `auth-roles` expone la sesión con `companies[]` + `activeCompanyId`.
3. Recién entonces Codex-Greeg implementa helpers de scoping + endpoint del selector.
