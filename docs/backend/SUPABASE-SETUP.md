# Puesta en marcha del backend (Supabase)

> **Todo el código está listo.** Este documento es la receta para ejecutarlo cuando decidas arrancar.
> No hace falta pagar para empezar: el **plan gratis alcanza para desarrollar y probar**.
>
> Última actualización: 2026-07-31

---


## Verificación de seguridad (obligatoria antes de datos reales)

Después de ejecutar `01`, `02` y `03`, ejecuta **`04-verificacion.sql`**.

Devuelve 7 filas. **Todas deben decir `OK`.** Si alguna dice `FALLA`, no cargues
datos reales hasta resolverla.

Comprueba, entre otras cosas:

- que las 16 tablas tengan RLS activo;
- que **ninguna vista se salte el RLS** (una vista sin `security_invoker = on`
  corre con los privilegios de su dueño y lee todo, ignorando las políticas:
  es la forma más silenciosa de romper la pared entre empresas);
- que el **costo de compra** no sea legible por vendedores;
- que el usuario **anónimo** no pueda leer finanzas ni auditoría;
- que el **log de auditoría sea inmutable** (sin políticas de UPDATE ni DELETE).


## Aclaración importante sobre el costo

| | Plan Free | Plan Pro ($25/mes) |
|---|---|---|
| Postgres + Auth + Storage + RLS | ✅ | ✅ |
| Suficiente para 10 usuarios y este volumen | ✅ | ✅ |
| **Backups diarios / recuperación a un punto en el tiempo** | ❌ | ✅ |
| Se pausa tras 7 días sin uso | Sí | No |

**Recomendación:** crea el proyecto **gratis hoy**, desarrolla y prueba con datos de prueba. Cuando
vayas a cargar **datos reales de trabajo**, sube a Pro. **Subir de Free a Pro es un clic en el
dashboard** — mismo proyecto, misma base, no hay que migrar nada.

> ⚠️ No pongas datos reales de la empresa en el plan Free. Sin backups, un error humano no tiene
> vuelta atrás.

---

## Archivos preparados

| Archivo | Qué hace |
|---|---|
| `supabase/01-schema.sql` | Tablas, tipos, índices, vista `existencias` y las reglas duras (constraints) |
| `supabase/02-rls.sql` | Seguridad real por empresa y rol |
| `supabase/03-seed.sql` | Empresas y catálogo de partidas de gasto |
| `lib/supabase/client.ts` | Cliente del navegador |
| `lib/supabase/server.ts` | Cliente de servidor (Route Handlers) |

---

## Paso a paso

### 1. Crear el proyecto (5 min)
1. Entra a **supabase.com** → *New project*.
2. **Región:** `East US (North Virginia)` — la más cercana a Venezuela.
3. Guarda la contraseña de la base en un lugar seguro.
4. Copia de *Project Settings → API*:
   - `Project URL`
   - `anon public key`
   - `service_role key` ← **secreta, nunca al navegador**

### 2. Crear el esquema (2 min)
En el **SQL Editor** de Supabase, ejecuta en este orden:
1. `supabase/01-schema.sql`
2. `supabase/02-rls.sql`
3. `supabase/03-seed.sql`

### 3. Variables de entorno
Crea `.env.local` en la raíz del proyecto (ya está en `.gitignore`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Y las mismas tres en **Vercel → Project Settings → Environment Variables**.

### 4. Instalar la dependencia
```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 5. Crear los usuarios (10 personas)
En *Authentication → Users → Add user* (email + contraseña), y luego por cada uno, en el SQL Editor:

```sql
insert into usuarios (id, nombre, rol, empresa_id) values
  ('<uuid-de-auth>', 'Greeg Vizcaíno',  'owner',    null),          -- owner: todas las empresas
  ('<uuid-de-auth>', 'Admin Sumigases', 'admin',    'sumigases'),
  ('<uuid-de-auth>', 'Admin Sudematin', 'admin',    'sudematin'),
  ('<uuid-de-auth>', 'Vendedor 1',      'vendedor', 'sumigases'),
  ('<uuid-de-auth>', 'Técnico 1',       'tecnico',  'sumigases');
```
> El `owner` va con `empresa_id = null` — así ve ambas empresas y el consolidado.

### 6. Migrar los datos que ya existen
Los datos reales viven hoy en archivos del repo. Para subirlos:

| Origen | Destino |
|---|---|
| `lib/ux/inventory-fisico-seed.json` (1.703 productos) | `productos` |
| `lib/ux/costos.ts` (costos y precios por empresa) | `productos.costo_unitario` / `precio_unitario` |
| `lib/ux/history-data.ts` (histórico 2022–2026) | se puede dejar como está (es histórico, no transaccional) |

Un script de Node que lea esos archivos e inserte con el `service_role` resuelve la carga.

### 7. Migrar la app, módulo por módulo
La arquitectura ya está preparada: cada módulo usa un store aislado con firmas estables
(`get*`, `add*`, `use*`). **Se cambia el cuerpo, no las firmas** — las páginas no se tocan.

Orden sugerido (de menos a más riesgo):
1. `tasa_bcv` — la más simple, y de paso queda compartida entre todos
2. `gastos` + `trabajadores` + `ventas_asignadas`
3. `movimientos_inventario` (kardex)
4. `documentos` (notas de entrega y cotizaciones)
5. `notas_fiscales` + `fiscal_tx`
6. `notificaciones` y `auditoria`

### 8. Activar la autenticación real
1. Página de login (email + contraseña).
2. Middleware que proteja `/admin/*`.
3. En `lib/ux/session.ts`, reemplazar la lectura de `localStorage` por el rol que viene del servidor.
   **La firma de `puedeVerRegistros()` / `puedeVerFinanzas()` no cambia.**

### 9. Tarea programada: tasa BCV cada hora
En `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/bcv", "schedule": "0 * * * *" }] }
```
La ruta consulta el BCV (ya existe `/api/bcv`) e inserta en `tasa_bcv`.

---

## Reglas de negocio que la base hace cumplir sola

No dependen de que el front esté bien programado:

- **Pared entre empresas**: RLS filtra por `empresa_id`; el owner es la única excepción.
- **Auditoría solo OWNER**: ni siquiera los administradores pueden leerla.
- **Gastos y utilidad**: solo owner y admin.
- **Movimientos manuales exigen motivo** (`constraint manual_requiere_motivo`).
- **Un documento no paga comisión dos veces** (`unique` en `ventas_asignadas`).
- **Idempotencia de importación**: índice único por documento+código+fecha; y `hash_archivo`
  impide subir el mismo archivo dos veces.
- **Borrar una importación revierte sus movimientos** (`on delete cascade`).
- **Gasto en Bs exige tasa** (`constraint bs_requiere_tasa`).

---

## Qué NO resuelve el backend (siguen siendo decisiones tuyas)

1. **Doble descuento**: si una nota de entrega de Macedonia descuenta inventario y esa misma venta
   llega después en el export de Valery, se descuenta dos veces. Hay que decidir cuál manda.
2. **Clasificación de las NET** en venta real / consumo interno / traslado.
3. **Traslados entre empresas** inflando el consolidado.
4. **Qué cifra es la oficial** cuando el Estado de Resultado y Valery no coinciden.

---

## Verificación antes de dar por bueno

- [ ] Un vendedor **no** puede leer `gastos` (debe dar error o venir vacío).
- [ ] Un admin de Sumigases **no** ve datos de Sudematin.
- [ ] Un admin **no** puede leer `auditoria`.
- [ ] Al borrar una importación, sus movimientos desaparecen.
- [ ] Subir el mismo archivo dos veces **falla**.
- [ ] Un movimiento manual sin motivo **falla**.
- [ ] Asignar el mismo documento a dos vendedores **falla**.

Probar cada punto con el usuario real (no con `service_role`, que se salta el RLS).
