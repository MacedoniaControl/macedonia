# Histórico — Plan día por día (archivado)

> Archivado 2026-06-23 por higiene del planning. Era el §32 del planning original.
> **Fechas ya vencidas**; se conserva solo como referencia histórica. La planificación
> vigente vive en `docs/planning/sumicontrol-planning.md` y `docs/status/`.

## 32. Plan por días hasta viernes 19

### Día 1 — Setup, core y layout

Objetivo: dejar el repo listo para colaborar y una app navegable.

Tareas:

1. Crear proyecto base.
2. Configurar Tailwind.
3. Configurar Prisma.
4. Configurar Supabase.
5. Crear `.env.example`.
6. Crear schema inicial.
7. Crear seed de empresas, roles, usuarios, almacenes y categorías.
8. Crear login.
9. Crear layout admin.
10. Crear sidebar.
11. Crear selector de empresa.
12. Crear modo claro/oscuro.
13. Crear README inicial.
14. Crear archivos de progreso por rama.

Entregable:

```text
App abre
Login funciona
Selector de empresa funciona
Dashboard vacío carga
Sidebar muestra módulos
```

### Día 2 — Dashboard + data 2024 + productos

Objetivo: que el dashboard empiece a verse real.

Tareas:

1. Crear tarjetas KPI.
2. Crear gráfico Ventas vs utilidad.
3. Crear estructura para importar matrices.
4. Cargar data simulada o real inicial.
5. Crear productos/categorías.
6. Cargar catálogo base.
7. Crear tabla de productos.
8. Crear filtros.
9. Crear inventario base por almacén.
10. Crear stock crítico.

Entregable:

```text
Dashboard con KPIs visibles
Productos visibles
Categorías visibles
Inventario básico funcional
```

### Día 3 — Inventario + cilindros + recargas

Objetivo: cubrir el diferencial operativo principal.

Tareas:

1. Crear movimientos de inventario.
2. Crear kardex básico.
3. Crear módulo cilindros.
4. Crear estados de cilindros.
5. Crear operación intercambio directo.
6. Crear operación entrega sin retorno.
7. Crear operación cilindro de cliente.
8. Crear pendientes por retorno.
9. Crear recargas básicas.
10. Agregar KPIs de cilindros al dashboard.

Entregable:

```text
Inventario mueve stock
Cilindros operativos
Recargas básicas
Alertas de retorno visibles
```

### Día 4 — Cotizaciones + notas de entrega + POS

Objetivo: crear flujo comercial interno.

Tareas:

1. Crear cotización.
2. Crear líneas de cotización.
3. Aprobar/rechazar cotización.
4. Convertir a nota de entrega.
5. Descontar stock al crear nota de entrega.
6. Crear POS básico.
7. Buscar productos.
8. Agregar productos.
9. Seleccionar cliente.
10. Crear venta interna.
11. Validar venta sin stock.
12. Solicitar aprobación.

Entregable:

```text
Cotización funcional
Nota de entrega funcional
POS básico funcional
Stock se descuenta correctamente
```

### Día 5 — Caja + cuentas + importador + reportes

Objetivo: cerrar demo con administración y reportes.

Tareas:

1. Crear pagos.
2. Crear caja/movimientos.
3. Crear cuentas por cobrar.
4. Crear cuentas por pagar.
5. Crear compras básicas.
6. Crear importador genérico.
7. Crear mapeo de columnas.
8. Crear vista previa.
9. Crear validación de duplicados.
10. Crear reportes básicos.
11. Crear reporte ROI / Rentabilidad básico.
12. Crear exportación básica si da tiempo.
12. Pulir UI.
13. Hacer QA general.
14. Preparar demo.

Entregable:

```text
Caja básica
Cuentas básicas
Importador básico
Reportes básicos
Demo lista
```

