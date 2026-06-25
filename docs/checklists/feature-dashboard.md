# Checklist de implementación — feature/dashboard

> Owner técnico: Salem + Codex-Salem. Preparado por Claude-Greeg.
> Lee primero: `docs/decisions/company-scope.md` (la empresa activa filtra todo el dashboard).
>
> **Estado (2026-06-23):** la **UI del dashboard ya está implementada** en `patch/greeg-ux-ui` y en
> vivo (https://sumicontrol.vercel.app/admin/dashboard): 8 KPIs, bloque ROI, gráficas dinámicas
> (Recharts) y bloques secundarios, con data real 2024 (mock). **Pendiente:** (1) conectar
> `getActiveCompany()` para datos por empresa reales; (2) reconciliar este patch con
> `feature/ui-system`/`feature/dashboard` de Salem; (3) filtros funcionales más allá de empresa/rango.

## Objetivo en una línea

Dashboard administrativo navegable con 8 tarjetas KPI, bloque ROI/Rentabilidad, gráfico protagonista
(Ventas vs utilidad) y bloques secundarios, **filtrable por empresa y rango de fecha**, alimentado con
data mock tipada hoy y data real 2024 cuando esté disponible.

## Dependencias (orden importa)

- 🔗 `feature/company-selector`: el dashboard se filtra por empresa activa. Mientras no exista,
  usar `companyId` del mock (ver contrato abajo) para no bloquearse.
- 🔗 `feature/ui-system`: tarjetas KPI, cards y contenedores de gráfico salen de `components/ui/*`
  y `components/dashboard/*`. Coordinar contratos de props con la misma sesión.
- 🔗 Data real (módulos de ventas/inventario/caja) **NO estará lista para el viernes** ⇒
  **el dashboard se construye contra el contrato de mock de abajo**, no contra los módulos reales.
- 📊 Data 2024 (§14): matrices Excel alimentan KPIs reales cuando el importador exista; hasta
  entonces, mock derivado de esas matrices.

## Decisión clave para no bloquearse: contrato de data

> Acción para Claude-Greeg + Codex-Salem: fijar un único tipo `DashboardData` y un loader
> `getDashboardData(companyId, range)` que hoy devuelve mock y mañana consulta real. Así Salem
> construye la UI en paralelo sin esperar a backend.

```ts
type Money = { usd: number; bs: number };
type Trend = { points: { label: string; value: number }[] }; // para sparklines/charts

type DashboardData = {
  companyId: string | null;          // null = consolidado (solo OWNER/ADMIN)
  range: "day" | "week" | "month" | "year" | "custom";
  kpis: {
    ventasHoy: Money;
    cuentasPorCobrar: Money;
    cuentasPorPagar: Money;
    stockCritico: number;            // # de productos bajo mínimo
    cilindrosPendientes: number;     // pendientes por retorno
    recargasPendientes: number;
    pedidosPendientes: number;
    balanceGeneral: Money;
  };
  roi: {
    roiGeneralMes: number;           // %
    utilidadEstimada: Money;
    margenBruto: number;             // %
    ventasVsCompras: { ventas: Money; compras: Money };
    productosMayorRetorno: { nombre: string; roi: number }[];
    categoriasMasRentables: { nombre: string; margen: number }[];
  };
  charts: {
    ventasVsUtilidad: Trend;         // protagonista
    flujoCaja: Trend;
    ventasVsCompras: Trend;
    facturasVsNotasEntrega: Trend;
    creditoVsContado: Trend;
    cilindrosPorEstado: { estado: string; cantidad: number }[];
    stockCriticoPorAlmacen: { almacen: string; criticos: number }[];
  };
  importacionesRecientes: { id: string; archivo: string; fecha: string; estado: string }[];
  alertas: { tipo: string; mensaje: string; severidad: "info" | "warn" | "danger" }[];
};
```

## Checklist

### 1. Estructura y data
- [ ] Ruta `app/admin/dashboard` montada bajo el layout admin.
- [ ] Tipo `DashboardData` y loader `getDashboardData(companyId, range)` (mock primero).
- [ ] Mock seed derivado de matrices 2024 (cifras plausibles, no ceros) para que la demo "se vea real".

### 2. Primera fila — 8 tarjetas KPI (§13)
- [ ] Ventas hoy · Cuentas por cobrar · Cuentas por pagar · Stock crítico
- [ ] Cilindros pendientes · Recargas pendientes · Pedidos pendientes · Balance general
- [ ] Cada tarjeta: valor + moneda (USD/Bs) cuando aplique + mini-tendencia o variación.

### 3. Bloque Rentabilidad / ROI (§28, va debajo de las 8 tarjetas)
- [ ] ROI general del mes · Utilidad estimada · Margen bruto
- [ ] Ventas vs compras · Productos con mayor retorno · Categorías más rentables

### 4. Gráfico protagonista + bloques secundarios
- [ ] **Ventas vs utilidad** (protagonista, destacado).
- [ ] Flujo de caja · Ventas vs compras · Facturas vs notas de entrega · Crédito vs contado
- [ ] Cilindros por estado · Stock crítico por almacén · Importaciones recientes · Alertas operativas

### 5. Filtros y rangos (§13)
- [ ] Rango de fecha con presets: Día · Semana · Mes · Año · Personalizado.
- [ ] Filtro de empresa (alimentado por el selector; consolidado solo OWNER/ADMIN).
- [ ] (MVP mínimo) los demás filtros (Moneda, Almacén, Categoría, Producto, Cliente, Vendedor,
      Documento, Estado) pueden quedar como UI presente pero no-funcional si no da tiempo —
      marcar cuáles entran. Propongo MVP: **Empresa + Rango + Moneda** funcionales; el resto, fase 2.

### 6. Estados de UI
- [ ] Loading (skeletons) en tarjetas y gráficos.
- [ ] Estado vacío ("sin data para este rango/empresa") sin romper layout.
- [ ] Responsive desktop y tablet (§responsabilidad Salem).

## Criterios de aceptación

1. El dashboard carga y muestra las 8 tarjetas con valores (mock plausible, no en cero).
2. Cambiar el rango de fecha (Día→Mes) actualiza tarjetas y gráfico.
3. Cambiar de empresa en el selector recarga los datos a esa empresa.
4. El bloque ROI aparece debajo de las 8 tarjetas, junto a Ventas vs utilidad y Flujo de caja (§28).
5. El gráfico protagonista (Ventas vs utilidad) es claramente el dominante.
6. OWNER/ADMIN ven opción "Consolidado"; roles acotados no.
7. Cifras en USD y Bs donde aplica, usando la tasa actual (§26.7).
8. En tablet no se rompe el layout (sin scroll horizontal).

## Casos borde / test cases

- Rango sin datos (ej. empresa nueva) ⇒ tarjetas en 0 con estado vacío, no error.
- Rango personalizado con fecha fin < inicio ⇒ validación, no crash.
- Consolidado con módulos que aún no soportan consolidado ⇒ degradar a 1ª empresa o avisar.
- Moneda Bs sin tasa BCV del día (§26.6) ⇒ mostrar aviso "tasa vencida", no número falso.
- Muchas alertas operativas ⇒ el bloque scrollea/colapsa, no empuja el layout.
- Cambio rápido de empresa/rango ⇒ evitar carrera de requests (cancelar el anterior).

## Riesgos → acciones concretas para otros agentes

- **Riesgo:** dashboard atado a módulos reales que no llegan al viernes ⇒ bloqueo total.
  **Acción (Codex-Salem):** construir contra `getDashboardData` mock; un solo punto a reemplazar luego.
- **Riesgo:** tarjetas/charts dependen de `components/ui/*` (candado de Salem mismo) y del selector
  (lib de Greeg). **Acción (Claude-Greeg):** alinear el contrato del selector (ver checklist de
  company-selector) y el contrato `DashboardData` ANTES de codear.
- **Riesgo:** data mock irreal hace que la demo no convenza.
  **Acción (Claude-Greeg):** preparar el mock derivado de las matrices 2024 (§14) con cifras coherentes.
- **Riesgo:** alcance del dashboard demasiado grande para 3 días.
  **Acción:** congelar MVP = 8 tarjetas + bloque ROI + gráfico protagonista + 2-3 bloques + filtro
  empresa/rango/moneda. El resto, visible pero marcado fase 2.

## Siguiente paso sugerido

1. Acordar el tipo `DashboardData` y el loader mock (Claude-Greeg + Codex-Salem).
2. Claude-Greeg prepara el mock seed desde matrices 2024.
3. Codex-Salem monta layout del dashboard contra el mock; conecta selector cuando exista.
