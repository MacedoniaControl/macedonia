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
huella antes de usarlos. Generar un instalador nuevo revoca la clave anterior.

## Lo que el puente nunca hace

- Escribir en Valery, ni conectarse a la base en uso.
- Exponer un puerto del servidor a internet.
- Guardar la clave en claro en Macedonia.
