# Estado del proyecto — Macedonia / SumiControl

> **Documento vivo.** Dónde estamos HOY y cómo continuar. Actualizar ante cada cambio significativo.
> Para **replicar o reconstruir** el sistema desde cero, lee `BLUEPRINT.md`.
>
> Última actualización: 2026-07-31

## 0. TL;DR para retomar

- **App en vivo:** https://sumicontrol.vercel.app — pública, sin login todavía.
- **Marca:** **Macedonia** en el front · **SumiControl** interno (código, claves, docs).
- **Repo:** github.com/MacedoniaControl/macedonia · rama **`main`** (organización de la empresa).
- **Worktree:** `/Users/greegvizcaino/Documents/New project/sumi-ux-patch`
- **Naturaleza:** front **client-side** (`localStorage`) + **base de datos Supabase YA CREADA y verificada**
  (Postgres + RLS, plan Pro). Falta conectar los módulos y el login.
- **Prioridad #1 del cliente:** **Cilindros y recargas** (rehacer con el proceso real) + login +
  que los 6 técnicos registren recargas desde el celular.

## 1. Arquitectura en una imagen

```
/                                Centro de Control Estratégico
├── /admin/sumigases/<módulo>     panel Sumigases (naranja)
├── /admin/sudematin/<módulo>     panel Sudematin (azul)
└── /admin/<módulo>               Consolidado (solo OWNER)
```
Rutas separadas por empresa, **implementación compartida** (cada ruta es un re-export de 1 línea).
El tema y el menú se aplican solos según la URL. Detalle en `BLUEPRINT.md` §3.

## 2. Módulos y estado

| Módulo | Estado |
|---|---|
| **Landing / Centro de Control** | ✅ dos puertas por empresa + consolidado (solo Owner) |
| Dashboard | ✅ por empresa, KPIs demo + **histórico real** + gráficas |
| Cotizaciones | ✅ "Generar presupuesto" principal · **escáner + buscador de catálogo** · Registro solo Owner |
| Notas de entrega | ✅ generación principal · escáner · PDF formato Valery · Registro solo Owner |
| Ventas internas | ✅ básico |
| Productos y catálogo | ✅ básico |
| **Inventario** | ✅ Master (Físico Existente / En espera NE / En espera factura) · Físico Valery · Inventario S · **Movimientos (kardex)** · Regularización fiscal · **Rotación** |
| **Cilindros y recargas** | ⚠️ **diseño provisional** — rehacer con el proceso real |
| **Gastos** (Finanzas) | ✅ 34 partidas · 5 categorías · Bs/USD · Owner+Admin |
| **Comisiones y bonos** (Finanzas) | ✅ % sobre ventas propias por documento · bono sobre utilidad |
| Cuentas por cobrar / pagar | ✅ básico |
| Compras | ✅ básico |
| Reportes · ROI · Matrices | ✅ con histórico real por empresa |
| Configuración · Usuarios · Auditoría | ✅ básico |
| ~~POS interno~~ · ~~Caja y pagos~~ · ~~Importaciones~~ | ❌ **eliminados** a pedido del cliente |

## 3. Datos reales cargados

- **1.703 productos** del inventario de Valery (Sumigases).
- **Histórico 2022–2026** por empresa: Sumigases $2,37M ventas / ROI 76,9% · Sudematin $2,45M / ROI 162,1%.
- **Costos y precios** por producto: 1.213 códigos Sumigases · 2.599 Sudematin (del historial de ventas).
- **Rotación**: 780 códigos con ventas de los últimos 12 meses.

## 4. Decisiones de negocio ya cerradas

- **Valery es solo fiscal**; Macedonia es la alternativa **no fiscal** con los números reales.
- **Nunca** se escribe en Valery: solo se **suben sus exports**.
- **Registros/logs: solo OWNER** (ni siquiera los administradores).
- **Gastos y utilidad: Owner + Administrador.**
- **Pared entre empresas**: nadie mezcla datos salvo el Owner.
- **Comisiones**: Junior 0,5% · Senior 4% (editables), sobre **ventas propias** por código de documento.
- **Bono**: % editable sobre la utilidad después de gastos, por trabajador.
- El **Estado de Resultado de administración** es la cifra oficial (aunque difiera 7% de Valery).

## 5. Pendientes (orden sugerido)

1. **Cilindros** con el proceso real — falta responder: ¿serie individual o cantidades?, ¿comodato?,
   ¿estados?, ¿se rellenan o se compran llenos?, ¿paso a paso del técnico?
2. **Backend**: ✅ base **creada y verificada** (16 tablas · 34 políticas · plan Pro).
   Las 7 pruebas de `supabase/04-verificacion.sql` pasan. **Falta**: conectar los módulos
   (cambiar el cuerpo de los stores, no las firmas) y el login.
3. **Importadores diarios** con idempotencia y reversión.
4. **Estado de Resultado** armado en Matrices.
5. Conectar documentos al kardex — ⚠️ resolver el **doble descuento** (NE de Macedonia vs export de Valery).
6. Notas y cotizaciones con logo/RIF por empresa.
7. Dominio propio (`app.macedonia…`) y tasa BCV compartida cada hora.

## 5-bis. Base de datos (Supabase) — verificada

**16 tablas · 34 políticas · vista `existencias` · plan Pro (con backups).**

Las 7 pruebas de seguridad de `supabase/04-verificacion.sql` pasan. Volver a correrlas
tras **cualquier** cambio de esquema o de políticas.

**Dos errores que la verificación atrapó** (y que sin ella habríamos dado por resueltos):

1. La vista `existencias` se creó sin `security_invoker` → se saltaba el RLS por completo.
   Cualquier técnico podía leer el inventario de **ambas** empresas.
2. `revoke select (costo_unitario)` **no hacía nada**: en Postgres, un `GRANT SELECT` de
   tabla cubre todas las columnas y el revoke de una columna suelta se ignora **en
   silencio**. Hay que quitar el permiso de tabla y otorgar columna por columna.

Moraleja: en seguridad de base de datos, *parecer aplicado* y *estar aplicado* son cosas
distintas. Preguntarle siempre a la base.

## 6. Riesgos abiertos

- **Un solo mantenedor**, deploys manuales, sin control de acceso. Ya ocurrió que un tercero
  sobrescribió producción. Recomendación: un solo responsable de desplegar.
- **Sin backups**: al pasar a Supabase, entrar directo al plan Pro ($25/mes) antes de datos reales.
- **Token de GitHub expuesto** en el chat de trabajo: rotarlo.

## 7. Docs clave

- **`BLUEPRINT.md`** — el plano completo para replicar el sistema. **Empieza aquí.**
- `docs/decisions/inventory-model.md` — modelo de inventario, regularización fiscal, rotación.
- `docs/planning/documentos-sumigases-valery.md` — formatos de documentos Valery.
- `docs/manual-escaner.txt` — manual del operador para el lector de códigos.
- `docs/deployment/deploy-log.md` — historial y aprendizajes de despliegue.
