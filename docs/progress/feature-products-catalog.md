# Progreso — feature/products-catalog

## Estado

Definición lista. Sin implementación de código.

## Qué se hizo

- Checklist accionable: `docs/checklists/feature-products-inventory.md`.
- Data real 2024 lista: `docs/data/catalog-inventory-mock-2024.md` (262 productos, top-22 con SKU,
  código legado, precio/costo/ROI).
- Reglas canónicas: categorías y SKU en `docs/planning` §5 → `docs/decisions/*`.

## Archivos tocados

- docs/checklists/feature-products-inventory.md (Claude-Greeg)
- docs/data/catalog-inventory-mock-2024.md (Claude-Greeg)

## Qué falta

- Modelos Prisma (`ProductMaster`, `CompanyProduct`, `ProductVariant`, `Category`, `ProductAlias`).
- Seed desde el catálogo real 2024.
- Listado con búsqueda/filtros y alta/edición; scoping por empresa.

## Dependencias

- feature/company-selector (helpers de scope ya implementados).
- prisma/schema.prisma (extender — archivo con candado).

## Errores conocidos

- (sin implementación aún)

## Siguiente paso

- Confirmar owner + modelo maestro/por-empresa, extender schema y seed desde el catálogo real.
