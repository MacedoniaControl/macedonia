# Patch UX/UI especifico para Greeg

## Objetivo

Mejorar la capa visual y de experiencia de usuario de SumiControl sin modificar el planning
original ni la logica critica. Orientado a la demo de Sumigases.

## Cambios realizados

- Sistema de diseño con identidad industrial (azul marino, naranja Sumigases, blanco, grises,
  amarillo de acento) y modo claro/oscuro por clase, en `app/globals.css`.
- Layout admin completo: AppShell + Sidebar agrupado + Header con selector de empresa, alertas,
  usuario y toggle de tema.
- Dashboard ejecutivo: 8 tarjetas KPI, bloque ROI/Rentabilidad, gráfico protagonista Ventas vs
  utilidad y bloques secundarios (ventas vs compras, facturas vs NE, cilindros por estado, stock
  crítico, importaciones recientes, alertas).
- Pantallas prioritarias: Inventario (tabla real), Cilindros, Importaciones (flujo guiado),
  Cotizaciones, Notas de entrega, ROI, Reportes y Matriz ROI (con cifras reales 2024).
- Rutas de soporte del sidebar (POS, ventas, productos, caja, CxC, CxP, compras, configuración,
  usuarios, auditoría) con PageHeader + estados vacíos accionables (ninguna ruta da 404).
- Componentes UI reutilizables, estados vacíos, badges, alertas, confirmación destructiva y
  patrón de tabla con búsqueda/filtros/estados.
- Responsive: sidebar colapsable en móvil, cards apilables, gráficos por viewBox, scroll interno
  en tablas, botones táctiles de 44px.
- Accesibilidad: labels en inputs, aria-label en botones icon-only, foco visible, no depender solo
  del color para el estado.
- Home (`/`) renovada con la nueva identidad y CTA al panel (sin eliminar la ruta).

Las cifras del dashboard, inventario y matrices provienen de la data real 2024 documentada en
`docs/data/dashboard-mock-2024.md` y `docs/data/catalog-inventory-mock-2024.md`.

## Archivos modificados

- `app/globals.css` — sistema de tokens y tema.
- `app/layout.tsx` — anti-flash de tema + metadata.
- `app/page.tsx` — landing renovada.

## Componentes creados

- Layout: `components/layout/AppShell.tsx`, `Sidebar.tsx`, `Header.tsx`, `PageHeader.tsx`, `Breadcrumbs.tsx`.
- UI: `components/ui/KpiCard.tsx`, `StatCard.tsx`, `AlertCard.tsx`, `StatusBadge.tsx`, `ModuleCard.tsx`,
  `EmptyState.tsx`, `ConfirmDialog.tsx`, `DataTableShell.tsx`, `SectionCard.tsx`, `CompanySelector.tsx`,
  `ThemeToggle.tsx`, `Button.tsx`, `SeriesChart.tsx`, `Icon.tsx`.
- Rutas: `app/admin/layout.tsx` + `app/admin/{dashboard,pos,quotes,delivery-notes,sales,products,
  inventory,cylinders,imports,cash,receivables,payables,purchases,reports,roi,matrices,settings,
  users,audit}/page.tsx`.
- Utilidades: `lib/ux/nav.ts`, `lib/ux/format.ts`, `lib/ux/dashboard-data.ts`.

## Validaciones

- `npm install`, `npm run lint`, `npm run build`: ver estado al final del PR.
- `npm run typecheck`: el script NO existe en package.json; el chequeo de tipos lo hace `next build`.

## BI: gráficas dinámicas (Recharts) — portadas de Ranko

- Se añadió `components/ui/BiCharts.tsx` con gráficas **dinámicas Recharts** (líneas Ventas vs
  utilidad, barras Ventas vs compras, donut Categorías por margen), con tooltips y leyendas,
  adaptadas a los tokens de SumiControl (naranja/navy/dorado, claro-oscuro) y data real 2024.
  Reemplazan las gráficas SVG estáticas en el dashboard. Commit `2a99f29`.
- Estado: **código listo y probado en local (build ✓, lint ✓), pusheado**. **NO desplegado** aún.

### ⚠️ Bloqueo de deploy en Vercel (pendiente, no es código)

- `vercel --prod` falla con: *"Serverless Functions are limited to 2048 mb of memory for personal
  accounts (Hobby plan). To increase, create a team (Pro plan)."*
- No es problema del build (es estático). Se intentó destrabar por API (Fluid Compute off,
  `functionDefaultTimeout` 60); persiste. Es un límite del plan.
- La producción actual (`https://sumicontrol.vercel.app`) **sigue intacta** con la versión previa
  (gráficas estáticas); los deploys fallidos no reemplazan el alias en vivo.
- **Para liberar:** subir el proyecto a Pro/Team en Vercel (o ajustar Function Memory/Timeout en
  Settings → Functions) y luego `vercel --prod` publica el commit ya listo.
- Ajustes dejados durante pruebas en el proyecto Vercel: `resourceConfig.fluid=false`,
  `functionDefaultTimeout=60` (compatibles con Hobby, reversibles).

## Pendientes

- **Desplegar las gráficas BI** una vez resuelto el límite de Vercel (ver bloqueo arriba).
- Conectar datos reales (reemplazar mocks de `lib/ux/dashboard-data.ts` por queries reales).
- Integrar con auth/empresa real cuando `feature/auth-roles` exponga sesión + `companies[]`.
- Cuando exista `feature/ui-system` de Salem, reconciliar este sistema visual con el suyo.

## Riesgos

- Este patch toca el dominio UI de Salem (`components/ui/*`, `components/layout/*`, `app/globals.css`,
  `app/layout.tsx`). Se hizo en rama aislada `patch/greeg-ux-ui` y greenfield (no había componentes
  previos), pero habrá que coordinar el merge con `feature/ui-system`.
- `CompanySelector` aquí es presentacional; el scope real y la validación de acceso deben venir del
  server (ver `docs/contracts/company-selector-component.md`).

## Notas para el siguiente agente

- Todas las cifras visibles son demo basadas en data 2024 real; los KPIs "hoy/pendientes" están
  marcados con etiqueta `demo`.
- El tema se controla con la clase `dark` en `<html>` (Tailwind v4 `@custom-variant`).
- Para añadir un módulo nuevo: agrega el ítem en `lib/ux/nav.ts` y crea `app/admin/<ruta>/page.tsx`
  usando `PageHeader` + `SectionCard`/`DataTableShell`/`EmptyState`.
