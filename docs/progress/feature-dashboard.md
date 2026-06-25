# Progreso — feature/dashboard

## Estado

UI implementada y en vivo (patch UX). Falta integración de datos por empresa.

## Qué se hizo

- **UI del dashboard implementada** en `patch/greeg-ux-ui` y desplegada:
  https://sumicontrol.vercel.app/admin/dashboard — 8 KPIs, bloque ROI, gráficas dinámicas
  (Recharts) y bloques secundarios, con data real 2024 (mock).
- Checklist de implementación accionable: `docs/checklists/feature-dashboard.md`.
- Contrato de data tipado `DashboardData` + loader `getDashboardData(companyId, range)` para
  construir la UI con mock y reemplazar por data real luego (no bloquea a Salem).
- Criterios de aceptación, casos borde y alcance MVP propuesto (8 tarjetas + bloque ROI +
  gráfico protagonista + filtros empresa/rango/moneda).

## Archivos tocados

- docs/checklists/feature-dashboard.md (Claude-Greeg)

## Qué falta

- Acordar el tipo `DashboardData` y el loader mock (Claude-Greeg + Codex-Salem).
- Extender `Trend` a multi-serie para los charts "vs" (detalle en docs/data/dashboard-mock-2024.md).
- Montar layout del dashboard contra el mock (Codex-Salem).
- Conectar selector de empresa cuando exista (feature/company-selector).
- Definir mock de Sudematin (no hay data real; propuesto factor 0,35× etiquetado).

## Data mock

- Listo: `docs/data/dashboard-mock-2024.md` con cifras REALES de Sumigases 2024 (ventas $310.865,
  utilidad neta $106.826, series mensuales, factura vs NE) + objeto `dashboardMock2024` para pegar.

## Dependencias

- feature/company-selector (filtro por empresa activa).
- feature/ui-system (tarjetas KPI, charts).
- Data real de módulos = fase posterior; hasta entonces, mock.

## Errores conocidos

- (ninguno; aún sin implementación)

## Siguiente paso

- Congelar alcance MVP con Greeg ⇒ fijar `DashboardData` ⇒ Claude-Greeg arma mock 2024 ⇒ Codex-Salem construye UI.
