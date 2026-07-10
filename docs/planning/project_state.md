# Estado del proyecto — SumiControl (handoff / continuidad)

> **Documento vivo.** Actualizar aquí cada vez que ocurra un evento o cambio significativo.
> Última actualización: 2026 (fin de ventana de contexto; sesión Claude-Greeg).

## 0. TL;DR para retomar

- **App en vivo:** https://sumicontrol.vercel.app (pública, sin login).
- **Rama de trabajo:** `patch/greeg-ux-ui` — TODO el panel funcional está aquí.
- **Worktree local:** `/Users/greegvizcaino/Documents/New project/sumi-ux-patch` (Next.js 16 + Tailwind v4 + Recharts).
- **Repo:** https://github.com/Pantera95/Sumi
- **Naturaleza:** demo funcional **client-side** (estado en `localStorage` vía `usePersistedState`). **Sin backend/DB todavía** (fase siguiente).
- **TAREA EN CURSO:** módulo **Inventario (Físico/S/Master)** — spec definida en `docs/decisions/inventory-model.md`, **falta implementar**. Bloqueo: muestra del export de inventario de Valery.

## 1. Cómo desplegar (IMPORTANTE)

```bash
cd "/Users/greegvizcaino/Documents/New project/sumi-ux-patch"
cat .vercel/project.json | grep sumicontrol   # DEBE decir "sumicontrol"
npm run build                                  # verificar
vercel deploy --prod --yes                     # despliega a producción
```
- Si el CLI falla con **"Serverless Functions limited to 2048 mb"**: el `.vercel` apunta al proyecto
  equivocado (ranko). Arreglar: `rm -rf .vercel && vercel link --yes --project sumicontrol`.
- Vercel plan **Hobby**: sin miembros de equipo, Deployment Protection **desactivada** (previews y prod públicas).
- Alternativa de deploy: `git push` → esperar build de GitHub → `vercel promote <url-del-deploy>`.

## 2. Cómo pushear a GitHub

El helper de git **no entrega credenciales de forma no interactiva** en este entorno. Se usa un
**Personal Access Token** de Greeg en la URL:
```bash
git push "https://<TOKEN>@github.com/Pantera95/Sumi.git" patch/greeg-ux-ui:patch/greeg-ux-ui
```
> El último token que dio Greeg estaba **expuesto en el chat** y debe rotarse; pedir uno nuevo cuando
> haga falta pushear. `gh` no está instalado.

## 3. Estructura del código (worktree)

- `app/admin/*` — cada módulo del panel (client components). Layout admin en `components/layout/*`.
- `components/ui/*` — KpiCard, StatCard, SectionCard, StatusBadge, AlertCard, Button, Icon, DataTableShell,
  ConfirmDialog, EmptyState, CompanySelector, ThemeToggle, SeriesChart, **BiCharts** (Recharts).
- `lib/ux/*` — `use-persisted-state.ts` (localStorage), `notifications.ts` (autorizaciones),
  `bcv-rate.ts` (tasa BCV compartida), `doc-templates.ts` (**PDFs Valery**), `sumigases-logo.ts`
  (logo oficial embebido), `dashboard-data.ts` (data real 2024), `nav.ts`, `format.ts`, `export-csv.ts`.
- `app/api/bcv/route.ts` — API server (node:https) que consulta bcv.org.ve (evita CORS/cert).
- Fuentes: **Sora** (títulos) + **Inter** (cuerpo) vía next/font.

## 4. Módulos y estado (todos funcionales client-side)

| Módulo | Estado |
|---|---|
| Dashboard | ✅ KPIs + ROI + gráficas Recharts + filtros (empresa/rango/moneda) + textbox dólar BCV |
| Cilindros y recargas | ✅ inventario **por gas** (7 gases + agregar gas) + movimientos con **autorización OWNER/ADMIN** (notificaciones) |
| Cotizaciones/Presupuestos | ✅ registro por período + generar **PDF Valery** + subir PDF Valery; form alineado a pantalla de captura |
| Notas de entrega + Devoluciones | ✅ registro por período + **PDF Valery** (logo real) + subir PDF; form alineado a Valery |
| Ventas internas | ✅ contado/crédito |
| Productos, Inventario | ✅ básicos (Inventario se **rehará** con modelo Físico/S/Master) |
| Importaciones | ✅ asistente 8 pasos + subir archivo |
| Cuentas por cobrar / pagar | ✅ cartera, abonos, vencimientos, export CSV |
| Compras | ✅ orden → recepción → CxP |
| Reportes / ROI / Matrices | ✅ tablas reales 2024 + export CSV |
| Configuración | ✅ guarda (persistente) + **botón Actualizar desde BCV** |
| Usuarios y roles / Auditoría | ✅ crear usuario, roles, eventos |
| **POS interno / Caja y pagos** | ❌ **ELIMINADOS** a pedido del cliente |

## 5. Documentos PDF (formato Valery, réplica fiel)

`lib/ux/doc-templates.ts`: `notaEntregaHtml` (doble ejemplar), `devolucionHtml` (Nota de Crédito),
`presupuestoHtml` (cotización). Logo oficial en `lib/ux/sumigases-logo.ts`. Datos fijos empresa
Sumigases (RIF J-502789510). Para **Sudematin**: ver `docs/planning/documentos-sumigases-valery.md`.

## 6. Coordinación / incidencias

- **Salem** comparte el proyecto Vercel `sumicontrol`. En un evento desplegó su versión básica y
  sobrescribió producción; se **restauró** redeployando este worktree. Riesgo: cualquiera puede
  sobrescribir prod. Recomendación: solo una persona despliega a prod, o Salem usa su propio proyecto.
- Nuestra rama `patch/greeg-ux-ui` en GitHub **nunca fue afectada** por Salem.
- Rol de esta sesión: **Claude-Greeg** = planning + coordinación + implementación UX (autorizado por Greeg).

## 7. Próximo paso concreto

Implementar el módulo **Inventario** según `docs/decisions/inventory-model.md`:
Físico (Valery, read-only) + S (SumiControl) + Master (= Físico+S), por empresa/almacén, clave = código
Valery, cilindros por existencia, sin-stock-en-S → aprobación OWNER/ADMIN, y control de **código
duplicado** (alerta owner/admin + bloqueo + tag "Documento Duplicado"). **Falta:** muestra del export
de inventario de Valery para mapear el importador del Físico.

## 8. Docs clave

- `docs/decisions/*` — reglas de negocio (inventory-model, inventory-rules, currency-tax-rate,
  payments-cash, documents-correlativos, roles-permissions, company-scope, cylinder-rules, roi).
- `docs/planning/benchmark-fina-redesign.md` — benchmark y rediseño.
- `docs/planning/documentos-sumigases-valery.md` — formatos Valery + guía Sudematin.
- `docs/data/*` — data real 2024.
- `docs/deployment/deploy-log.md` — historial y aprendizajes de deploy.
