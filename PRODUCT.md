# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Doce personas de dos empresas hermanas del mismo dueño, en el oriente de
Venezuela. Cada empresa opera por separado y no se mezclan sus números.

| Rol | Quiénes | Qué hacen |
|---|---|---|
| Owner | Greeg (ambas), Saúl (Sumigases), Raúl (Sudematin) | Ven todo, incluidos los registros |
| Administración | Angie, Leonardo, y una cuenta genérica por empresa | Cuentas, compras, configuración |
| Vendedor | Francisco, y ventas de cada empresa | Cotizan y emiten notas de entrega |
| Técnico / almacén | Uno por empresa | Mueven cilindros y cargan movimientos |

**La escena de uso son cuatro, no una:**

- computadora de escritorio, en oficina — administración y ventas;
- **teléfono, en el galpón o la rampa** — almacén moviendo cilindros, posiblemente
  con guantes;
- **teléfono, en la calle** — vendedores visitando clientes;
- tablet o laptop en mostrador — con el cliente enfrente, esperando.

Ninguna es secundaria. Un diseño pensado solo para escritorio falla en tres de
las cuatro.

## Product Purpose

Macedonia existe para hacer visible **la realidad física de los activos**: qué
hay de verdad en el galpón, y dónde están los cilindros que la empresa prestó.

Convive con Valery, que sigue emitiendo los documentos fiscales. Macedonia no
reemplaza esa función y no compite con ella.

Lo que Valery no resuelve, y por eso existe esto:

1. **No se sabe qué hay realmente en el galpón.** El papel dice una cosa y el
   inventario real dice otra, y esa diferencia no la muestra nadie.
2. **Los cilindros en manos de clientes se pierden.** Son activos de la empresa,
   y no hay forma de saber quién tiene qué ni desde cuándo.

Explícitamente **no** es su razón de ser dar números para decidir, ni ser más
cómodo que Valery. Los tableros y reportes existen, pero son consecuencia, no
propósito.

## Positioning

Compara el inventario **contado a mano** contra el **fiscal**, y trata la
diferencia como el dato importante — no como un error a corregir en silencio.

Un sistema que deduce la existencia de sus propios movimientos nunca puede
detectar lo que se fue sin registrarse. Ahí es donde Macedonia mira.

## Operating Context

- **La nota de entrega es el documento principal.** En cuatro semanas: 290 notas
  de entrega contra 59 facturas, y facturan más. No es un documento secundario.
- **Dos monedas.** Se opera en USD y se cobra también en bolívares, a la tasa del
  BCV. Las notas de entrega llevan IVA cuando el pago es en bolívares.
- **Cilindros en comodato.** Se entregan al cliente y hay que recuperarlos; llevan
  un depósito en garantía.
- **Las dos empresas comercian entre sí.** Sudematin le vende a Sumigases, así que
  aparece a la vez como empresa y como proveedor.
- **Las devoluciones son ~19% de la venta bruta**, y es normal en el rubro.
- Buen equipo y buena conexión: no hay que diseñar para red inestable ni para
  teléfonos de gama baja.

## Capabilities and Constraints

**Verdad absoluta, irrevocable:**

- Sumigases = una sola sede, **Puerto La Cruz**. Sudematin = **Cumaná**.
- Son empresas **separadas**. Nada de una aparece dentro de la otra. **No hay
  consolidado.**
- El Owner nunca puede perder acceso, por construcción y no por una regla de
  pantalla.

**Reglas de negocio:**

- Macedonia **no emite documentos fiscales**. Por eso no calcula IGTF ni
  retenciones, aunque guarde el porcentaje del proveedor como referencia.
- El RIF del cliente es **opcional**: más de la mitad de la cartera son personas
  naturales que compran en el mostrador. El del proveedor sí es obligatorio.
- Los correlativos los entrega la base con bloqueo de fila. Un número saltado es
  un hueco explicable; uno repetido es un problema con el cliente.
- La existencia se calcula sumando movimientos. No se guarda como columna.
- Un ajuste manual agrega un movimiento más; nunca pisa el saldo.

**Sin decidir todavía:**

- Cuánto se cobra de depósito por cilindro, y cuáles se rellenan en planta.
- Si el conteo físico se hace completo o por partes, y si la diferencia contra
  Valery se corrige sola o la aprueba alguien.

## Brand Commitments

- Nombre visible: **Macedonia**. Nombre interno del proyecto: SumiControl.
- Interfaz **en español**, con vocabulario del rubro: nota de entrega, comodato,
  rampa, renglón, cartera, correlativo.
- Sumigases se identifica con naranja tierra; Sudematin con azul.

## Evidence on Hand

Datos reales, ya cargados o disponibles:

- 4.303 productos (1.704 Sumigases, 2.599 Sudematin)
- 33 proveedores con RIF, del libro de compras
- 33 cuentas por pagar · $29.663,48
- Histórico de ventas y compras, 2023-04 a 2026-07
- Export de ventas y compras de Valery, en .xls y .xlsx

**Nunca inventar datos.** Todo lo que se muestre tiene que salir de la base o de
un archivo real. Si no hay dato, se dice que no hay.
