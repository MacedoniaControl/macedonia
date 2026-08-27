# Plan de entrega — Macedonia

Corte: **26-ago-2026** · Decisiones tomadas por Greeg el 26-ago-2026.
Este archivo es MI hilo conductor. Se actualiza, no se reescribe.

## Decisiones cerradas (no volver a preguntar)

| # | Decisión |
|---|---|
| D1 | **Se acabó la fase demo.** Nada se guarda en el navegador. Todo a Supabase. |
| D2 | **Eliminar la palabra «demo»** de todo el código (42 apariciones al 26-ago). |
| D3 | **Eliminar TODOS los datos sembrados.** Los datos se recargan de cero, poco a poco. |
| D4 | **Eliminar el consolidado.** Cada empresa por separado, siempre. Evita errores. |
| D5 | Solo se trabaja con **nota de entrega**. No hay documentos fiscales. |
| D6 | Los **precios de gas y depósitos son editables** desde la pantalla, no fijos en código. |
| D7 | **No** agregar ARGOMIX ni CO2 por ahora. Todo a cero, se carga después. |
| D8 | El 19% de devoluciones **es normal** en el rubro. No es un problema a resolver. |
| D9 | Los usuarios los crea Greeg en Supabase Auth. Yo solo cargo rol y permisos. |
| D10 | GitHub + Vercel + Supabase deben quedar bajo la empresa, en un solo lugar. |

## Orden acordado

**Primero:** Greeg hace cambios en el Front. Esperar a que los defina.
**Después:** todo lo de abajo.

## Fases

### Fase 0 — Cambios de Front (Greeg define)
Bloqueado esperando su lista.

### Fase 1 — Sacar la fase demo
- [ ] Borrar los 5 focos de datos sembrados:
      `app/admin/quotes/page.tsx:53` (SEED)
      `app/admin/audit/page.tsx:8-14` (7 registros de auditoría FALSOS)
      `lib/ux/inventory-fiscal.ts:240` (SEED_NOTAS)
      `lib/ux/inventory-data.ts:34` (SEEDS)
      `lib/ux/inventory-rotation.ts:8` (SEED)
- [ ] `lib/ux/history-data.ts` (24 KB): decidir si se recalcula desde la base o se borra
- [ ] Quitar las 42 apariciones de «demo»
- [ ] Quitar la etiqueta `hoy = 2026-06-23` de receivables:146 (la lógica ya está bien)

### Fase 2 — Auditoría de las 9 pantallas
Una por una, leyendo código. Buscar el error de notas de entrega: escribe en la
base pero lee del navegador.

- [ ] quotes · [ ] inventory · [ ] expenses · [ ] commissions
- [ ] dashboard · [ ] roi · [ ] sales · [ ] reports/audit/matrices

### Fase 3 — Migrar todo a Supabase (con orden, no por impulso)
Regla de D1, pero acordando el orden antes de mover nada.
- [ ] Definir el orden con Greeg antes de tocar
- [ ] PDF de Valery → Supabase Storage

### Fase 4 — Recargar datos
Greeg va a subir todos los archivos de cuentas.
- [ ] Esperar los archivos
- [ ] Cargar por empresa, separado (D4)

### Fase 5 — Verificación final
- [ ] RLS con usuario restringido real (necesita D9)
- [ ] Probar restaurar un backup
- [ ] Los 3 correlativos quemados: reproducir con sesión

## Pendiente de Greeg
Ver la lista de prioridad que le pasé el 26-ago.

## Preguntas sin responder
- **3.4** Los 1.073 clientes: ¿cargo solo nombres del PDF, o busca el export de
  Valery con fichas completas? — quedó sin respuesta.
