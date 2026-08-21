# Permisos por usuario — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que el Owner ajuste desde la pantalla qué ve cada persona, sin tocar código, y que el sistema le avise cuando alguien intenta entrar a donde no debe.

**Arquitectura:** los permisos viven en una columna `jsonb` de `usuarios`. Una función `puede(clave)` los consulta y devuelve `true` incondicionalmente para el Owner. Las 34 políticas de RLS pasan de preguntar por rol a llamar a `puede()`. El front oculta las secciones sin permiso y el layout de `/admin` bloquea el acceso por URL.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + RLS) · pruebas con `node --test` (nativo, sin dependencias).

**Spec:** `docs/superpowers/specs/2026-08-19-permisos-por-usuario-design.md`

## Restricciones globales

- **Node 25** ejecuta TypeScript de forma nativa. Las pruebas se corren con `npm test`. No añadir vitest ni jest.
- **Los imports en archivos `.test.ts` llevan extensión `.ts`** (`from "./identidad.ts"`). Está habilitado `allowImportingTsExtensions`.
- **Textos de interfaz en español**, tuteo, sin signos de admiración.
- **Controles de 44px mínimo** de área táctil.
- **Colores por token semántico**, nunca hex suelto. El interruptor encendido usa `bg-brand-strong`.
- **Ningún `select *` sobre `productos`**: `costo_unitario` está revocado por columna. Listar columnas explícitamente.
- **Tras cualquier cambio de políticas**, volver a correr `supabase/04-verificacion.sql` y confirmar 7 filas en OK.
- **Las claves de permiso son los slugs de las rutas**: `dashboard`, `quotes`, `delivery-notes`, `sales`, `products`, `inventory`, `cylinders`, `expenses`, `commissions`, `receivables`, `payables`, `purchases`, `reports`, `roi`, `matrices`, `settings`, `users`, `audit`. Más tres transversales: `ver_registros`, `ver_costos`, `otra_empresa`.

## Fuera de alcance de este plan

Conectar los 18 módulos a Supabase (hoy usan `localStorage`) y la migración de datos del navegador. Son un plan aparte: `2026-08-XX-migracion-modulos-supabase.md`. Este plan deja los permisos funcionando sobre la estructura actual.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/07-permisos.sql` | Columna `permisos`, función `puede()`, restricción de Owner irrevocable |
| `supabase/08-alertas.sql` | `veces`, `ultima_vez`, `clave_grupo`, índice único, arreglo de `para_rol` |
| `supabase/09-politicas-permisos.sql` | Reescritura de las 34 políticas |
| `supabase/04-verificacion.sql` | Actualizar las 7 pruebas al modelo nuevo |
| `lib/auth/permisos.ts` | Catálogo de módulos, plantillas por rol, tipos |
| `lib/auth/permisos.test.ts` | Pruebas del catálogo y las plantillas |
| `lib/auth/sesion-servidor.ts` | Añadir `permisos` a `UsuarioSesion` |
| `lib/auth/guard.ts` | Comprobación de acceso + registro del intento |
| `components/ui/Switch.tsx` | El interruptor accesible |
| `components/layout/Sidebar.tsx` | Filtrar por permisos |
| `app/admin/layout.tsx` | Bloqueo por URL y redirección |
| `app/admin/users/actions.ts` | Acción para alternar permisos |
| `app/admin/users/UsuariosPanel.tsx` | Ficha desplegable con interruptores |

---

## Task 1: Catálogo de módulos y plantillas por rol

Es la base de todo lo demás y no depende de la base de datos, así que va primero y se puede probar de inmediato.

**Files:**
- Create: `lib/auth/permisos.ts`
- Test: `lib/auth/permisos.test.ts`

**Interfaces:**
- Consumes: `navGroups` de `lib/ux/nav.ts`
- Produces: `CLAVES_MODULO: readonly string[]`, `CLAVES_ESPECIALES: readonly string[]`, `type Permisos = Record<string, boolean>`, `plantillaDeRol(rol: Rol): Permisos`, `claveDeRuta(pathname: string): string | null`

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/auth/permisos.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { plantillaDeRol, claveDeRuta, CLAVES_MODULO } from "./permisos.ts";

describe("plantillaDeRol", () => {
  test("ninguna plantilla deja al usuario sin ningun modulo", () => {
    for (const rol of ["owner", "admin", "vendedor", "tecnico"] as const) {
      const p = plantillaDeRol(rol);
      const encendidos = Object.values(p).filter(Boolean).length;
      assert.ok(encendidos > 0, `${rol} quedaria sin acceso a nada`);
    }
  });

  test("el vendedor ve operacion e inventario, no finanzas", () => {
    const p = plantillaDeRol("vendedor");
    assert.equal(p["quotes"], true);
    assert.equal(p["delivery-notes"], true);
    assert.equal(p["inventory"], true);
    assert.equal(p["expenses"], false);
    assert.equal(p["commissions"], false);
  });

  test("el tecnico solo ve cilindros", () => {
    const p = plantillaDeRol("tecnico");
    assert.equal(p["cylinders"], true);
    const encendidos = Object.entries(p).filter(([, v]) => v).map(([k]) => k);
    assert.deepEqual(encendidos, ["cylinders"]);
  });

  test("el admin ve todo de su empresa menos registros", () => {
    const p = plantillaDeRol("admin");
    assert.equal(p["expenses"], true);
    assert.equal(p["users"], false);
    assert.equal(p["audit"], false);
    assert.equal(p["ver_registros"], false);
  });

  test("el owner tiene todo encendido", () => {
    const p = plantillaDeRol("owner");
    assert.ok(Object.values(p).every(Boolean));
  });
});

describe("claveDeRuta", () => {
  test("reconoce la ruta con empresa", () => {
    assert.equal(claveDeRuta("/admin/sumigases/expenses"), "expenses");
    assert.equal(claveDeRuta("/admin/sudematin/delivery-notes"), "delivery-notes");
  });

  test("reconoce la ruta consolidada", () => {
    assert.equal(claveDeRuta("/admin/inventory"), "inventory");
  });

  test("reconoce sub-rutas", () => {
    assert.equal(claveDeRuta("/admin/sumigases/inventory/movimientos"), "inventory");
  });

  test("devuelve null si no es una seccion conocida", () => {
    assert.equal(claveDeRuta("/login"), null);
    assert.equal(claveDeRuta("/"), null);
  });
});

describe("CLAVES_MODULO", () => {
  test("cubre las 18 secciones del menu", () => {
    assert.equal(CLAVES_MODULO.length, 18);
  });

  test("no tiene claves repetidas", () => {
    assert.equal(new Set(CLAVES_MODULO).size, CLAVES_MODULO.length);
  });
});
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './permisos.ts'`

- [ ] **Step 3: Implementar**

```ts
// lib/auth/permisos.ts
// Catálogo de permisos. Las claves son los SLUGS DE LAS RUTAS para que el menú y
// los permisos no se puedan desincronizar: si aparece una sección nueva, su
// permiso ya tiene nombre.

import { navGroups } from "@/lib/ux/nav";
import type { Rol } from "@/lib/ux/session";

/** Los 18 módulos del menú, derivados de la navegación real. */
export const CLAVES_MODULO: readonly string[] = navGroups
  .flatMap((g) => g.items)
  .map((i) => i.href.replace("/admin/", ""));

/** Capacidades transversales: no son secciones del menú. */
export const CLAVES_ESPECIALES = ["ver_registros", "ver_costos", "otra_empresa"] as const;

export const TODAS_LAS_CLAVES = [...CLAVES_MODULO, ...CLAVES_ESPECIALES];

export type Permisos = Record<string, boolean>;

const vacio = (): Permisos =>
  Object.fromEntries(TODAS_LAS_CLAVES.map((k) => [k, false]));

const encender = (base: Permisos, claves: string[]): Permisos => {
  const p = { ...base };
  for (const k of claves) p[k] = true;
  return p;
};

const VENDEDOR = ["dashboard", "quotes", "delivery-notes", "sales", "products", "inventory"];
const TECNICO = ["cylinders"];
/** El admin ve todo de su empresa menos usuarios, auditoría y registros. */
const ADMIN_APAGADOS = ["users", "audit", "ver_registros"];

/**
 * Permisos iniciales al crear un usuario. El rol es una PLANTILLA, no una jaula:
 * a partir de aquí el Owner ajusta libremente cada interruptor.
 */
export function plantillaDeRol(rol: Rol): Permisos {
  if (rol === "owner") {
    return Object.fromEntries(TODAS_LAS_CLAVES.map((k) => [k, true]));
  }
  if (rol === "admin") {
    const p = Object.fromEntries(TODAS_LAS_CLAVES.map((k) => [k, true])) as Permisos;
    for (const k of ADMIN_APAGADOS) p[k] = false;
    return p;
  }
  if (rol === "vendedor") return encender(vacio(), VENDEDOR);
  return encender(vacio(), TECNICO);
}

/**
 * Ruta -> clave de permiso. Normaliza /admin/<empresa>/<slug> a <slug> y
 * reconoce sub-rutas (/inventory/movimientos -> inventory).
 */
export function claveDeRuta(pathname: string): string | null {
  const norm = pathname.replace(/^\/admin\/(sumigases|sudematin)(\/|$)/, "/admin$2");
  if (!norm.startsWith("/admin/")) return null;
  const resto = norm.slice("/admin/".length);
  if (!resto) return null;
  // La más larga primero: "delivery-notes" antes que cualquier prefijo suyo.
  const orden = [...CLAVES_MODULO].sort((a, b) => b.length - a.length);
  return orden.find((c) => resto === c || resto.startsWith(`${c}/`)) ?? null;
}

/** ¿Puede ver esta clave? El Owner siempre puede: es irrevocable por construcción. */
export function puedeVer(permisos: Permisos, rol: Rol, clave: string): boolean {
  if (rol === "owner") return true;
  return permisos[clave] === true;
}
```

- [ ] **Step 4: Correr y confirmar que pasa**

Run: `npm test`
Expected: PASS — todas las pruebas de `permisos` en verde. Si `CLAVES_MODULO.length` no da 18, revisar `lib/ux/nav.ts`: el conteo debe coincidir con los ítems reales del menú.

- [ ] **Step 5: Verificar el ciclo rojo-verde**

Cambiar `if (rol === "owner") return true;` por `return permisos[clave] === true;` en `puedeVer`. Correr `npm test`: debe fallar. Restaurar y volver a correr: debe pasar. Un test que nunca falló no prueba nada.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/permisos.ts lib/auth/permisos.test.ts
git commit -m "feat(permisos): catalogo de modulos y plantillas por rol"
```

---

## Task 2: El interruptor accesible

Componente aislado, sin dependencias del resto. Se puede construir y revisar solo.

**Files:**
- Create: `components/ui/Switch.tsx`

**Interfaces:**
- Produces: `<Switch checked onChange disabled label />`

- [ ] **Step 1: Implementar**

```tsx
// components/ui/Switch.tsx
"use client";

// Interruptor on/off. Es un <button role="switch"> real, no un div con onClick:
// así funciona con teclado y lo anuncian los lectores de pantalla.
//
// El estado se distingue por POSICIÓN y color, nunca solo por color.
// Área táctil de 44px aunque la píldora se vea de 27: se usa desde el celular.

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-[52px] flex-none items-center justify-center
                 rounded-xl transition focus:outline-none focus-visible:ring-2
                 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden
        className={`h-[27px] w-[46px] rounded-full transition-colors motion-reduce:transition-none ${
          checked ? "bg-brand-strong" : "bg-border-strong"
        }`}
      />
      <span
        aria-hidden
        className={`absolute h-[21px] w-[21px] rounded-full bg-white shadow transition-transform
                    motion-reduce:transition-none ${checked ? "translate-x-[9px]" : "-translate-x-[9px]"}`}
      />
    </button>
  );
}
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores, build exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Switch.tsx
git commit -m "feat(ui): interruptor on/off accesible"
```

---

## Task 3: Columna de permisos y función `puede()` en la base

**Files:**
- Create: `supabase/07-permisos.sql`

**Interfaces:**
- Produces: columna `usuarios.permisos jsonb`, función `puede(text) returns boolean`

- [ ] **Step 1: Escribir el SQL**

```sql
-- supabase/07-permisos.sql
-- Permisos por usuario. Ejecutar en el SQL Editor. Se puede repetir sin problema.

alter table usuarios
  add column if not exists permisos jsonb not null default '{}'::jsonb;

-- El Owner puede SIEMPRE, sin mirar los permisos.
-- Es irrevocable POR CONSTRUCCION, no por una regla de pantalla que alguien
-- pueda olvidar: aunque se le apaguen todos los interruptores, sigue entrando.
create or replace function puede(clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_owner()
         or coalesce((permisos ->> clave)::boolean, false)
     from usuarios
     where id = auth.uid() and activo),
    false)
$$;

-- Un Owner no se puede desactivar. En la BASE, no en el formulario.
create or replace function impedir_owner_inactivo() returns trigger
language plpgsql as $$
begin
  if old.rol = 'owner' and new.activo = false then
    raise exception 'Un Owner no puede desactivarse.';
  end if;
  return new;
end $$;

drop trigger if exists trg_owner_activo on usuarios;
create trigger trg_owner_activo
  before update on usuarios
  for each row execute function impedir_owner_inactivo();
```

- [ ] **Step 2: Ejecutar y comprobar**

Pegar en el SQL Editor de Supabase y correr. Después, para comprobar:

```sql
select puede('expenses') as owner_ve_gastos_sin_permisos;
```

Expected: `true` — el Owner puede aunque su columna `permisos` esté vacía. Si da `false`, la función no está tomando `es_owner()`.

- [ ] **Step 3: Comprobar el trigger**

```sql
update usuarios set activo = false where rol = 'owner';
```

Expected: ERROR `Un Owner no puede desactivarse.` Si el update pasa, el trigger no se creó.

- [ ] **Step 4: Commit**

```bash
git add supabase/07-permisos.sql
git commit -m "feat(db): columna de permisos, funcion puede() y owner irrevocable"
```

---

## Task 4: Estructura de alertas con contador

**Files:**
- Create: `supabase/08-alertas.sql`

**Interfaces:**
- Produces: `notificaciones.veces`, `.ultima_vez`, `.clave_grupo`, índice `notif_grupo_abierto`, función `alertar(...)`

- [ ] **Step 1: Escribir el SQL**

```sql
-- supabase/08-alertas.sql
-- Alertas agrupadas con contador, y el arreglo de para_rol.

alter table notificaciones
  add column if not exists veces       int not null default 1,
  add column if not exists ultima_vez  timestamptz not null default now(),
  add column if not exists clave_grupo text;

-- Una sola alerta ABIERTA por grupo. Al marcarla revisada el indice la libera,
-- y el siguiente intento abre una nueva: asi se sabe que volvio a pasar despues
-- de darlo por cerrado.
create unique index if not exists notif_grupo_abierto
  on notificaciones (clave_grupo)
  where estado = 'pendiente' and clave_grupo is not null;

-- ARREGLO INDEPENDIENTE: para_rol existia y NINGUNA politica la consultaba.
-- Una alerta marcada "solo Owner" la veia cualquier administrador.
drop policy if exists notificaciones_lectura on notificaciones;
create policy notificaciones_lectura on notificaciones
  for select using (
    puede_empresa(empresa_id)
    and (
      para_usuario = auth.uid()
      or (para_rol is not null and auth_rol() = para_rol)
      or (para_rol is null and para_usuario is null and auth_rol() in ('owner','admin'))
    )
  );

-- Crea la alerta o incrementa la que ya esta abierta.
create or replace function alertar(
  p_clave_grupo text, p_tipo text, p_titulo text, p_mensaje text,
  p_para_rol rol_usuario, p_empresa text, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notificaciones (empresa_id, tipo, titulo, mensaje, para_rol,
                              clave_grupo, payload, veces, ultima_vez)
  values (p_empresa, p_tipo, p_titulo, p_mensaje, p_para_rol,
          p_clave_grupo, p_payload, 1, now())
  on conflict (clave_grupo) where estado = 'pendiente' and clave_grupo is not null
  do update set veces      = notificaciones.veces + 1,
                ultima_vez = now(),
                mensaje    = p_mensaje;
end $$;
```

- [ ] **Step 2: Ejecutar y comprobar el contador**

```sql
select alertar('prueba:1','acceso_denegado','Prueba','Primer intento','owner','sumigases','{}'::jsonb);
select alertar('prueba:1','acceso_denegado','Prueba','Segundo intento','owner','sumigases','{}'::jsonb);
select veces, titulo from notificaciones where clave_grupo = 'prueba:1';
```

Expected: **una sola fila con `veces = 2`**. Si aparecen dos filas, el índice único parcial no se creó.

- [ ] **Step 3: Limpiar la prueba**

```sql
delete from notificaciones where clave_grupo = 'prueba:1';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/08-alertas.sql
git commit -m "feat(db): alertas agrupadas con contador y arreglo de para_rol"
```

---

## Task 5: Reescribir las 34 políticas

⚠️ **Es el paso de mayor riesgo del plan.** Las políticas actuales funcionan y pasaron las 7 pruebas. Por eso la Task 6 (actualizar la verificación) se escribe ANTES de dar esto por bueno.

**Files:**
- Create: `supabase/09-politicas-permisos.sql`

- [ ] **Step 1: Escribir el SQL**

Sustituir en cada política el filtro por rol por `puede('<clave>')`, conservando `puede_empresa(empresa_id)`. Ejemplo del patrón, aplicado a las tres familias:

```sql
-- supabase/09-politicas-permisos.sql

-- FINANZAS: antes puede_finanzas() (owner+admin), ahora permiso por persona.
drop policy if exists gastos_finanzas on gastos;
create policy gastos_finanzas on gastos
  for all using (puede_empresa(empresa_id) and puede('expenses'))
  with check (puede_empresa(empresa_id) and puede('expenses'));

drop policy if exists trabajadores_finanzas on trabajadores;
create policy trabajadores_finanzas on trabajadores
  for all using (puede_empresa(empresa_id) and puede('commissions'))
  with check (puede_empresa(empresa_id) and puede('commissions'));

drop policy if exists ventas_asignadas_finanzas on ventas_asignadas;
create policy ventas_asignadas_finanzas on ventas_asignadas
  for all using (puede_empresa(empresa_id) and puede('commissions'))
  with check (puede_empresa(empresa_id) and puede('commissions'));

-- AUDITORIA: antes es_owner(), ahora el permiso (que para el Owner siempre es true).
drop policy if exists auditoria_solo_owner on auditoria;
create policy auditoria_lectura on auditoria
  for select using (puede('audit'));

-- INVENTARIO
drop policy if exists movimientos_lectura on movimientos_inventario;
create policy movimientos_lectura on movimientos_inventario
  for select using (puede_empresa(empresa_id) and puede('inventory'));

-- PRODUCTOS
drop policy if exists productos_lectura on productos;
create policy productos_lectura on productos
  for select using (puede_empresa(empresa_id) and puede('products'));

-- DOCUMENTOS
drop policy if exists documentos_lectura on documentos;
create policy documentos_lectura on documentos
  for select using (puede_empresa(empresa_id) and puede('delivery-notes'));
```

Repetir el patrón para el resto de las tablas: `importaciones` → `puede('settings')`, `notas_fiscales` y `fiscal_tx` → `puede('inventory')`, `tasa_bcv` → lectura para cualquier autenticado (no cambia).

**Nota sobre la pared entre empresas:** `puede_empresa()` se conserva tal cual. El permiso `otra_empresa` se aplica ampliando esa función:

```sql
create or replace function puede_empresa(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select es_owner()
      or coalesce(auth_empresa() = e, false)
      or puede('otra_empresa')
$$;
```

- [ ] **Step 2: Ejecutar**

Pegar en el SQL Editor y correr. Expected: `Success. No rows returned`.

- [ ] **Step 3: NO dar por bueno todavía**

Continuar a la Task 6 antes de afirmar que esto funciona. Una política que se ejecuta sin error no es una política correcta.

- [ ] **Step 4: Commit**

```bash
git add supabase/09-politicas-permisos.sql
git commit -m "feat(db): las politicas consultan permisos por usuario en vez del rol"
```

---

## Task 6: Actualizar la verificación de seguridad

**Files:**
- Modify: `supabase/04-verificacion.sql`

- [ ] **Step 1: Añadir dos pruebas nuevas al `union all`**

```sql
  union all

  -- 8) El Owner no puede quedarse fuera: puede() ignora sus permisos.
  select 8, 'Owner irrevocable',
         case when exists (
           select 1 from pg_trigger where tgname = 'trg_owner_activo'
         ) and exists (
           select 1 from pg_proc where proname = 'puede'
         ) then 'OK — funcion puede() y trigger presentes'
         else 'FALLA — falta el trigger o la funcion' end

  union all

  -- 9) Las alertas se agrupan: una sola abierta por clave.
  select 9, 'Alertas agrupadas',
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'notif_grupo_abierto'
         ) then 'OK — indice de agrupacion presente'
         else 'FALLA — sin indice: cada intento crearia una alerta nueva' end
```

- [ ] **Step 2: Correr la verificación completa**

Pegar el `04-verificacion.sql` entero en el SQL Editor.
Expected: **9 filas, todas en OK.** Si la 2 (vistas con `security_invoker`) o la 4 (costo oculto) pasan a FALLA, la reescritura de políticas rompió algo que ya funcionaba: revisar antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add supabase/04-verificacion.sql
git commit -m "test(db): la verificacion cubre el modelo de permisos por usuario"
```

---

## Task 7: La sesión carga los permisos

**Files:**
- Modify: `lib/auth/sesion-servidor.ts`

**Interfaces:**
- Produces: `UsuarioSesion` gana `permisos: Permisos`

- [ ] **Step 1: Modificar la consulta y el tipo**

```ts
// En UsuarioSesion, añadir:
  permisos: Permisos;

// En la consulta, añadir la columna:
  .select("id, nombre, rol, empresa_id, activo, permisos")

// En el objeto devuelto:
  permisos: (data.permisos as Permisos) ?? {},
```

Y añadir el import: `import type { Permisos } from "./permisos";`

- [ ] **Step 2: Añadir el ayudante de acceso**

```ts
/** ¿Puede ver esta sección? El Owner siempre puede. */
export function sesionPuede(u: UsuarioSesion, clave: string): boolean {
  return u.rol === "owner" || u.permisos[clave] === true;
}

/** Primera sección disponible: a donde se redirige a quien no tiene permiso. */
export function primeraSeccion(u: UsuarioSesion): string {
  const base = u.empresaId ? `/admin/${u.empresaId}` : "/admin";
  const clave = CLAVES_MODULO.find((c) => sesionPuede(u, c));
  return clave ? `${base}/${clave}` : "/sin-acceso";
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/sesion-servidor.ts
git commit -m "feat(auth): la sesion carga los permisos del usuario"
```

---

## Task 8: El menú oculta lo que no tiene permiso

**Files:**
- Modify: `components/layout/Sidebar.tsx`, `components/layout/AppShell.tsx`

- [ ] **Step 1: Pasar los permisos al Sidebar**

`AppShell` recibe la sesión desde el layout servidor y se la pasa al `Sidebar` como prop `permisos` y `rol`.

- [ ] **Step 2: Filtrar los grupos**

```tsx
const gruposVisibles = navGroups
  .map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      rol === "owner" || permisos[i.href.replace("/admin/", "")] === true),
  }))
  .filter((g) => g.items.length > 0);
```

Un grupo sin ítems visibles no se renderiza: no debe quedar un encabezado "Finanzas" con nada debajo.

- [ ] **Step 3: Mensaje cuando no hay nada**

```tsx
{gruposVisibles.length === 0 && (
  <p className="px-3 py-4 text-sm text-muted">
    No tienes secciones asignadas. Pídele al Owner que te dé acceso.
  </p>
)}
```

Sin esto, un usuario sin permisos ve un menú vacío y parece que la app está rota.

- [ ] **Step 4: Verificar**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/layout/Sidebar.tsx components/layout/AppShell.tsx
git commit -m "feat(nav): el menu oculta las secciones sin permiso"
```

---

## Task 9: Bloqueo por URL, redirección y alerta

**Files:**
- Create: `lib/auth/guard.ts`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Produces: `exigirPermiso(pathname): Promise<void>` — redirige si no puede

- [ ] **Step 1: Implementar el guardia**

```ts
// lib/auth/guard.ts
// Comprobación de acceso por URL. Va en el layout de /admin y no en el proxy:
// el proxy corre en CADA peticion y consultar la base ahi es lento. El layout
// es el punto por donde pasan las 18 secciones, e igual de imposible de saltar
// desde el navegador.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, sesionPuede, primeraSeccion } from "./sesion-servidor";
import { claveDeRuta } from "./permisos";

export async function exigirPermiso(pathname: string) {
  const u = await getUsuarioSesion();
  if (!u) redirect("/login");

  const clave = claveDeRuta(pathname);
  if (!clave || sesionPuede(u, clave)) return;

  // Queda rastro completo en auditoria, y una alerta AGRUPADA para el Owner.
  const sb = await createClient();
  await sb.from("auditoria").insert({
    empresa_id: u.empresaId,
    usuario_id: u.id,
    accion: "acceso_denegado",
    entidad: "seccion",
    entidad_id: clave,
    detalle: { ruta: pathname },
  });

  await sb.rpc("alertar", {
    p_clave_grupo: `acceso-denegado:${u.id}:${clave}`,
    p_tipo: "acceso_denegado",
    p_titulo: "Intento de acceso sin permiso",
    p_mensaje: `${u.nombre} intentó entrar a ${clave}.`,
    p_para_rol: "owner",
    p_empresa: u.empresaId,
    p_payload: { ruta: pathname, usuario: u.usuario },
  });

  redirect(`${primeraSeccion(u)}?sinpermiso=${encodeURIComponent(clave)}`);
}
```

- [ ] **Step 2: Llamarlo desde el layout**

En `app/admin/layout.tsx`, antes de renderizar:

```tsx
import { headers } from "next/headers";
import { exigirPermiso } from "@/lib/auth/guard";

const ruta = (await headers()).get("x-pathname") ?? "";
await exigirPermiso(ruta);
```

El `proxy` debe añadir esa cabecera: `res.headers.set("x-pathname", req.nextUrl.pathname)`.

- [ ] **Step 3: Mostrar el mensaje**

En `AppShell`, si `searchParams.sinpermiso` existe, mostrar un aviso arriba:
`No tienes permiso para ver <sección>.`

- [ ] **Step 4: Probar a mano**

Con un usuario de prueba sin `expenses`, escribir `/admin/sumigases/expenses` en el navegador.
Expected: redirige a su primera sección, con el mensaje. En Supabase, `select veces, mensaje from notificaciones where tipo = 'acceso_denegado'` debe mostrar la alerta. Repetir 3 veces: `veces` debe llegar a 3 **en la misma fila**.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/guard.ts app/admin/layout.tsx proxy.ts components/layout/AppShell.tsx
git commit -m "feat(auth): bloqueo por URL con redireccion y alerta al Owner"
```

---

## Task 10: Alterar permisos desde la pantalla

**Files:**
- Modify: `app/admin/users/actions.ts`, `app/admin/users/UsuariosPanel.tsx`

- [ ] **Step 1: Acción de servidor**

```ts
export async function alternarPermiso(
  usuarioId: string, clave: string, valor: boolean,
): Promise<Resultado> {
  try {
    await exigirOwner();
  } catch (e) {
    return { error: (e as Error).message, ok: null };
  }
  if (!TODAS_LAS_CLAVES.includes(clave)) return { error: "Permiso desconocido.", ok: null };

  const admin = createAdminClient();
  const { data: u } = await admin.from("usuarios")
    .select("rol, permisos").eq("id", usuarioId).maybeSingle();
  if (!u) return { error: "Usuario no encontrado.", ok: null };
  if (u.rol === "owner") {
    return { error: "El Owner tiene acceso total y no se puede limitar.", ok: null };
  }

  const permisos = { ...(u.permisos as Permisos), [clave]: valor };
  const { error } = await admin.from("usuarios").update({ permisos }).eq("id", usuarioId);
  if (error) return { error: error.message, ok: null };

  revalidatePath("/admin/users");
  return { error: null, ok: null };
}
```

- [ ] **Step 2: Aplicar la plantilla al crear**

En `crearUsuario`, al insertar la fila añadir: `permisos: plantillaDeRol(rol)`.

- [ ] **Step 3: Ficha desplegable con interruptores**

Cada fila de la tabla se despliega mostrando los 18 módulos agrupados como el menú, más las 3 especiales separadas al final sobre fondo de aviso. Cada uno con `<Switch>`.

Actualización optimista: se cambia en pantalla al instante y **se revierte si el servidor rechaza**. Nunca debe quedar la pantalla diciendo ON mientras la base dice OFF.

```tsx
async function alternar(usuarioId: string, clave: string, valor: boolean) {
  setLocal((p) => ({ ...p, [clave]: valor }));       // optimista
  const r = await alternarPermiso(usuarioId, clave, valor);
  if (r.error) {
    setLocal((p) => ({ ...p, [clave]: !valor }));    // revertir
    setAviso(r.error);
  }
}
```

Para un Owner, los interruptores se muestran encendidos y `disabled`, con la nota:
*"El Owner tiene acceso total. Es irrevocable por diseño."*

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores, exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users/
git commit -m "feat(usuarios): interruptores de permisos por persona"
```

---

## Task 11: Alerta tras 3 contraseñas fallidas

**Files:**
- Modify: `app/login/actions.ts`

- [ ] **Step 1: Contar los fallos**

En `entrar`, cuando `signInWithPassword` devuelve error, registrar el intento en `auditoria` con `accion: "login_fallido"` y `entidad_id: <usuario>`. Después contar los fallidos de ese usuario en los últimos 15 minutos; si son 3 o más, llamar a `alertar` con `clave_grupo = "login-fallido:<usuario>"`.

Se usa el cliente administrador porque no hay sesión: nadie está autenticado todavía.

- [ ] **Step 2: Probar**

Fallar tres veces con el mismo usuario. Expected: una alerta con `veces >= 1` y mensaje indicando el usuario. Los dos primeros fallos **no** generan alerta: uno o dos son un error de tecleo.

- [ ] **Step 3: Commit**

```bash
git add app/login/actions.ts
git commit -m "feat(auth): alerta al Owner tras 3 contrasenas fallidas seguidas"
```

---

## Task 12: Reescribir CLAUDE.md

Las reglas cambiaron. Si el documento sigue diciendo "irrompibles", miente.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Reescribir la sección de reglas**

Las tres reglas (registros solo Owner, finanzas Owner+Admin, pared entre empresas) pasan de **IRROMPIBLES** a **valores por defecto configurables por el Owner**. Dejar constancia de que fue una decisión del cliente tomada el 2026-08-19, y que la única regla que sigue siendo absoluta es que **el Owner no puede quedarse sin acceso**.

Añadir: *"Las claves de permiso son los slugs de las rutas. Si agregas una sección al menú, su permiso ya tiene nombre — no inventes uno nuevo."*

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: las reglas duras pasan a ser configurables por el Owner"
```

---

## Verificación final

Antes de dar el plan por terminado, correr y pegar la evidencia:

```bash
npm test                    # esperado: todas en verde, 0 fallos
npx tsc --noEmit            # esperado: 0 errores
npm run lint                # esperado: 8 errores preexistentes, ninguno nuevo
npm run build               # esperado: exit 0
```

Y en el SQL Editor, `supabase/04-verificacion.sql`: **9 filas, todas en OK**.

Ninguna de esas afirmaciones vale sin haber corrido el comando en ese momento.
