# SumiControl

Plataforma SaaS **interna** para Sumigases Oriente C.A. y Sudematin: control administrativo,
inventario, ventas internas, cotizaciones, notas de entrega, cilindros y recargas, caja, compras,
cuentas por cobrar/pagar, ROI, reportes e importaciones (Excel / Valery / Profit). **No** es
e-commerce ni tienda pública.

> **Higiene 2026-06-23:** este archivo es solo la puerta de entrada. El detalle vive en sus docs
> canónicos (ver "Fuente de verdad"). Regla del proyecto: **una sola fuente de verdad por tema.**

## Objetivo

Demo avanzada usable parcialmente: flujos críticos funcionales, con data real donde exista y
simulada donde falte. No se presenta como ERP terminado.

## Stack

Next.js · TypeScript · Tailwind CSS · Prisma · PostgreSQL/Supabase · Supabase Storage · Vercel ·
login propio (sin NextAuth en esta fase).

## Repositorios

- SumiControl: `https://github.com/Pantera95/Sumi`
- Alice (neutral, futuro, postergado): `https://github.com/Pantera95/Alice.git`
- Vercel: `https://vercel.com/pantera95s-projects`

## Fuente de verdad

| Necesitas… | Mira… |
|---|---|
| Visión, alcance, prioridades e índice completo | `docs/planning/sumicontrol-planning.md` |
| Reglas de negocio (inventario, cilindros, caja, moneda, documentos, ROI, roles, contraseñas) | `docs/decisions/` |
| Colaboración, ramas, candados, accesos | `docs/collaboration-plan.md` |
| Protocolo de avisos | `docs/communication/update-protocol.md` |
| Deploy / Vercel | `docs/deployment/vercel-workflow.md` · `docs/deployment/deploy-log.md` |
| Modelo de datos | `prisma/schema.prisma` |
| Avance por módulo | `docs/progress/feature-*.md` |

## Primer setup

```bash
git clone https://github.com/Pantera95/Sumi.git
cd Sumi
# Si el repo ya tiene contenido, revisar antes de instalar/scaffolding.
npm install
npx prisma generate
npm run dev
```

Dependencias base ya en el proyecto: `prisma`, `@prisma/client`, `zod`, `recharts`. Añadir
`xlsx`/`lucide-react`/`clsx`/`tailwind-merge` solo cuando un módulo las requiera.
