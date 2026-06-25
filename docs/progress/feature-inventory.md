# Progreso — feature/inventory

## Estado

Definición lista. Sin implementación de código.

## Qué se hizo

- Reglas canónicas: `docs/decisions/inventory-rules.md` (stock no negativo, descuento en nota de
  entrega, ajustes con aprobación, kardex).
- Checklist accionable (compartido con catálogo): `docs/checklists/feature-products-inventory.md`.
- Data real 2024 con stock demo y stock crítico: `docs/data/catalog-inventory-mock-2024.md`.

## Archivos tocados

- docs/checklists/feature-products-inventory.md (Claude-Greeg)

## Qué falta

- Modelos `Warehouse`, `Stock`, `StockMovement`, `StockAdjustment`.
- Movimientos, kardex, stock crítico (KPI dashboard) y scoping por empresa.
- Descuento de stock conectado a la creación de nota de entrega.

## Dependencias

- feature/products-catalog (maestro/CompanyProduct).
- feature/company-selector (helpers de scope).
- feature/quotes-delivery-notes (punto único de descuento de stock).

## Errores conocidos

- (sin implementación aún)

## Siguiente paso

- Tras productos, implementar stock por almacén consumiendo `getActiveCompany()`.
