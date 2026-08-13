# Registro de despliegues — patch/greeg-ux-ui

## Proyecto Vercel

- Scope: `pantera95s-projects` · Proyecto: `sumicontrol`
- Build command (vercel.json en esta rama): `next build` (sin Prisma).
- Deployment Protection: **desactivada** (previews y producción públicas).

## 2026-06-16 — patch UX/UI en producción

- **Producción:** https://sumicontrol.vercel.app  → `/admin/dashboard`
- **Preview de la rama:** https://sumicontrol-esokj7aj4-pantera95s-projects.vercel.app
- Estado: READY · HTTP 200 público.
- Contenido: capa UX/UI (layout admin, dashboard ejecutivo, ROI, matrices, inventario) con data
  demo basada en cifras reales 2024.
- Reemplazó el deploy previo (flujo de auth demo de feature/auth-roles); ese código sigue en su rama.

## 2026-06-16 — gráficas BI (Recharts) en producción

- Se añadieron gráficas dinámicas Recharts al dashboard (`components/ui/BiCharts.tsx`).
- **En vivo:** https://sumicontrol.vercel.app/admin/dashboard (Ventas vs utilidad, Ventas vs compras,
  Categorías por margen — con tooltips/leyendas).

### ⚠️ Aprendizaje de deploy (importante)

- **NO usar `vercel deploy --prod` por CLI** en este proyecto: el CLI envía su propia config de
  recursos y choca con el límite del plan Hobby (*"Serverless Functions are limited to 2048 mb …"*),
  aunque el proyecto tenga Fluid Compute desactivado y CPU en Hobby.
- **Los deploys por GitHub SÍ funcionan** (usan solo los settings del proyecto). Todos los push a la
  rama quedaron READY.
- **Flujo correcto para publicar:**
  1. `git push` a la rama.
  2. Esperar que Vercel construya el deploy de ese commit (queda READY como preview).
  3. Promoverlo a producción: `vercel promote <url-del-deploy>` (ej. `sumicontrol-xxxx.vercel.app`).
  - O configurar el branch de producción en Vercel para que el push despliegue directo.
- Settings del proyecto que dejaron pasar el build: Fluid Compute **off**, `functionDefaultTimeout`
  60, memoria `standard_legacy` (Hobby).

## Pendientes

- Abrir PR a `dev`: https://github.com/Pantera95/Sumi/pull/new/patch/greeg-ux-ui (gh no instalado).
- Reconciliar merge con `feature/ui-system` (Salem).
- Reactivar Deployment Protection cuando haya datos/login reales.

## 2026-06-23 — ENTREGA: panel completo funcional

- Todos los módulos del sidebar funcionales client-side y en producción (19 rutas, HTTP 200):
  dashboard (BI Recharts), POS, cotizaciones→NE, notas de entrega (stock/anulación), ventas
  internas, caja y pagos (verificación), CxC y CxP (abonos/vencimientos), compras (recepción→CxP),
  cilindros (movimientos/pendientes), productos (crear+SKU auto), inventario, importaciones
  (asistente 8 pasos), reportes, ROI, matrices, configuración, usuarios/roles, auditoría.
- Data basada en cifras reales 2024; lógica demo client-side (sin DB). Backend real = fase siguiente.
- Deploy: vercel deploy --prod desde este worktree (link .vercel debe apuntar a `sumicontrol`).
