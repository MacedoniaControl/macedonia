# Decisión — Modelo de Inventario (Físico / S / Master)

> Estado: **DEFINIDO (confirmado por Greeg, 2026)**. Base contable de las operaciones de Sumigases.
> Owner del apartado: Inventario. Antes de codear, ver "Pendiente" (muestra de export de Valery).

## 1. Los tres inventarios

| Inventario | Qué es | Quién lo modifica | Precio/Costo |
|---|---|---|---|
| **Inventario Físico** | El inventario oficial de Valery. | **Solo** importando un export de Valery. Read-only dentro de SumiControl. | El de Valery (viene en el export). |
| **Inventario S** | Stock propio y paralelo de SumiControl. | **Solo** documentos generados en SumiControl: nota de entrega y venta (restan), devolución (suma). | El del catálogo de Productos de SumiControl. |
| **Master** | **= Físico + S** (derivado). Refleja la realidad total de la empresa. | No se edita; se recalcula cuando cambia Físico o S. | Se muestra el de cada origen. |

**Regla base:** Físico y S son **independientes, no se mezclan**. Ningún movimiento de Valery entra
a S, y ningún documento de SumiControl toca el Físico. El Master es solo la **suma** para ver el total real.

## 2. Clave e identidad

- **Clave primaria = código de Valery** (ej. `ARG6`, `OXI6`, `2001105`, `E30918`).
- El **SKU de SumiControl** (`GAS-0001`…) es **alias** del código de Valery (tabla de equivalencias).
- El emparejamiento Físico↔S se hace por código de Valery.

## 3. Duplicidad de código (control crítico)

Si un **mismo código** existe **a la vez** en Físico y en S:
1. Se genera una **alerta a OWNER y ADMIN** (código repetido en ambos inventarios).
2. Se **bloquea toda modificación** de ese código hasta que OWNER/ADMIN lo revisen (para asegurar
   que no es un error/doble conteo).
3. Si OWNER/ADMIN deciden que debe existir en ambos a propósito, se marca con el tag
   **"Documento Duplicado"** y se libera.

## 4. Separación

- Por **empresa** (Sumigases / Sudematin) **y** por **almacén** (Lechería / Cumaná).
- El Master respeta empresa y almacén: `Master[empresa][almacén][código] = Físico + S`.

## 5. Alcance: productos + cilindros unificados

- Aplica a productos (electrodos, discos, repuestos…) **y a cilindros**, todos por código de Valery
  (los cilindros ya son productos en Valery, ej. `ARG6 = ARGON CIL 6 M3`).
- **Cilindros:** el inventario cuenta la **existencia total por código**. Los **estados**
  (lleno / vacío / en cliente / pendiente por retorno) se siguen gestionando en el **módulo Cilindros**;
  el inventario no los desglosa, solo la existencia.

## 6. Reglas de movimiento (Inventario S)

- Nota de entrega y venta desde SumiControl → **restan** de S.
- Devolución desde SumiControl → **suma** a S.
- **Sin stock en S:** si un documento intenta descontar más de lo que hay en S, **requiere aprobación
  OWNER/ADMIN**; queda **pendiente por entregar** y no descuenta hasta aprobarse
  (coherente con `docs/decisions/inventory-rules.md`).
- El Físico nunca cambia por estos documentos.

## 7. Modelo de datos (propuesto)

```text
ProductoInv        (codigo PK, descripcion, skuAlias?, categoria, esCilindro, tagDuplicado?)
InvFisico          (codigo, empresa, almacen, existencia, costo, precio, loteImportId)  -- de Valery
InvS               (codigo, empresa, almacen, existencia, costo, precio)                -- propio SumiControl
MovimientoS        (codigo, empresa, almacen, tipo[NE|VENTA|DEVOLUCION|AJUSTE], cantidad, docRef, fecha, aprobadoPor?)
ImportacionFisico  (id, archivo, fecha, filas, empresa)                                 -- lotes de Valery
```
Master = vista/consulta: `Fisico.existencia + S.existencia` agrupado por (empresa, almacen, codigo).

## 8. UI (propuesta)

- Página **Inventario** con selector **Empresa** + **Almacén** y 3 vistas: **Físico** (read-only,
  badge "Valery"), **Inventario S** (editable por documentos), **Master** (Físico + S, solo lectura).
- Tabla Master con columnas: Código · Descripción · **Físico** · **S** · **Master** · Estado (crítico) · tag.
- Fila con **código duplicado** en ambos → resaltada + candado + acción OWNER/ADMIN (aprobar → tag "Documento Duplicado").
- Botón **Importar Físico (Valery)**: sube el export y reemplaza el Físico del lote/empresa/almacén.
- Búsqueda y filtros por categoría; export CSV.

## 9. Formato real del export de Valery (confirmado 2026-07-10)

Archivo `Inventario sin cilindros.xls` (BIFF, hoja "Listado de Existencia a la Fecha"), **1703 productos**,
6 columnas. **No incluye cilindros de gases** (esos van aparte, fase posterior; sí incluye ~21 cilindros
de acero vacíos que son productos normales).

| Col | Campo | Ejemplo |
|---|---|---|
| A | **Código** (clave Valery) | `00001002`, `TAWG12`, `0-290-631` |
| B | **Nombre** | `VARILLA DE PLATA PLANA 0%` |
| C | Und. Ppal. (código de unidad Valery) | `01`, `78`, `9`, `BLIS`, `UN` |
| D | **Existencia Und. Ppal.** | `1`, `-50`, `6` |
| E | Und. Alt. (código de unidad) | `00`, `71` |
| F | Existencia Und. Alt. | `19`, `147` |

Notas:
- El **export NO trae costo ni precio** → el Físico solo aporta **existencia**; costo/precio se toman del
  catálogo de Productos de SumiControl cuando exista, o quedan en 0.
- **Existencia = columna D** (unidad principal). La columna F es una medida alterna (informativa).
- Valery **permite existencias negativas** (43 filas negativas en este export) — se respetan tal cual.
- Los **códigos de unidad** son IDs internos de Valery (`01`, `78`…); mapa legible = fase posterior.
- Sin duplicados dentro del propio export.

**Seed:** `lib/ux/inventory-fisico-seed.json` (generado del .xls). El importador de la UI reemplaza este
Físico subiendo un nuevo export con estas mismas 6 columnas.

### Alcance de esta fase
Primero **productos** (este archivo). Los **cilindros de gases** se integran después (más complejo:
estados lleno/vacío/en cliente). Ya están seedeados como parte del Físico solo los cilindros de acero
vacíos que Valery lista como productos.
