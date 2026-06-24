# Checklist de implementación — productos y catálogo + inventario

> Cubre `feature/products-catalog` y `feature/inventory` (acoplados: comparten catálogo y empresa).
> Preparado por Claude-Greeg (planning + coordinación). Owner de implementación: por asignar.
> Fuentes: `docs/decisions/inventory-rules.md` (reglas, autoridad), `docs/decisions/company-scope.md`
> (scope), `docs/data/catalog-inventory-mock-2024.md` (data real 2024), `prisma/schema.prisma`.

## Objetivo en una línea

Catálogo multiempresa con maestro compartido + precio/costo/stock/IVA por empresa, e inventario por
almacén con movimientos y stock crítico, filtrado por la empresa activa.

## Dependencias

- ⛔ `feature/company-selector`: el filtrado por empresa usa `getActiveCompany()` /
  `assertCompanyAccess()` (ya implementados; falta consumirlos desde `/admin`).
- ⛔ `prisma/schema.prisma` con los modelos de productos/inventario (ver §31 del planning original /
  modelo en prisma). Coordinar antes de codear (archivo con candado).
- 🔗 `feature/ui-system`: tabla, filtros, formularios y estados vacíos (componentes de Salem).
- 📊 Data real lista en `docs/data/catalog-inventory-mock-2024.md` (262 productos, top-22 con ROI).

## Decisiones requeridas antes de codear

- [ ] Maestro vs por-empresa (§10.8): `ProductMaster` compartido + `CompanyProduct` con precio,
      costo, stock, IVA y estado **por empresa**. Confirmar este modelo.
- [ ] `barcode` legado (Valery/Profit): ¿campo en producto **y** `ProductAlias`, o solo alias?
      (propuesta en el doc de catálogo: ambos).
- [ ] SKU editable antes de importar (§16.4): propongo sí, en preview.
- [ ] Productos exentos de IVA: flag `ivaExento` por `CompanyProduct` (default false).

## Checklist

### 1. Datos / seed
- [ ] Modelos: `ProductMaster`, `CompanyProduct`, `ProductVariant`, `Category`, `Subcategory`,
      `Warehouse`, `Stock`, `StockMovement`, `StockAdjustment`, `ProductAlias`.
- [ ] Categorías base (§16): Gases, Máquinas de soldar, Electrodos/varillas, Portaelectrodos/antorchas,
      Reguladores/válvulas, EPP, Accesorios/repuestos.
- [ ] Seed con el top del catálogo real 2024 (`docs/data/catalog-inventory-mock-2024.md`): SKU,
      barcode legado, categoría, precio, costo; stock como demo hasta tener el Excel de stock real.

### 2. Catálogo (products)
- [ ] Listado con búsqueda (SKU, nombre, código de barras), filtro por categoría y empresa activa.
- [ ] Alta/edición de producto (maestro) y de su `CompanyProduct` (precio/costo/IVA/estado).
- [ ] Generación de SKU por categoría (`GAS-0001`…) editable antes de guardar/importar.
- [ ] Costo/margen visibles **solo** a roles autorizados (ver `roles-permissions.md`).

### 3. Inventario (stock)
- [ ] Stock por almacén y empresa; **sin stock negativo real** (`inventory-rules.md`).
- [ ] Stock crítico: marcar cuando `stock <= stockMin`; KPI al dashboard.
- [ ] Movimientos de inventario (entrada/salida/ajuste) con motivo.
- [ ] Ajustes requieren motivo + aprobación OWNER/ADMIN + AuditLog.
- [ ] Kardex básico por producto (historial de movimientos).
- [ ] El stock se descuenta **al crear nota de entrega** (no en cotización) — coordina con quotes/NE.

### 4. Scoping por empresa
- [ ] Toda query filtra por `getActiveCompany()`; nunca confiar `companyId` del cliente.
- [ ] Consolidado (OWNER/ADMIN) = sumar empresas; vista inicial siempre una empresa.

### 5. UI/UX
- [ ] Tabla con título, descripción, buscador, filtros, acción principal, y estados
      loading/empty/error/forbidden (usar patrón `DataTableShell` del patch UX).
- [ ] Estado vacío accionable: "Aún no hay productos cargados. Importa una plantilla Excel o crea el
      primer producto." → acciones Importar / Crear.

## Criterios de aceptación

1. Cambiar de empresa cambia precios/costos/stock mostrados (mismo maestro, distinto `CompanyProduct`).
2. Un producto bajo mínimo aparece como "Stock crítico" y suma al KPI del dashboard.
3. Vender/descontar nunca deja stock negativo; el descuento ocurre en la nota de entrega.
4. Un ajuste de stock sin aprobación queda pendiente; con aprobación genera AuditLog.
5. VENDEDOR/CAJERO no ven costo/margen; OWNER/ADMIN/COMPRAS sí.
6. Búsqueda por código de barras legado encuentra el producto (vía `ProductAlias`).
7. SKU autogenerado se puede editar antes de confirmar.

## Casos borde

- Producto sin `CompanyProduct` en la empresa activa ⇒ no listarlo (o marcar "no disponible aquí").
- Importar un producto cuyo barcode ya existe ⇒ detectar duplicado, no duplicar maestro.
- Stock mínimo no definido ⇒ no marcar crítico (no asumir 0).
- Variantes (`ELE-0001A/B`) comparten maestro pero stock/precio propios.
- Consolidado con un producto presente en una sola empresa ⇒ sumar solo donde exista.

## Riesgos → acciones

- **Riesgo:** cada módulo filtra empresa distinto ⇒ fuga. **Acción:** usar exclusivamente los helpers
  de `lib/auth/company-scope.ts`.
- **Riesgo:** schema Prisma es candado y aún no tiene estos modelos. **Acción (coordinación):** quien
  implemente anuncia el cambio de `schema.prisma`, lo hace acotado y actualiza `docs/progress`.
- **Riesgo:** stock demo confunde en la demo. **Acción:** etiquetar stock como demo hasta cargar el
  Excel real de inventario.

## Siguiente paso

1. Confirmar modelo maestro/por-empresa y owner de implementación.
2. Extender `schema.prisma` (coordinado) + seed desde el catálogo real 2024.
3. Construir listado + inventario consumiendo `getActiveCompany()`.
