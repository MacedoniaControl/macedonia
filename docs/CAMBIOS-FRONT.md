# Cambios de Front — lista de Greeg, 26-ago-2026

Capturada textual. Se tacha lo hecho, no se borra.

## VERDAD ABSOLUTA — irrevocable

**Sumigases = una sola sede, Puerto La Cruz.**
**Sudematin = Cumaná.**
Son empresas SEPARADAS. Nada de Sudematin aparece dentro de Sumigases ni al revés.
No hay consolidado (D4).

---

## Global
- [x] ~~Eliminar la palabra «demo» de todo (42 apariciones)~~
- [ ] Nada se guarda en el navegador

## Dashboard
- [x] ~~Borrar: «Visión ejecutiva · Sumigases. Los KPIs demo se recalculan…»~~
- [x] ~~Borrar el breadcrumb «Resumen > Dashboard»~~
- [x] ~~Período por defecto: **Mes**~~
- [x] ~~Agregar breakdown por calendario + **Fecha personalizada**~~
- [x] ~~La tasa de Bs debe ser la MISMA que la del precio BCV~~

## Cotizaciones
- [x] ~~Título: solo «Cotizaciones» (hoy dice «Cotizaciones / Presupuestos»)~~
- [x] ~~Borrar: «Registro, generación (formato oficial Valery) e importación…»~~
- [x] ~~«Subir de Valery» sale del apartado principal → esquina derecha, se llama
      **Subir Archivo**, abre ventana de drop~~
- [ ] Nuevo presupuesto → **Vendedor**: se llena con los usuarios del sistema
- [ ] Nuevo presupuesto → **Tipo de precio**: Mayorista / Oferta / Detal
- [x] ~~Borrar: «Escanea o busca en el catálogo para agregar…»~~
- [ ] Buscador: textbox de texto + píldora **Escanear** al lado (código de barras)
- [ ] «Agregar renglón» debe incluir **Agregar Gases**
- [ ] Panel de **preview** de lo que se va agregando
- [ ] **Ventas Externas** = registro de vendedores externos a Sumigases; ahí se
      guardan las cotizaciones que ellos hacen
- [ ] **Registro** solo lo ven los Owners (logs de todos los presupuestos)

## Notas de entrega
- [x] ~~Borrar: «Registro, generación e importación de Notas de Entrega…»~~
- [x] ~~Mismo cambio de «Subir de Valery» → **Subir Archivo** en esquina derecha~~
- [ ] Registro: misma regla que en Cotizaciones (solo Owners)

## Inventario
- [x] ~~Borrar: «Físico (Valery) + Inventario S (Macedonia) = Master…»~~
- [ ] Solo quedan 4: **Inventario Master · Inventario Físico · Inventario Valery · Movimientos**
- [x] ~~ELIMINAR «Regularización Fiscal»~~
- [x] ~~ELIMINAR «Inventario S»~~

## Cilindros
- [x] ~~Renombrar el apartado: «Cilindros y Recarga» → **Cilindros**~~
- [x] ~~Borrar: «Los cilindros son de la empresa. Lo que está en manos de un cliente…»~~
- [x] ~~Botón «Dónde están» → se llama **Rampa**~~
- [x] ~~Rampa = donde se registran todos los cilindros y se ven los movimientos~~
- [x] ~~Píldora **Agregar Movimiento**: agregar o quitar cilindros a mano~~
- [x] ~~Volver a mostrar los cilindros separados por gases, dentro de Rampa~~
- [ ] Precios/depósitos de gas EDITABLES desde la pantalla (D6)

## Comisiones y Bonos
- [x] ~~ELIMINAR el apartado completo~~

## Cuentas por cobrar
- [x] ~~Borrar: «Saldos por cliente, vencimientos, abonos parciales y alertas. Demo funcional.»~~
- [x] ~~Píldora **nueva cuenta por cobrar**, al lado de exportar CSV~~
- [ ] Importar Excel y que el sistema lo lea y cargue a la cartera
- [x] ~~**Registrar abono**: píldora con menú desplegable, NO dentro del panel de
      visualización. Al lado de carteras.~~
- [ ] Cada cuenta genera un registro

## Cuentas por pagar
- [x] ~~Borrar: «Saldos por proveedor, abonos y alertas desde 7 días… (§24)»~~
- [x] ~~Mismas tres cosas que en cobrar: píldora de alta, importar Excel, abono en píldora~~
- [ ] Cada cuenta genera un registro

## Compras
- [x] ~~Borrar: «Orden → recepción parcial → suma al inventario…»~~
- [ ] Formulario de orden de compra MUCHO más amplio
- [ ] Los productos son los que hay en existencia
- [ ] Si no existe → popup que avise que hay que crear el producto en inventario,
      y que se cree ahí mismo (no cargarlo dos veces)

## Reportes
- [x] ~~Borrar: «Selecciona un reporte para ver la tabla con cifras reales 2024…»~~
- [x] ~~Ver por lapsos: desde el inicio de la empresa hasta hoy~~
- [x] ~~Breakdown por **Semanas · Meses · Años**~~
- [x] ~~ELIMINAR «Exportar CSV» → convertirlo en **Descargar PDF** con todas las
      cifras según el breakdown elegido~~

## ROI
- [x] ~~Revisar textos: nada de Sudematin dentro de Sumigases ni al revés~~
- [x] ~~Borrar: «ROI como métrica transversal, sobre el histórico real…»~~
- [x] ~~Borrar: «Todo el histórico de operaciones (2022-01 → 2026-07).»~~
- [ ] Convertir los gráficos a **BI**
- [x] ~~Ver por lapsos + breakdown Semanas / Meses / Años~~

## Matrices administrativas
- [x] ~~Borrar: «Matriz ROI mensual/anual alimentada por las matrices 2024…»~~
- [x] ~~Ver por lapsos + breakdown Semanas / Meses / Años~~
- [x] ~~Píldora **Crear Matriz**: cargar .xls y .xlsx (sin texto explicativo)~~
- [ ] El formato digital = el mismo del Excel que se subió al principio

## Configuración
- [x] ~~Borrar: «Parámetros base del sistema. La configuración crítica queda reservada a OWNER.»~~

## Auditoría
- [x] ~~ELIMINAR el apartado completo~~


---

## Deuda que dejó la Tanda 1 (26-ago)

- `lib/ux/inventory-fiscal.ts` sigue existiendo: el Master lo usa para calcular.
  Contiene `SEED_NOTAS` (datos sembrados) y 3 menciones de «demo». Se limpia
  cuando se defina qué es Master ahora que Inventario S no existe.
- Cálculos huérfanos en `app/admin/inventory/page.tsx` (`totFisico`, `totFactura`,
  `totNE`, `tFis`, `resumenRot`): eran de las vistas borradas. Son advertencias
  de lint, no rompen nada. No los arranqué sin leer de qué más dependen.

## Pregunta abierta de la Tanda 1

Pediste que Inventario tenga **Master · Físico · Valery · Movimientos**.
Hoy la pestaña «Físico» ES la de Valery (dice «Inventario Físico (Valery)»).
¿Son dos cosas distintas que hay que separar, o es la misma con otro nombre?
Dejé 4 pestañas: Master · Físico · Productos y catálogo · Movimientos.
(Productos lo mantuve porque lo pediste como subdepartamento de Inventario.)


## Tanda 2 — lo que quedó a medias (a propósito)

- **Importar Excel en Cobrar/Pagar**: la píldora de alta manual está; leer un
  .xls y volcarlo a la cartera es parseo, va en la Tanda 5.
- **Crear Matriz**: la píldora recibe .xls/.xlsx y avisa cuántos archivos
  llegaron, pero todavía no los procesa. Avisa en vez de fingir que cargó.


## Tanda 3 — lo que hay que saber

**La tasa de Bs estaba 16 veces abajo.** El dashboard importaba la tasa del BCV
pero convertía con `RATE_BS = 49.5` mientras el BCV real está en 787,52. Ahora
usa la viva; si no hay tasa, dice «sin tasa» en vez de inventar un número.

**Semanas no está disponible en Reportes, ROI y Matrices.** El histórico es
mensual (`HISTORY.months`, con `ym`), así que repartir un mes en semanas sería
inventar. El selector solo ofrece Meses y Años en esas tres. Cuando las ventas
diarias estén en la base, se habilita.

**Reportes pasó de 5 tipos a 4.** «Facturas vs notas de entrega» y «Crédito vs
contado» salían de `series` inventadas y no tienen equivalente en el histórico:
necesitan la tabla `documentos` con volumen real.

**Las tres pantallas leían `series` de dashboard-data**: doce meses de 2024 sin
año pegado. Con eso el selector de rango no podía significar nada. Ahora leen
`HISTORY`, que trae mes con año (2023-04 → 2026-07).

**El consolidado se fue** del dashboard y del ROI (D4).
