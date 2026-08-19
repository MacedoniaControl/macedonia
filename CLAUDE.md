# Macedonia / SumiControl — reglas del proyecto

**Macedonia** (marca visible) es la capa de operación y control de dos empresas de gases
industriales: **Sumigases Oriente** (Lechería) y **Sudematin & GM** (Cumaná).
Internamente el proyecto se llama **SumiControl**.

Para el plano completo del sistema, lee `docs/planning/BLUEPRINT.md`.
Para saber en qué punto está hoy, `docs/planning/project_state.md`.

---

## REGLAS IRROMPIBLES

Estas no son preferencias de estilo. Son decisiones del negocio y romperlas causa daño
real —fiscal, legal o de confianza—. **Si un cambio parece exigir romper una, para y
pregunta.**

### 1. Macedonia NUNCA emite documentos fiscales
Valery Small Business es y sigue siendo el sistema fiscal. Macedonia produce notas de
entrega, presupuestos y controles internos; **nunca** una factura fiscal.

### 2. NUNCA se escribe en Valery
La integración es de **una sola vía**: se suben exports Excel de Valery a Macedonia.
No hay API, no hay escritura, no hay sincronización de vuelta.

### 3. Pared entre empresas
Ningún usuario ve datos de la otra empresa. **La única excepción es el Owner.**

Esta regla se rompió tres veces por creer que separar rutas y colores era suficiente.
No lo es. La pared tiene que llegar **hasta los datos**:

- Toda clave de almacenamiento lleva la empresa: `ne:docs:${empresa}`, `inv-s:${empresa}`…
- Toda función que lea datos de negocio recibe la empresa: `fisicoDe(empresa)`,
  `lookupByCodigo(codigo, empresa)`, `buildMaster(items, empresa)`…
- Los documentos impresos llevan la identidad de SU empresa (`notaEntregaHtml(doc, empresa)`).
- En la base de datos la hace cumplir el RLS (`supabase/02-rls.sql`), no el front.

⚠️ **Las vistas de Postgres se saltan el RLS** salvo que se creen con
`with (security_invoker = on)`. Una vista sin eso rompe la pared en silencio, con las
tablas aparentemente protegidas.

### 4. Registros, logs y auditoría: SOLO el Owner
Explícitamente **ni siquiera los administradores**. Ver `puedeVerRegistros()` en
`lib/ux/session.ts` y la política `auditoria_solo_owner`.

### 5. Gastos y utilidad: Owner + Administrador
Los vendedores **solo ven precios de venta**, nunca el costo de compra ni el margen.
En la base, el costo está protegido por permisos de columna, no solo por RLS.

### 6. Nunca inventar datos
Un dato de relleno que se ve igual que uno real es una trampa: alguien va a decidir
sobre él. **Si no hay fuente, va en cero o vacío**, nunca un número verosímil.
Una alerta falsa es peor que ninguna alerta.

Esto incluye textos que se imprimen para el cliente: si no se conoce el dato real de una
empresa (sus rubros, su dirección), se deja **vacío**, no se inventa.

---

## Cómo trabajar en este repo

### Verificar de verdad
**Un build que compila no prueba nada sobre el comportamiento.** Los tres peores bugs del
proyecto compilaban perfecto:

- texto blanco sobre fondo blanco (contraste 1.00:1) en producción
- el escáner perdía el foco y las lecturas se descartaban en silencio
- una empresa mostraba los documentos de la otra

Antes de dar algo por hecho: levantar la app, ejercer el flujo, mirar en móvil (375px) y en
modo oscuro. Para contraste, **medir el píxel compuesto** (Tailwind v4 compone la opacidad
en espacio `oklab`, no sRGB: la matemática tradicional da un resultado equivocado).

### Multiempresa
Rutas separadas, **implementación compartida**. Cada ruta por empresa es un re-export de
una línea; se edita un solo archivo y ambas empresas quedan consistentes.
`lib/ux/empresas.ts` es la **fuente única** de identidad (nombre, RIF, dirección, logo,
datos de impresión). No repetir esos valores en ningún otro sitio.

### Diseño
Colores **semánticos** por token, nunca hex sueltos. Ningún tono pasa 4.5:1 en claro y
oscuro a la vez, por eso los tokens **cambian de valor según el tema**. Solo los `*-strong`
sirven de fondo bajo texto blanco. Controles de 44px mínimo. Tablas siempre con orden y
paginación: nunca mostrar un subconjunto sin forma de llegar al resto.

### Datos de Valery — trampas reales
- **Los códigos distinguen mayúsculas**: `6X8AT` y `6x8AT` son productos DISTINTOS.
  Match exacto primero; el *fallback* insensible solo resuelve si hay un único candidato.
  **Nunca adivinar.**
- Los archivos **cruzan años**: filtrar por la fecha de cada fila, no por el nombre.
- Existen **tres tipos de NET**: venta real, consumo interno y traslado entre empresas.
  Solo la primera es venta. Los traslados se cuentan dos veces en el consolidado.
- El libro de compras **Reexpresado** trae la columna en dólares exacta; el otro formato
  está en bolívares nominales. Estimar la tasa a mano dio un error del 25%.

### Secretos
Nunca poner claves en el repo (**es público**). Para GitHub, `gh auth login` +
`gh auth setup-git`; nunca un token en la URL ni en un archivo.
`SUPABASE_SERVICE_ROLE_KEY` **se salta el RLS por completo**: solo en el servidor y solo
para tareas administrativas.
