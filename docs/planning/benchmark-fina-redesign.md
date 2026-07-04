# Benchmark y rediseño — SumiControl vs. Fina (y referencias ERP/POS)

> Autor: Claude-Greeg (owner delegado). Fecha: 2026-06-23.
> Base analizada: https://www.finapartner.com/ (SaaS administrativo venezolano multi-rubro),
> más patrones ya adoptados de ek2Store (ERP/POS) y Ranko (admin premium + BI Recharts).
> Diferencia clave: **Fina es genérico multi-rubro; SumiControl es vertical para Sumigases**
> (gases industriales, cilindros retornables, multiempresa Sumigases/Sudematin).

## 1. Qué hace bien Fina (hallazgos)

1. Dashboard "en tiempo real": facturación, utilidad mensual y **alertas de inventario bajo** al frente.
2. **Multi-moneda Bs/USD** nativa (contexto venezolano: IGTF/ISLR), cuentas separadas por moneda.
3. Inventario con **alertas de stock**, variantes y vencimientos.
4. Finanzas: ingresos/gastos por período, control de caja y bancos, conciliación por método de pago,
   **utilidad visible por transacción**.
5. Reportes exportables (Excel/PDF) con comparativas por período.
6. UX: simplicidad anti-Excel, cero fricción de setup, multiusuario, multi-dispositivo.

## 2. Ventaja vertical de SumiControl (lo que Fina NO tiene)

- **Cilindros retornables**: estados, intercambio, pendientes por retorno, recargas (diferencial del negocio).
- **Multiempresa** con scoping por empresa activa (Sumigases/Sudematin).
- **Importador Valery/Profit/Excel** con equivalencias y reversión.
- **ROI transversal** por producto/categoría/compra/cliente con data real 2024.
- Flujo documental interno: cotización → nota de entrega (punto único de descuento de stock) → venta.

## 3. Modificaciones adoptadas (registro por módulo)

| # | Módulo | Mejora inspirada en | Cambio aplicado |
|---|---|---|---|
| M1 | Global | Fina "tiempo real" | **Persistencia local** (localStorage) en todos los módulos operativos: lo registrado (movimientos, ventas, pagos, cotizaciones, órdenes, notas, productos) **sobrevive a la navegación y al refresh** — la demo se comporta como app real, no se resetea. |
| M2 | Dashboard | Fina KPIs en vivo + multi-moneda | **Filtros funcionales**: Empresa (Sumigases / Sudematin / Consolidado), Rango (Año/Semestre/Trimestre/Mes) y **Moneda USD↔Bs** ahora recalculan KPIs y gráficas de verdad (antes eran decorativos). |
| M3 | Header | Fina alertas visibles | La campana de **alertas** deja de ser decorativa: dropdown funcional con alertas operativas (stock crítico, cilindros pendientes, tasa). |
| M4 | Reportes | Fina reportes por período | Visor funcional: al elegir un reporte se **renderiza la tabla real** (ventas mensuales, utilidad, factura vs NE, crédito vs contado) con data 2024 y totales. |
| M5 | Caja/CxC/CxP | Fina conciliación por método | Ya implementado en esta rama: verificación por método, abonos parciales, aging de cartera. Se conserva y ahora **persiste** (M1). |
| M6 | Inventario | Fina alertas de stock | Ya implementado (stock crítico + KPI). Persiste vía productos (M1). |
| M7 | Multi-moneda | Fina Bs/USD | El dashboard convierte USD↔Bs con la tasa configurada (49,5 demo); POS ya mostraba total Bs. |
| M8 | Identidad | Ranko premium | Se mantiene: navy + naranja Sumigases + dorado de acento, claro/oscuro, Recharts BI. |

## 4. Qué NO se adopta de Fina (fuera de alcance vertical)

- Recetas/ingredientes, mesas/mesoneros (rubro alimentos) — no aplica a gases.
- SMS marketing — fase 2 si se quisiera.
- Apertura multi-rubro — SumiControl es deliberadamente vertical Sumigases.

## 5. Deuda pendiente (fase siguiente, ya definida en docs/)

- Conectar backend real (Prisma/Supabase) — auth y scoping ya avanzados en `feature/company-selector`.
- Exportación real a Excel/PDF de reportes.
- Tasa BCV automática (hoy manual 49,5 demo).
