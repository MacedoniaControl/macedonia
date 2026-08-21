# Permisos por usuario configurables por el Owner

> Diseño aprobado el 2026-08-19. Reemplaza el modelo de permisos por rol.

## Problema

Hoy los permisos son **fijos por rol**, escritos en el código y en 34 políticas de
la base. Cambiar quién ve qué exige tocar código y volver a desplegar.

El Owner necesita poder ajustar los accesos de cada persona **sin programador**.

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Los permisos pueden saltarse las reglas duras? | **Sí.** El Owner puede dar cualquier cosa a cualquiera. |
| Granularidad | **Por módulo**: ve / no ve. |
| Relación con los roles | El rol es una **plantilla inicial**, no una jaula. |
| Control en pantalla | **Interruptor deslizante** (on/off), no casilla. |
| Color del interruptor encendido | **Color de marca de la empresa activa** (naranja Sumigases / azul Sudematin). Sin colores nuevos. |

### Consecuencia asumida y explícita

Las tres reglas que hasta hoy eran **irrompibles** pasan a ser **valores por defecto
configurables**:

1. Registros y auditoría: solo el Owner
2. Gastos y utilidad: Owner + Administrador
3. Pared entre empresas

El Owner las puede aflojar desde la pantalla. **Fue una decisión suya, tomada tras
advertirle explícitamente lo que implicaba.** `CLAUDE.md` se reescribe en consecuencia.

## Arquitectura

### Dónde viven los permisos

Columna `permisos jsonb` en la tabla `usuarios`:

```json
{ "inventory": true, "expenses": false, "audit": false,
  "ver_registros": false, "ver_costos": false, "otra_empresa": false }
```

**Por qué una columna y no una tabla aparte:** con 10 usuarios y 18 módulos, una tabla
`permisos(usuario_id, modulo, activo)` significa 180 filas, un `join` en cada política y
más piezas que mantener, sin resolver ningún problema real. Si algún día hace falta
responder "quién puede ver gastos" a escala, se agrega un índice GIN sobre el jsonb.

### Cómo lo hace cumplir la base

Función nueva, análoga a las que ya existen:

```sql
create or replace function puede(clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (permisos ->> clave)::boolean from usuarios
     where id = auth.uid() and activo), false)
$$;
```

Las 34 políticas cambian de `auth_rol() in ('owner','admin')` a `puede('<modulo>')`.
El cambio es mecánico pero **toca toda la seguridad**: hay que volver a correr las 7
pruebas de `04-verificacion.sql` y actualizarlas, porque hoy comprueban reglas por rol.

### Claves de permiso

Los 18 módulos usan el **slug de su ruta** (`dashboard`, `quotes`, `delivery-notes`,
`sales`, `products`, `inventory`, `cylinders`, `expenses`, `commissions`, `receivables`,
`payables`, `purchases`, `reports`, `roi`, `matrices`, `settings`, `users`, `audit`),
para que el menú y los permisos no puedan desincronizarse.

Más tres especiales, que no son módulos sino capacidades transversales:
`ver_registros`, `ver_costos`, `otra_empresa`.

### Front

- `lib/ux/nav.ts` gana un `permiso` por ítem; el Sidebar filtra por los permisos de la sesión.
- `lib/ux/session.ts`: `puedeVerRegistros(rol)` / `puedeVerFinanzas(rol)` pasan a leer
  permisos, no rol. Se conservan las firmas donde sea posible para no tocar 4 páginas.
- El menú se arma **en el servidor**, con la sesión real.

### Interruptor

`<button role="switch" aria-checked>`, operable con teclado, **área táctil de 44px**
aunque la píldora se vea de 28. El estado se distingue por **posición del círculo y
color**, nunca solo por color. Encendido: `bg-brand-strong`.

Guardado inmediato al alternar, con reversión optimista si el servidor rechaza: nunca
debe quedar la pantalla diciendo ON mientras la base dice OFF.


## Plantillas por rol (al crear el usuario)

| Rol | Encendido por defecto |
|---|---|
| **Owner** | **Todo, siempre.** No configurable — ver «Owner irrevocable». |
| **Administrador** | Las 17 de su empresa. Apagados: `users`, `audit`, `ver_registros`. |
| **Vendedor** | `dashboard`, `quotes`, `delivery-notes`, `sales`, `products`, `inventory`. |
| **Técnico** | Solo `cylinders`. Entra desde el celular, registra la recarga y sale. |

Ninguna plantilla deja a nadie en cero. El Owner ajusta desde ahí.

## Owner irrevocable — por construcción

La función de la base devuelve `true` para el Owner **sin mirar los permisos**:

```sql
select es_owner() or coalesce((permisos ->> clave)::boolean, false)
```

No puede quedarse fuera aunque se intente a propósito. En su ficha los interruptores
aparecen encendidos y bloqueados, con la explicación. `activo = false` sobre un Owner
se prohíbe **en la base**, no en el formulario: una regla de pantalla se olvida, una
restricción de la base no.

## Acceso sin permiso

**Las secciones sin permiso no se muestran** — se ocultan del menú, no se deshabilitan.

Si alguien escribe la URL directamente (`/admin/expenses`):

1. **Se comprueba en el layout de `/admin`**, por donde pasan las 18 secciones. No en el
   `proxy`: consultar la base en cada petición es lento, y el layout es igual de
   imposible de saltar desde el navegador.
2. **Redirección a su primera sección disponible**, con el mensaje «No tienes permiso
   para ver Gastos». Nunca queda en una pantalla vacía.
3. **Se registra en auditoría** y **se alerta al Owner**.

## Alertas con contador

Estructura nueva en `notificaciones`: `veces`, `ultima_vez`, `clave_grupo`, más un índice
único parcial sobre las pendientes.

El cuarto intento de José a Gastos no crea una alerta nueva: encuentra la abierta, sube
`veces` a 4 y refresca `ultima_vez`. **La auditoría registra todos los intentos igual** —
se agrupa la alerta, nunca el rastro.

Al marcarla revisada, el índice la libera: el siguiente intento abre una alerta nueva, así
se sabe que volvió a pasar después de darlo por cerrado.

**También alerta a partir de 3 fallos de contraseña seguidos** con el mismo usuario. Uno o
dos son un error de tecleo; tres seguidos merecen saberse.

### ⚠️ Arreglo aparte, que vale por sí solo

`para_rol` existe en la tabla y **ninguna política la consulta**: hoy una alerta marcada
«solo Owner» la ve cualquier administrador. Se corrige junto con esto, pero es un fallo
independiente del sistema de permisos.

## Puesta en marcha

| Decisión | Elegido |
|---|---|
| Orden de migración | **Todos los módulos de una vez** |
| Datos del navegador | **Migran solo los cargados por una persona**; se excluyen las semillas de ejemplo |
| Usuarios | **2 o 3 de prueba primero**, el equipo completo tras verificar |
| Sesión | **No expira sola**. Solo cierra sesión, o el Owner desactiva |
| Despliegue | **sumicontrol.vercel.app** por ahora |

⚠️ Consecuencia de mantener el despliegue actual: **Salem conserva acceso a producción**
mientras dure. Es una postergación consciente, no un olvido.

## Riesgos

1. **Se reescribe seguridad ya verificada.** Las 34 políticas funcionan hoy y pasaron
   las 7 pruebas. Tocarlas reintroduce riesgo. Mitigación: actualizar primero las
   pruebas de verificación, y no dar por bueno nada sin volver a correrlas.
2. **Un usuario sin permisos entra a un sistema vacío** y parece que la app está rota.
   Mitigación: la plantilla por rol nunca deja a nadie en cero, y el Sidebar muestra un
   mensaje explícito si no hay ningún módulo visible.
3. **Alertas ruidosas.** Una marca vieja del navegador dispara alertas de gente que no
   hace nada malo; si suena por ruido se ignora justo cuando importa. Mitigación: el
   contador agrupa, y solo alerta desde el tercer fallo de contraseña.

## Pruebas

- `puede()` con permiso ausente, `false`, `true` y usuario inactivo.
- Plantillas de rol: ninguna deja al usuario sin ningún módulo.
- El Sidebar filtra: un vendedor sin `expenses` no ve Gastos.
- Verificación SQL actualizada: las 7 pruebas siguen pasando tras reescribir las políticas.

## Fuera de alcance

Permisos por acción (crear/editar/borrar), permisos por empresa distintos para la misma
persona, y grupos de usuarios. Si hacen falta, son otro diseño.
