# BLUEPRINT — Macedonia / SumiControl

> **Qué es este documento.** El plano completo para **replicar o reconstruir** este sistema.
> Está escrito para que otra persona —o otra IA— pueda retomarlo sin conocer la historia previa.
> Si solo quieres saber **en qué punto está el proyecto hoy**, lee `project_state.md`.
>
> Última actualización: 2026-07-31

---

## 1. Qué es el producto (y qué NO es)

**Macedonia** (marca visible) / **SumiControl** (nombre interno) es el sistema operativo de dos
empresas venezolanas de gases industriales y soldadura: **Sumigases Oriente** (Lechería, Anzoátegui)
y **Sudematin & GM** (Cumaná, Sucre).

**No es un ERP genérico ni un reemplazo de Valery.** Es una **capa de operación y control** que:

1. Opera el día a día (inventario, cilindros, cotizaciones, notas de entrega).
2. **Concilia** esa operación con **Valery Small Business**, que es y sigue siendo el sistema fiscal.
3. Convierte en información las matrices que hoy se llevan a mano en Excel.

**Restricción fundamental:** Macedonia **nunca emite documentos fiscales** y **nunca escribe en
Valery**. La integración es en un solo sentido: se **suben exports** de Valery (Excel) a Macedonia.

### Por qué existe (el problema real)
Lo que se mueve físicamente y lo que se documenta fiscalmente **no ocurren al mismo tiempo**.
Hay mercancía que sale antes de existir fiscalmente (43 productos con existencia negativa en Valery,
uno en −298). Alguien llevaba esa diferencia en la cabeza o en Excel. Macedonia la vuelve
**explícita, medible y auditable**.

---

## 2. Stack y decisiones técnicas

| Capa | Elección | Nota |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | Rutas por carpetas |
| UI | **React 19** + **TypeScript 5** (`strict`) | |
| Estilos | **Tailwind CSS v4** + tokens CSS propios | **No shadcn/ui** — primitivos propios |
| Gráficas | Recharts 3.8 + SVG propio | |
| Fuentes | Sora (títulos) + Inter (cuerpo), vía `next/font` | |
| Deploy | **Vercel** (plan Hobby) | |
| Persistencia | **`localStorage`** (demo) → **Supabase/Postgres** (pendiente) | Ver §9 |

**Estado actual: demo funcional client-side.** No hay backend, base de datos ni autenticación real.
Todo el estado vive en el navegador. La arquitectura está preparada para migrar (§9).

---

## 3. Arquitectura multiempresa (la decisión estructural clave)

Todo se separa **desde la puerta de entrada**. Esto simplifica el resto del sistema: cada usuario
entra al mundo de una empresa y de ahí en adelante la lógica es "una empresa a la vez".

```
/                                  Centro de Control Estratégico (elegir empresa)
├── /admin/sumigases/<módulo>       panel Sumigases  (tema naranja)
├── /admin/sudematin/<módulo>       panel Sudematin  (tema azul)
└── /admin/<módulo>                 vista Consolidada (solo OWNER)
```

**Regla de oro: rutas separadas, implementación compartida.**
Cada ruta por empresa es un *re-export de una línea*:

```ts
// app/admin/[empresa]/inventory/page.tsx
export { default } from "@/app/admin/inventory/page";
```

Así se obtiene separación real de URLs **sin duplicar código**: se edita un solo archivo y ambas
empresas quedan consistentes.

**Piezas que lo sostienen:**
- `app/admin/[empresa]/layout.tsx` — valida la empresa una vez (404 si no existe).
- `components/layout/AppShell.tsx` — detecta la empresa por la URL y aplica el tema a todo el panel.
- `components/layout/Sidebar.tsx` — prefija cada enlace con la empresa activa.
- `lib/ux/empresas.ts` — **fuente única** de identidad: nombre, RIF, logo, color.

Los módulos leen la empresa de la ruta:
```ts
const empresa = usePathname().match(/^\/admin\/(sumigases|sudematin)(\/|$)/)?.[1] ?? "sumigases";
```

---

## 4. Sistema de diseño

### Tokens (`app/globals.css`)
Colores **semánticos** en CSS variables, nunca hex sueltos en componentes.

**Principio no obvio y crítico:** *ningún tono único pasa 4.5:1 en fondo claro y oscuro a la vez.*
Por eso `brand/ok/warn/danger/info` **cambian de valor según el tema**:

```css
:root  { --brand:#b04e15; --ok:#107c38; --warn:#a25903; --danger:#ce2323; --info:#2461e7; }
.dark  { --brand:#ea6a1e; --ok:#16a34a; --warn:#d97706; --danger:#e56161; --info:#5c8aef; }
```

- **`*-strong`** (`brand-strong`, `ok-strong`, `warn-strong`): los **únicos** válidos como *fondo*
  bajo texto blanco (≥4.5:1).
- **`--border-strong`** (3:1): para **campos de formulario**. El `--border` suave es solo decorativo.
- **Temas por empresa:** clases `.theme-sumigases` / `.theme-sudematin` redefinen `--color-brand*`.

> ⚠️ **Tailwind v4 compone la opacidad en espacio `oklab`, no sRGB.** `bg-ok/10` **no** da el color
> que predice la matemática tradicional. Para verificar contraste hay que **medir el píxel compuesto**
> (canvas), no calcularlo.

### Primitivos (`components/ui/`)
`Button` · `SectionCard` · `StatCard` · `KpiCard` · `StatusBadge` · `EmptyState` · `AlertCard` ·
`Icon` · `ConfirmDialog` · `SortableTh` · `TablePager` · `ThemeToggle` · `SeriesChart` · `BiCharts` ·
`HistoryStats` · `DataTableShell` · `ModuleCard` · `CompanySelector`

### Reglas de UI aprendidas (no repetir errores)
- **Controles ≥ 44px** de alto (área táctil).
- **Tablas**: `SortableTh` (con `aria-sort` + flecha, no solo color) + `TablePager` + `useTableView`.
  Nunca mostrar un subconjunto sin forma de llegar al resto.
- **`font-variant-numeric: tabular-nums`** en celdas: si no, las columnas de dinero bailan.
- **`min-w-0` en `SectionCard`**: sin eso, Recharts desborda horizontalmente en móvil.
- **Pestañas**: clase `.sumi-tabs` (scroll horizontal en móvil, no wrap en varias filas).
- **Hidratación**: nunca renderizar `0` mientras cargan datos de `localStorage` → usar bandera
  `ready` y `.sumi-skeleton`. Un dato falso que salta es peor que un placeholder.
- **`prefers-reduced-motion`** respetado globalmente.

---

## 5. Modelo de dominio

### 5.1 Inventario

Dos modelos conviven; **el segundo es el que manda hacia adelante**:

**(a) V / S / M** — conciliación con Valery:
- **V** = `stock_valery` (Físico): solo cambia con imports de Valery. Read-only.
- **S** = `stock_s`: stock propio de Macedonia, lo mueven sus documentos.
- **M** = `stock_maestro`: existencia física real.
- **Clave primaria = código de Valery** (`ARG6`, `00001002`, `0-290-631`).
- **Duplicidad**: si un código está en V y en S → alerta a OWNER/ADMIN, **bloqueo** de modificación,
  y tag "Documento Duplicado" si lo aprueban.

**(b) Movimientos de inventario (kardex)** — el modelo definitivo:
```
INGRESO  → Compras · Ingresos manuales
SALIDA   → Ventas  · Salidas manuales
```
Cada movimiento guarda: fecha, empresa, dirección, origen, código, cantidad, **motivo**, documento,
usuario. Los manuales **exigen motivo** (merma, ajuste de conteo, traslado, consumo interno…).

### 5.2 Regularización fiscal
Convierte una nota de entrega informal en factura fiscal de Valery.

| Flujo | Cuándo | Efecto |
|---|---|---|
| **A · Directa** | `V ≥ cantidad` | `V −= cant`, `S += cant`, **M intacto** |
| **B · En bloque** | `V < cantidad` | Compra fiscal `V += déficit` → Venta `V −= cant`, `S += cant`, **M intacto** |

- Flag **`afecta_inventario_real = false`**: la mercancía ya salió físicamente; el Maestro no se toca.
- **Exige el N° de factura real** ya subida a Valery (no se autogenera) y **genera alerta** a OWNER/ADMIN.
- Semáforo: 🟢 hay stock fiscal · 🟠 requiere regularización de compra.

### 5.3 Rotación
`Meses de stock = M (en vivo) ÷ venta mensual promedio (12 meses del histórico)`
🟡 <3m reponer · 🟢 3–24m saludable · 🔴 0/agotado, >24m sobrestock, o sin rotación.

### 5.4 Finanzas — Estado de Resultado
```
VENTAS − COSTO DE VENTA = UTILIDAD BRUTA − GASTOS = UTILIDAD − BONO = UTILIDAD TOTAL
```
- **Gastos**: 34 partidas agrupadas en **5 categorías** (Alquileres · Operativos · Vehículos ·
  Sueldos y comisiones · Impuestos y bancarios). Carga manual, Bs o USD con tasa.
- **Comisiones**: % sobre las **ventas propias** del vendedor, asignadas **por código de documento**
  (NET/FAC). Junior 0,5% · Senior 4% (ambos editables). Un documento **no se asigna dos veces**.
- **Bono**: % editable sobre la utilidad del período (después de gastos), por trabajador.

### 5.5 Cilindros ⚠️
**El módulo actual es un diseño provisional, no el proceso real.** Antes de rehacerlo hay que
responder: ¿se cuentan por serie individual o por cantidad?, ¿de quién son (comodato)?, ¿estados
reales?, ¿se rellenan o se compran llenos?, ¿el paso a paso del técnico?

---

## 6. Roles y permisos

| Rol | Nº | Alcance |
|---|---|---|
| **Owner** | 1 | Todo, ambas empresas, **único que ve registros/logs** |
| **Administrador** | 1 por empresa | Solo su empresa. Ve y carga **gastos y utilidad** |
| **Vendedor** | 2 | Cotizaciones, notas de entrega, inventario. **Solo precios de venta** |
| **Técnico de recargas** | 6 | Cilindros. Asignado a una empresa |

**Reglas duras:**
- **Pared entre empresas**: nadie mezcla datos, excepto el Owner.
- **Registros/logs: solo OWNER** — explícitamente *ni siquiera los administradores*.
- **Gastos y utilidad: Owner + Administrador.**
- Implementado en `lib/ux/session.ts`: `puedeVerRegistros()` / `puedeVerFinanzas()`.

> ⚠️ Hoy es **estructura, no seguridad**: el rol vive en `localStorage`. La barrera real llega con
> Supabase (rol desde el servidor + RLS).

---

## 7. Integración con Valery (unidireccional)

**Valery** = escritorio Windows, base **Firebird**, en el servidor físico de Sumigases. **Sin API.**
Macedonia **nunca** lo toca; solo consume sus **exports Excel**.

### Formatos mapeados

**Ventas** — `Relacion de Ventas Diarias (Detallado por Renglon).xls` · 22 columnas
`Fecha Emisión · Tipo Doc · Documento · Cliente · Cantidad · Producto · Código · Total Neto Bs ·
Impuesto · IGTF · Total Operación Bs · Tasa del Día · Total Operación $ · Crédito · Contado ·
Total Costo Bs · Total Costo $ · Utilidad-Venta $ · % Utilidad`
→ **De aquí sale el costo unitario por producto** (`Total Costo $ ÷ Cantidad`).

**Compras** — `Libro de Compras Art. 75 Reg IVA (Reexpresado).xls` · 42 columnas
→ Usar **`Total Compras + Impuesto $`** (columna en dólares exacta).
⚠️ Existe otro formato, *"Relación de Compras del Mes"* (13 col), **sin columna en $ ni tasa** —
sus montos están en **bolívares nominales**. Preferir siempre el Reexpresado.

**Inventario** — `Inventario sin cilindros.xls` · 6 columnas
`Código · Nombre · Und. Ppal · Existencia Ppal · Und. Alt · Existencia Alt`
⚠️ **No trae costo ni precio.**

### Reglas de importación
- Sube el **admin de cada empresa**, a diario, sus ventas y compras.
- **Idempotencia obligatoria**: detectar duplicados y **señalar cuál movimiento** se repite.
  (No existen dos meses idénticos con mismos precios, clientes y N° de documento.)
- Poder **borrar un archivo subido** por error → **revertir sus movimientos**.
- **Formato fijo**: si llega un formato distinto al preestablecido, **error explícito**.

### Trampas descubiertas en los datos reales
1. **Códigos sensibles a mayúsculas**: `6X8AT` y `6x8AT` son **productos distintos**. Un índice
   case-insensitive ingenuo devuelve el equivocado. → match exacto primero; el *fallback*
   case-insensitive solo resuelve si hay **un único** candidato.
2. **Traslados intercompañía**: Sumigases y Sudematin se envían mercancía **en ambos sentidos** y en
   Valery figura como `NET` (venta). En el consolidado se **cuentan dos veces**; contablemente
   habría que eliminarlos.
3. **Tres tipos de NET** que la administradora separa a mano: **venta real**, **consumo interno**
   (a empleados) y **traslado** (a la otra empresa). Solo la primera es venta.
4. **Consumo interno** es un movimiento con **doble efecto**: sale del inventario **y** es un gasto.
5. Los archivos de Valery a veces **cruzan años** (el de 2026 trae filas de 2025): filtrar por la
   fecha de cada fila, nunca por el nombre del archivo.

---

## 8. Datos reales cargados

| Dataset | Archivo | Contenido |
|---|---|---|
| Inventario físico | `lib/ux/inventory-fisico-seed.json` | 1.703 productos (Sumigases) |
| Histórico | `lib/ux/history-data.ts` | Ventas+compras por empresa y mes (2022–2026) |
| Costos/precios | `lib/ux/costos.ts` | 1.213 códigos Sumigases · 2.599 Sudematin |
| Rotación | `lib/ux/inventory-rotation-seed.json` | 780 códigos con ventas 12m |

**Cifras (según exports de Valery):** Sumigases $2,37M ventas / ROI 76,9% · Sudematin $2,45M / ROI 162,1%.

> ⚠️ **Discrepancia sin resolver:** el Estado de Resultado de administración da **$621.730** para
> Sumigases 2024, y el export de Valery **$665.283** (7%). **El EdR es la cifra oficial** según el
> cliente. Falta decidir si se corrige el histórico.

---

## 9. Cómo migrar a backend (lo que sigue)

**Objetivo:** Next.js + **Supabase** (Postgres + Auth + Storage + RLS), todo en la nube.

**Por qué Supabase:** Postgres real, auth email+contraseña incluida, **RLS** (la pared entre empresas
se hace cumplir *en la base*, no solo en el front), realtime para la vista compartida, y bajo lock-in.
**Cuidado:** el plan gratis **no tiene backups diarios** — pasar al plan Pro ($25/mes) antes de meter
datos reales.

### Pasos
1. **Esquema**: `empresas`, `usuarios`, `productos`, `movimientos_inventario`, `documentos`,
   `gastos`, `trabajadores`, `ventas_asignadas`, `importaciones`, `auditoria`.
   Casi todos los tipos ya existen en `lib/ux/*.ts` — trasladarlos tal cual.
2. **RLS por empresa y rol** (la pared del §6).
3. **Reemplazar la capa de persistencia**: cada módulo usa un store aislado con la misma forma
   (`get*` / `add* `/ `use*` + evento). Cambiar el cuerpo, **no las firmas**.
4. **Auth**: login usuario+contraseña; el rol pasa a venir del servidor (`lib/ux/session.ts`).
5. **Importadores** con idempotencia y reversión (§7).
6. **Tareas programadas**: actualizar la tasa BCV cada hora (hoy es manual y por navegador).

### Convenciones a respetar
- Claves de storage con prefijo `sumi:` → equivalen a tablas.
- Stores con patrón `localStorage + CustomEvent + hook use*` (ver `notifications.ts`).
- `usePersistedState` para estado de UI.
- Todo monto interno en **USD**; Bs se convierte con tasa y se guarda `montoUsd`.

---

## 10. Operación

### Desplegar
```bash
cd "<worktree>"
cat .vercel/project.json | grep sumicontrol   # DEBE decir "sumicontrol"
npm run build
vercel --prod --yes
```
- Error *"Serverless Functions limited to 2048mb"* → `.vercel` apunta al proyecto equivocado:
  `rm -rf .vercel && vercel link --yes --project sumicontrol`

### Repositorio
`github.com/Pantera95/Sumi` · rama **`patch/greeg-ux-ui`**.
El helper de git no entrega credenciales de forma no interactiva: se pushea con token en la URL.

### Verificar antes de dar por hecho
Levantar el build (`PORT=xxxx npm run start`) y **comprobar en el navegador**: medir contraste con
píxeles reales, ejercer los flujos, revisar móvil (375px) y modo oscuro.

---

## 11. Pendientes

**Bloqueantes para producción**
1. Backend + base de datos + autenticación (§9).
2. **Cilindros**: rehacer con el proceso real (§5.5) — es la prioridad #1 del cliente.
3. Importadores diarios con idempotencia y reversión.
4. Dominio propio (`app.macedonia…`) — hay que comprarlo.

**Funcionales**
5. Estado de Resultado armado en Matrices (ya existen gastos, comisiones, costos e histórico).
6. Conectar los documentos de Macedonia al kardex (⚠️ resolver el **doble descuento**: una venta no
   puede descontar por la NE de Macedonia *y* otra vez al llegar en el export de Valery).
7. Clasificar NET en venta / consumo interno / traslado al importar.
8. Notas de entrega y cotizaciones con **logo y RIF por empresa** (el logo de Sudematin ya está).
9. "En Espera por Nota de Entrega" (apartado del Master) — lógica sin definir.
10. Tasa BCV compartida y actualizada cada hora.

**Riesgo operativo**
El proyecto depende de una sola persona, con deploys manuales y sin control de acceso. Ya ocurrió que
un tercero sobrescribió producción. Recomendación: un solo responsable de desplegar a producción.
