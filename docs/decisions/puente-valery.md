# Puente Valery

Aprobado por el Owner el 2026-10-24. Cambia la regla 2 de `CLAUDE.md`: además de
los Excel, Macedonia lee Valery con un agente. **Nunca escribe en Valery.**

## Lo que se sabe de Valery (verificado el 2026-10-19)

- Valery Small Business 5.1.0.7240a sobre **Firebird 2.5.2**. Sumigases: servidor
  `SERVIDORSUD` (192.168.0.125), base `D:\ValerySMB_7240\datos\valery3.mdf` (~1 GB),
  juego de caracteres `NONE` (texto en Windows-1252).
- No hay API, ni clave de SYSDBA, ni respuesta del proveedor.
- Los reportes que se exportan a Excel son procedimientos de la base (`REP_*`), pero
  varios usan funciones externas (`valery_udf.dll`, FreeUDFLib, rfunc). Por eso el
  puente lee **tablas**, no procedimientos.
- Comparación contra los Excel (respaldo del 2026-03-03, febrero 2026):
  - ventas: 258/258 documentos y **479/479 renglones con la misma clave** que da el
    importador de Excel (`V|fecha|tipo|documento|código|cantidad|neto`);
  - tasa del día: la de `MONEDA_HISTORIAL` (moneda `02`) vigente a la fecha y hora
    del documento (o el factor del documento, si está en dólares) coincide en 250
    de 258 documentos. En los otros 8 Valery usa otra tasa en el Excel; solo cambia
    el monto en dólares que el importador usa para reconocer la factura de una nota;
  - prueba de punta a punta: lo que entrega el código del agente, pasado por
    `renglonesDesdePuente`, da **las mismas 479 claves** que el Excel leído por el
    importador;
  - CxP: la tabla `V3CXP` da lo mismo que el reporte `REP_CTA_PAG_PRV` de Valery.
  - CxC y existencias: se leen, falta compararlas con Excel del mismo día.

## Cómo funciona

```
Panel de Macedonia ──(pide)──► valery_solicitudes ◄──(pregunta cada 15 s)── Agente en el servidor
                                                                            │ copia la base (VSS)
Panel ◄──(muestra / aplica)── valery_resultados ◄──(entrega por partes)─────┘ la lee en solo lectura
```

- **El agente** (`public/puente-valery/puente.ps1`) corre en el servidor como tarea
  de Windows (SYSTEM, al arrancar, se reinicia sola). Solo hace conexiones de
  SALIDA por HTTPS: no se abre ningún puerto.
- Para leer, **copia** `valery3.mdf` con una instantánea de Windows (VSS), que da
  una copia coherente aunque Valery esté en uso; si VSS no está disponible,
  intenta la copia directa. Abre la copia con **Firebird 2.5.9 embebido** (sin
  clave de SYSDBA) y transacciones de solo lectura. Reutiliza la copia unos
  minutos para no copiar 1 GB en cada pedido.
- **Macedonia** guarda los pedidos y sus resultados por empresa
  (`supabase/47-puente-valery.sql`). El agente se identifica con una clave propia
  de su empresa; la base solo guarda su huella (SHA-256). La clave solo sirve para
  tomar los pedidos de esa empresa y entregar resultados: no lee nada de Macedonia.
- Las ventas que trae el puente se **aplican con el mismo importador** que los
  Excel (`importarVentasValery`): mismas reglas (FAC/NET salen, DEV entra, una FAC
  que factura una NET no descuenta dos veces), mismo corte, mismas claves. Un
  renglón importado por Excel no se vuelve a importar por el puente, y al revés.
- CxC, CxP y existencias se **muestran y descargan**, pero no se escriben en las
  tablas de Macedonia hasta compararlas con un Excel del mismo día.

## Instalación

Desde el panel (Configuración → Puente con Valery) el Owner o un Administrador
genera el instalador: un `.bat` con la dirección de Macedonia, la empresa y la
clave del agente. Se ejecuta **una vez en el servidor**, como administrador.
Baja Firebird embebido y FirebirdClient de sus sitios oficiales y comprueba su
huella antes de usarlos.

**Reinstalar no deja el servidor sin agente** (desde la migración 50; de la
1.0.2 a la 1.0.3 pasó: el instalador quitaba el agente viejo antes de probar
el nuevo, la prueba falló y el servidor se quedó sin ninguno):

- La clave nueva nace «en espera». La vieja sigue sirviendo hasta que el
  agente nuevo pasa su prueba (copia y lee la base) y habla con Macedonia: en
  ese momento, en una transacción, la vieja se revoca y la nueva queda activa
  (`valery_estrenar_agente`). Generar otro instalador anula solo el que estaba
  en espera sin usar.
- El instalador arma y prueba el agente nuevo en `C:\MacedoniaPuente\nuevo`
  sin tocar el que corre. Si falla la descarga o la prueba, borra lo nuevo y
  el anterior sigue como estaba. Solo con la prueba superada detiene el viejo,
  lo aparta a `anterior` y pone el nuevo en su lugar; si el viejo no se deja
  apartar, la tarea corre el nuevo desde `nuevo` (ya probado y con la clave
  buena).

## Ventas automáticas (2026-11-02)

Pedido del Owner: que las ventas entren solas y verlas en un apartado.

- **Cuándo.** Cada vez que el agente pregunta (cada 15 s), el servidor mira si
  ya pasó una hora desde la última actualización automática; si pasó, la pide.
  No hay otro reloj: si el servidor de Valery está apagado, no se acumulan
  pedidos. «Actualizar ahora» en Ventas pide una en el acto. Una sola en curso
  por empresa (índice único `valery_auto_en_curso`).
- **Qué días.** Desde dos días antes de lo último que entró bien hasta hoy,
  nunca antes del corte ni más de 400 días (`rangoAuto`). Lo repetido no entra:
  cada renglón tiene su clave.
- **Cómo entra.** Cuando llega la última parte, el servidor la aplica al
  kardex sin que nadie pulse «Aplicar»: `importar_ventas_puente`, que solo
  puede llamar la clave de servicio y usa el mismo importador que el Excel
  (`_importar_ventas`, migración 48). Si falla —un código que no está en el
  catálogo, por ejemplo—, el pedido queda en «error» con el motivo y Ventas lo
  muestra; lo anterior no cambia. Las filas crudas se borran al terminar.
- **Dónde se ve.** Finanzas → Ventas (`/admin/revenue`, permiso `revenue`):
  lee el kardex, así que Ventas e Inventario nunca cuentan cosas distintas.
  Lo vendido a la otra empresa del grupo y el consumo interno se apartan y se
  dice cuánto fue (mismas reglas que `scripts/historico-valery.py`). Empieza en
  el corte de inventario; lo anterior está en Reportes.
- **Productos nuevos (migración 49).** Si la venta trae un código que no está
  en el catálogo, lo automático lo da de alta con el código y el nombre de
  Valery, precio y costo en cero (la venta no los trae) y `creado_desde` con el
  pedido; Ventas dice cuáles. Si existe el mismo código con otras mayúsculas,
  NO lo crea: frena y lo dice (en Valery son productos distintos). El Excel
  sigue frenando ante cualquier código desconocido.
- **Apagarlo.** El interruptor de Ventas (Owner o Administrador) lo apaga por
  empresa (`valery_ajustes`). El botón sigue funcionando.

## Toda factura es venta; la nota a crédito, no (2026-11-04, migración 51)

Pedido del Owner al ver que la FAC 1652 y la 1653 no salían en Ventas. No se
perdieron: el importador las reconoció como facturas de notas ya importadas
(1652 → NET 9095 del 30-09 y NET 9200 del 08-10; 1653 → NET 9215 del 09-10,
notas a crédito de V&B) y, para no descontar la mercancía dos veces, no las
guardaba en ninguna parte. La venta quedaba el día de la nota.

- **La factura es la venta.** Sus renglones van a `ventas_facturas_notas` (no
  al kardex: la existencia no cambia) y Ventas la cuenta en su fecha. Las notas
  que cobró se listan como «Facturada · FAC …» y dejan de sumar. Una nota cuya
  factura todavía no está registrada sigue sumando: no se pierde la venta.
- **Las de antes.** La primera actualización automática después de la
  migración pide todo desde el corte, una vez (`facturas_rellenas`), y trae
  las facturas de notas que ya habían pasado. Releer da lo mismo: el
  emparejador prefiere la nota que ya tenía esa factura.
- **Nota a crédito.** Una NET cuyo número está en Cuentas por Cobrar
  («NE-9095») y no se ha cobrado es «A crédito»: no suma en Vendido y tiene su
  tarjeta. Cobrada (liquidada o en cero), suma. La cápsula «A CxC» de Ventas la
  anexa a la deuda de su cliente con su número, fecha y monto (quien maneja la
  cartera). Quien ve Ventas sin ver la cartera recibe de
  `ventas_notas_en_cxc` solo el número y si se cobró.
- De paso: una nota ya marcada no se vuelve a marcar en cada actualización
  (dejaba una importación vacía cada hora).

## Cuentas por cobrar de Valery, para mirar (2026-11-02)

Pedido del Owner: ver la CxC de Valery dentro de Cuentas por Cobrar. Pestaña
«En Valery» (Owner y Administrador, los mismos a quienes la base les da la
lectura): la última lectura del agente, con «Leer de Valery ahora».
**Solo se mira; no toca la cartera de Macedonia**, porque no son lo mismo
(comparado ese día con el agente 1.0.3):

- Valery solo lleva en `V3CXC` facturas (257 con saldo, en bolívares). La
  cartera de Macedonia son notas de entrega (447 de 448), y en Valery las NET
  no generan cuenta por cobrar (`FACTOR_CXC = 0`, crédito 0 en todas).
- En `V3CXP` hay 502 facturas de compra con saldo; 254 son de 2023–2025, que
  lo más probable es que se pagaron y nunca se cerraron en Valery.

Los saldos se muestran en bolívares, como los guarda Valery. El equivalente en
dólares: el documento en dólares a la tasa del documento; el de bolívares a la
tasa BCV de hoy, y se dice. Sin tasa de hoy, el total en dólares no se muestra.

## Agente 1.0.4 (2026-11-02)

- **Hora de cada venta.** El agente manda `VENTAS.HORA_EMISION`; Macedonia la
  guarda en `movimientos_inventario.hora` (migración 50) y Ventas la muestra.
  Lo que entró por Excel no la trae: «—». La primera actualización automática
  con un agente 1.0.4 pide todo desde el corte, una vez, y el importador le
  pone la hora a lo que ya estaba (solo llena; nunca cambia una hora puesta).
- **Copia con instantánea.** La 1.0.3 fallaba al copiar por VSS en
  SERVIDORSUD y copiaba directo. Ahora prueba primero `esentutl /y … /vss`
  (Windows hace la instantánea y copia de ella), luego la instantánea por WMI
  de antes, y solo al final la copia directa; si llega ahí, el panel dice por
  qué fallaron las otras dos.
- **Diagnóstico.** Pedido nuevo que devuelve solo conteos por tabla, tipo de
  documento y estado (V3CXC, V3CXP, HCXC, HCXP, VENTAS, TIPOS_DOCUMENTOS),
  sin un nombre ni un monto: para encontrar dónde guarda Valery las notas de
  entrega a crédito antes de traer la CxC sola.
- CxC y CxP traen también el saldo en dólares de Valery (`V3CXC_ME`,
  `V3CXP_ME`). **Solo son dólares en los documentos en dólares (moneda
  `02`)**: en los de bolívares (`01`, `00`) Valery repite ahí el monto en
  bolívares (respaldo de marzo: 1.194 de 1.194 en CxC, 1.442 de 1.442 en CxP;
  igual en SERVIDORSUD el 3-nov-2026). Tomarlo siempre como dólares mostró
  «867.672,92 Bs · $867.672,92» en el reporte.
- **Movimientos del día.** Pedido nuevo con un rango de días: lo que se hizo
  en CxC y CxP de Valery (facturas, pagos, notas de crédito, retenciones),
  con su hora. Lo usa el **Reporte del día** del Dashboard
  (`components/dashboard/ReporteDia.tsx`), que junta además las ventas, las
  cuentas de Macedonia (cuentas nuevas, abonos, liquidaciones) y la operación
  (notas, cotizaciones, cilindros, gastos, conteos). Cada parte solo para
  quien ve esa sección; lo de Valery, Owner y Administradores. Se pide solo al
  abrir el reporte si no hay lectura de ese día o la de hoy tiene más de una
  hora, y con «Leer de Valery»; nunca dos pedidos iguales en camino.

## Agente 1.0.5: la devolución dice qué nota devuelve (2026-11-05, migración 52)

Pedido del Owner con la Nota de Crédito 752 en la mano («Referencia:
NET-0000009511»): la nota devuelta tiene que decirlo, como la factura dice
qué notas cobró.

- Valery guarda el enlace **renglón por renglón** en
  `VENTAS_DETALLES_REL_CANT` (`correlativo_principal` + `numero_linea_principal`
  → `correlativo_relacionado`, `tipo_documento_relacionado`). En la copia de
  marzo lo tienen 137 de 138 devoluciones desde junio de 2025, a NET y a FAC.
  `VENTAS_FACTURA_RELACIONADA` casi no se usa (1 DEV).
- El agente 1.0.5 manda en cada renglón de una DEV `devuelve`
  («NET 0000009511»). Macedonia lo guarda en `movimientos_inventario.devuelve`.
  La primera actualización con un agente 1.0.5 pide todo desde el corte, una
  vez (`valery_ajustes.devoluciones_rellenas`), y el importador se lo pone a
  las DEV que ya estaban: solo llena, nunca cambia.
- En Ventas: la DEV muestra «NET 9511 · Devuelta» (o «· Devuelta en parte»), y
  la nota «Devuelta · DEV 752». En parte = algún código vendido no volvió
  completo, sumando todas sus DEV (los códigos distinguen mayúsculas). Una
  nota de antes del corte no está en Macedonia: su DEV la nombra sin estado.
  Una nota devuelta toda no muestra «A CxC».
- **Solo es una marca**: lo vendido no cambia (la DEV ya restaba).
- Sin el agente 1.0.5 o sin la migración 52, todo sigue como antes, sin marcas.

## Agente 1.0.6: el inventario sigue al de Valery (2026-11-05, migración 53)

Pedido del Owner: «compara y después cierra la brecha». Comparadas ese día,
de 2.216 productos de Sumigases 609 no coincidían, casi todos con menos en
Macedonia (2702PD-500: −590 contra 663).

**Por qué.** Desde el corte (24-09) al kardex solo entraban las ventas.
Faltaba lo demás que mueve la existencia en Valery, y las ventas en otra
unidad entraban sin convertir.

**Lo que se encontró en la copia de marzo:**
- **Compras** (`V3COMPRAS` y sus detalles):
  - la recepción (RCM) suma;
  - la factura de compra (FCM) suma solo lo que no viene de una recepción: se
    resta la cantidad enlazada en `V3COMPRAS_DETALLES_REL_CANT`;
  - la devolución de compra (DCM) resta;
  - la orden de compra (ODC) no mueve nada.
- **Operaciones de inventario** (`V3OPERACIONES_INVENT`):
  - la carga (CRG) suma y la descarga (DSC) resta;
  - el ajuste (AJS) mueve cargada − descargada. Guarda también la existencia
    de antes y la de después;
  - el traslado (TRS) solo cambia de depósito.
- **Qué mueve la existencia.** Cada documento dice si se aplicó a la
  existencia (`*_ESTADOS.EXIST_ACTUAL_ACTUALIZADA`). Las ventas dicen además
  si están anuladas (`VENTAS_ESTADOS.ANULADO`).
- **Unidades.** La existencia va en la **unidad principal**. Un renglón puede ir
  en la secundaria (`TIPO_UNIDAD`, `FACTOR_UNIDAD` y, en ventas,
  `TIPO_UNIDAD_APLICADA` = S):
  - tipo 1, secundaria mayor: se multiplica. 5 «CAJA» de 50 del 2001912 son 250;
  - tipo 2, secundaria menor: se divide. 1.200 «UND» del 8145P95, que va en
    cajas de 20, son 60 cajas.
  Antes, Macedonia descontaba esos 1.200 tal cual.
- **Verificación.** Entre un ajuste y el siguiente de cada producto, estas
  reglas explican la existencia de antes que guarda Valery en 1.608 de 1.671
  tramos (96,2 %). Los demás son diferencias redondas que ningún documento de
  estas tablas explica.

**Lo que hace el agente 1.0.6:**
- En el pedido de ventas, cada renglón trae su unidad y si está anulado.
- Además trae las compras y operaciones aplicadas, sin montos: el costo de
  compra no sale del servidor.
- Macedonia lleva todo a la unidad principal. La clave del renglón sigue
  siendo la cantidad tal como la escribió Valery: es el mismo renglón, y se le
  corrige la cantidad.
- Las compras entran con origen `compra`. Cargas, descargas y ajustes entran
  con origen `ajuste` («Ajuste Valery» en Movimientos): no se revierten a mano.
- La primera actualización con un agente 1.0.6 pide todo desde el corte, una
  vez (`valery_ajustes.inventario_relleno`).

**Inventario → Contra Valery** (Owner y Administrador): «Leer de Valery» trae
la existencia por depósito y la compara, código por código (las mayúsculas
cuentan), con la del kardex. Cada diferencia dice cuánto movieron los conteos
físicos de Macedonia desde el corte; el resto queda «sin explicar». No cambia
ningún número: Valery es la fuente y la diferencia se explica o se cuenta.

## Agente 1.0.7: la factura de notas, según Valery (2026-11-11, migración 54)

**El problema.** Comprobando el 1.0.6 quedaban 511 productos distintos:
- 266 eran códigos que Valery ya no tiene, en negativo en Macedonia por el
  historial anterior al corte;
- de los 245 restantes, 141 solo tenían ventas desde el corte, y facturas que
  Macedonia descontaba y Valery no. Por ejemplo, la FAC 1596 descontó 200 BRGXL
  y Valery no se movió.

**La causa.** Macedonia adivinaba qué factura cobra una nota de entrega
comparando cliente, código, cantidad y monto (`notasFacturadas`). Cuando no la
reconocía, la factura descontaba otra vez.

**Lo que dice Valery:**
- `VENTAS_ESTADOS.EXIST_ACTUAL_ACTUALIZADA`: si el documento se aplicó a la
  existencia;
- `VENTAS_DETALLES_REL_CANT`: qué renglón de la factura viene de qué nota.

En la copia de marzo, los 1.807 renglones de factura que Valery no aplicó
están todos enlazados a su nota; ninguno queda enlazado a medias. Hay además
182 renglones enlazados en facturas que sí se aplicaron: esos renglones no
descuentan y el resto de la factura sí.

**Lo que hace el agente 1.0.7:**
- Cada renglón de factura trae `mueve`, `rel` (cuánto viene de una nota) y
  `cobra_nota` («NET …»).
- Con eso Macedonia no adivina (`notasFacturadasSegunValery`): el renglón
  enlazado, o el de una factura que Valery no aplicó, es «factura de notas» y
  no descuenta. La nota queda con esa factura.
- Sin el dato (Excel, agente viejo) se sigue reconociendo como antes.
- La primera actualización con un agente 1.0.7 pide todo desde el corte, una
  vez (`valery_ajustes.notas_segun_valery`), y reacomoda lo que ya estaba:
  - la factura que descontaba sin deber sale del kardex y queda en
    `ventas_facturas_notas` (sigue siendo venta);
  - la que Valery sí descontó vuelve al kardex;
  - cada nota toma la factura que dice Valery.

## Lo que el puente nunca hace

- Escribir en Valery, ni conectarse a la base en uso.
- Exponer un puerto del servidor a internet.
- Guardar la clave en claro en Macedonia.
