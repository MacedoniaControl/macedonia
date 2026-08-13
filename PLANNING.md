# SumiControl

SumiControl es una plataforma SaaS operativa interna para Sumigases Oriente C.A. y Sudematin. No es un e-commerce ni una tienda pública. El objetivo es reemplazar ek2Store y centralizar control administrativo, inventario, ventas internas, cotizaciones, notas de entrega, cilindros, recargas, caja, cuentas por cobrar/pagar, compras, ROI/rentabilidad, reportes e importaciones desde Valery, Profit y matrices Excel.

## Entrega objetivo

**Viernes 19:** demo avanzada usable parcialmente.

La demo debe ser funcional en los flujos críticos, usando data real cuando esté disponible y data simulada solo donde falte información. No se presenta como ERP terminado, sino como primera versión funcional avanzada.

## Stack confirmado

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL / Supabase
- Supabase Storage
- Vercel
- Login propio con usuario + contraseña

No usar NextAuth en esta fase.

## Repositorios relacionados

- SumiControl: `https://github.com/Pantera95/Sumi`
- Alice, producto neutral futuro: `https://github.com/Pantera95/Alice.git`

Alice queda postergado. La prioridad actual es SumiControl.

## Reglas de colaboración

No trabajar directo sobre `main`.

Flujo recomendado:

```text
feature/* -> dev -> main
```

Cada rama debe actualizar su archivo de progreso en `/docs/progress`.

## Ramas sugeridas

```text
main
dev
feature/auth-roles
feature/company-selector
feature/ui-system
feature/dashboard
feature/products-catalog
feature/inventory
feature/cylinders
feature/quotes-delivery-notes
feature/pos-sales
feature/imports-valery-profit
feature/cash-payments
feature/receivables-payables
feature/purchases
feature/reports
feature/settings
feature/audit-logs
```

## Módulos prioritarios para demo

- Login y roles
- Selector Sumigases/Sudematin
- Dashboard KPIs
- Productos/catálogo básico
- Categorías/subcategorías
- Inventario por almacén
- POS paralelo
- Cotizaciones
- Notas de entrega
- Ventas internas
- Caja/movimientos
- Cuentas por cobrar básicas
- Cuentas por pagar básicas
- Compras básicas
- Cilindros
- Recargas
- Reportes básicos
- ROI / Rentabilidad básico
- Importaciones Excel/Valery/Profit básicas
- Monedas/tasa BCV
- Configuración básica
- Auditoría/logs mínimos

## Primer setup sugerido

```bash
git clone https://github.com/Pantera95/Sumi.git
cd Sumi

git checkout -b dev

# Solo si el repo esta vacio:
npx create-next-app@latest . --typescript --tailwind --eslint --app

npm install prisma @prisma/client
npm install zod
npm install lucide-react
npm install recharts
npm install xlsx
npm install clsx tailwind-merge

npx prisma init
```

Si el repo ya tiene contenido, revisar antes de correr `create-next-app`.


## ROI / Rentabilidad

SumiControl debe mostrar ROI en el dashboard owner/admin, en reportes, productos/inventario, compras, clientes y cilindros/recargas.

Ubicaciones mínimas:

- Dashboard: bloque `Rentabilidad / ROI`.
- Reportes: sección `ROI / Rentabilidad`.
- Productos: ROI por producto, categoría y rotación.
- Compras: ROI por orden de compra y proveedor.
- Cilindros/recargas: impacto de cilindros pendientes, recargas y pérdidas por no retorno.

Fórmula base:

```text
ROI = (Utilidad neta / Inversión o costo) x 100
```
