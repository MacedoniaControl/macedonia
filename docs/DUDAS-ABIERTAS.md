# Dudas abiertas — Macedonia / SumiControl

Corte: **26-ago-2026**

Este documento existe porque afirmé varias cosas que después resultaron falsas o
incompletas, y eso frenó el trabajo. Acá queda separado, de forma explícita, qué
está **verificado**, qué es **duda mía** (la puedo resolver yo verificando) y qué
es **decisión tuya** (no la puedo resolver sin vos).

Regla que me impongo de acá en adelante: no afirmo el estado de nada sin haberlo
comprobado contra la base, la API o el archivo real en la misma sesión.

---

## 1. Cosas que afirmé mal en esta sesión

Quedan escritas para que no se repitan y para que puedas juzgar cuánto pesar mis
afirmaciones.

| # | Lo que dije | Lo que era | Cómo se descubrió |
|---|---|---|---|
| 1 | «Estás en un proyecto de Supabase distinto» | Era el mismo proyecto | La URL que mandaste |
| 2 | «`clientes_saldo` falla porque depende de `cuentas`» | `cuentas` existía; la hipótesis era falsa | Tu listado de `pg_tables` |
| 3 | «Los documentos se guardan en el navegador» | Se guardan en Supabase. Lo que salía del navegador era **la lista en pantalla** | Leí el código en vez de recordarlo |
| 4 | «Vercel no está conectado al repo» (dicho como si nunca lo hubiera estado) | **Sí lo estuvo**, hasta el 13-ago-2026. Se cortó cuando movimos el repo a la organización | `gh api .../deployments` |
| 5 | «Saqué el IVA fijo de todos lados» | Quedaba un `* 1.16` en devoluciones | Lo encontré hoy, semanas después |

El patrón es el mismo en los cinco: **afirmé antes de terminar de verificar.**
En los casos 1, 2 y 4 me quedé con una sola fuente (el CLI, mi memoria) cuando
había otra disponible que decía lo contrario.

---

## 2. Dudas mías — las resuelvo yo, no necesito que contestes

Ninguna de estas requiere que decidas nada. Son cosas que **no verifiqué** y que
no debería dar por buenas.

### 2.1 Las seis pantallas que siguen en `localStorage`

Con notas de entrega descubrí que «está migrada» no significaba lo que yo creía:
escribía en la base pero leía del navegador. **No verifiqué una por una las
demás.** Estado real hoy:

| Pantalla | Supabase | localStorage | ¿Verificada a fondo? |
|---|---|---|---|
| delivery-notes | sí | sí (PDF subidos) | **sí** — arreglada hoy |
| quotes | sí | sí | no — tiene un `SEED` en `page.tsx:53` |
| inventory | sí | sí | no |
| expenses | sí | sí | no |
| commissions | **no** | sí | no |
| dashboard | **no** | sí | no |
| roi | **no** | sí | no |
| sales | **no** | sí | no |
| reports / audit / matrices | no | no | no — ¿de dónde sacan los datos? |

**Lo que hay que revisar en cada una:** si escribe en la base pero lee del
navegador (el error de notas de entrega), si tiene datos inventados, y si el
`localStorage` que usa es legítimo (preferencias de quien mira) o es un registro
que debería ser compartido.

### 2.2 Datos de ejemplo todavía en el código

Encontré cuatro constantes con datos sembrados. **No revisé qué hace cada una:**

- `app/admin/quotes/page.tsx:53` — `SEED` de cotizaciones, con un cliente real
  escrito a mano (`SERVICIOS Y SUMINISTROS V & B, C.A`)
- `lib/ux/inventory-fiscal.ts:240` — `SEED_NOTAS`
- `lib/ux/inventory-data.ts:34` — `SEEDS`
- `lib/ux/inventory-rotation.ts:8` — `SEED`

Pediste llevar los datos inventados a cero hace semanas. El de notas de entrega
seguía ahí hoy. **No puedo asegurar que estos cuatro no sean lo mismo.**

### 2.3 `history-data.ts` — 24 KB de datos reales dentro del código

Son datos **reales** sacados de los `.xls` (ventas 2023-04 a 2026-07), no
inventados. Pero están congelados en un archivo `.ts`: alimentan el dashboard, el
ROI y el centro de control, y **no se actualizan solos**. Hoy muestran hasta
julio de 2026.

No sé si eso fue una decisión consciente o un atajo que quedó. Hay que decidir si
se recalculan desde la base o se aceptan como foto fija.

### 2.4 Los 3 correlativos quemados

`documentos` está en 0 pero hay 3 números consumidos en Sumigases. Quemar el
número es deliberado y está documentado (`documentos-db.ts:50`). Lo que **no sé**
es por qué fallaron esos 3 guardados. Hay que reproducirlo con sesión iniciada.

### 2.5 Nunca probé el RLS con un usuario restringido

Reescribí 34 políticas. Verifiqué que **sin login no se lee nada** — eso sí está
probado, objeto por objeto. Lo que **no** probé es que un vendedor no pueda ver lo
que no le toca. Para eso hacen falta usuarios reales (ver 3.3).

### 2.6 Los PDF subidos de Valery

Siguen en `localStorage` a propósito: son archivos, no registros. Guardarlos bien
necesita Supabase Storage. **No está hecho ni planificado.** Si alguien limpia su
navegador, esos PDF se pierden.

### 2.7 Backups

Nunca se probó restaurar uno.

---

## 3. Decisiones tuyas — no puedo avanzar sin esto

### 3.1 Depósito de garantía por cilindro

`gases.deposito_usd` está en **0 para los 8 registros**. La vista
`garantias_cliente` va a devolver siempre cero, sin avisar que el dato falta.

- ¿Cuánto se cobra de depósito por cilindro, por gas?
- ¿Cuáles se rellenan en planta? (`se_rellena` está en `false` para todos)

### 3.2 ARGOMIX y CO2

Tienen ventas reales en el período jul-ago 2026 (ARGOMIX 24 u / $2.880 · CO2
4 u / $56) y **no están en la tabla `gases`**. ¿Los agrego a las dos empresas o
solo a Sumigases?

### 3.3 Los 9 usuarios

Solo existe el tuyo. Faltan: Raúl (owner Sud), Saúl (owner Sum), Leonardo, Angie,
Francisco, y almacén/ventas de cada empresa.

**Yo no puedo crear cuentas con contraseña** — las tenés que crear vos en
Supabase Auth. Yo cargo el rol y los permisos después.

### 3.4 Los 1.073 clientes

No existe el RIF en ningún archivo (verificado sobre 50+ archivos, todos los años,
ambas empresas; el cruce por nombre dio 14 de 5.027). El modelo ya acepta clientes
sin RIF.

Del PDF `Clientes.pdf` puedo sacar **nombres**, no fichas. ¿Los cargo así, o
buscás el export de Valery con las fichas completas?

### 3.5 Sudematin le vende a Sumigases

18 documentos, $10.842 en el libro de compras. Las dos empresas comercian entre
sí. **El modelo no lo contempla:** Sudematin es a la vez empresa y proveedor.

¿Se trata como un proveedor normal, o esas operaciones necesitan tratarse aparte
para no contar dos veces en los consolidados?

### 3.6 Las devoluciones son el 19% de la venta bruta

33 documentos, −$23.952 en cuatro semanas. No sé si es normal en el rubro. Si no
lo es, es un problema de negocio que ningún sistema arregla.

### 3.7 Reconectar Vercel a GitHub

Requiere autorización tuya sobre la organización:
1. https://github.com/apps/vercel/installations/new → `MacedoniaControl` → repo `macedonia`
2. Vercel → `sumicontrol` → Settings → Git → Connect Git Repository

Hasta entonces cada deploy lo hago a mano desde la carpeta local.

### 3.8 `main` está atrás

La rama `patch/greeg-ux-ui` tiene commits que `main` no tiene. Fusionar a la
rama de producción no lo hago sin que lo pidas:

```
git push origin HEAD:main
```

---

## 4. Lo que sí está verificado

Todo esto lo comprobé contra la base o la API en esta sesión, no de memoria.

| Qué | Cómo se verificó |
|---|---|
| 34 objetos, ninguno legible sin login | Consulta con llave anónima a cada uno, uno por uno |
| 4.303 productos (1.704 Sum / 2.599 Sud) | `count=exact` por empresa |
| 33 proveedores con RIF normalizado | Insertados y releídos |
| 33 cuentas por pagar · $29.663,48 | Insertadas; la vista `cuentas_saldo` da el mismo total |
| Vencido: $11.963 | Calculado por la vista con `current_date` |
| Clientes: dos sin RIF conviven; RIF repetido da 409 | Inserciones reales, después borradas |
| `documentos` + `documento_lineas` van y vuelven | Documento de prueba insertado, leído con la consulta de la pantalla, borrado |
| IVA 16% en `configuracion`, ambas empresas | Leído de la tabla |
| Tasa BCV en vivo: 787,52 | `/api/bcv` en producción |
| 43 tests, build limpio | `npm test` y `npm run build` |
| Producción responde y protege rutas | `curl` a `/`, `/login`, `/admin/*` |

**Ojo con esto:** «verificado» acá significa que la pieza funciona aislada. **No**
significa que la pantalla que la usa esté bien conectada — que es exactamente el
error que cometí con notas de entrega.

---

## 5. Qué propongo

Antes de cargar un dato más, la auditoría de la sección 2.1: las nueve pantallas,
una por una, mirando el código y no la memoria. Sale de ahí una lista de lo que
está realmente conectado y lo que no.

Cargar datos sobre pantallas que no sé si leen de la base es construir sobre algo
que no verifiqué.
