# Documentos Valery (Nota de Entrega / Nota de Crédito) — guía de implementación

> Autor: Claude-Greeg. Formatos replicados a partir de los PDF reales de Valery.
> Implementado para **Sumigases Oriente**. Esta guía indica cómo activarlo para **Sudematin**.

## Estructura del documento (regla confirmada por Greeg)

**FIJO (plantilla, nunca cambia):** logo, RIF/dirección de la empresa emisora, línea de rubros,
cabeceras de columnas, etiquetas de totales (Base Imponible, IVA 16%, IGTF, etc.), gases fijos de la
tabla de cilindros (OXIGENO, ACETILENO, ARGON, NITROGENO), textos ENTREGADO/RECIBIDO/PROCESADO, y el
doble ejemplar de la Nota de Entrega.

**VARIABLE (se llena por documento):** N° correlativo, fechas, artículos/líneas (con sus códigos),
montos y los datos del cliente (nombre, RIF, teléfono, dirección, orden de compra / referencia).

## Dónde vive

- Plantillas: `lib/ux/doc-templates.ts` (funciones `notaEntregaHtml`, `devolucionHtml`, `printDoc`).
- Logo real embebido: `lib/ux/sumigases-logo.ts` (extraído de los PDF, data URI PNG 169×47).
- UI/registro/subida: `app/admin/delivery-notes/page.tsx`.
- Datos fijos de la empresa: constante `EMPRESA` en `doc-templates.ts`.

## Para activar Sudematin (pendiente, hacer cuando toque)

1. **Logo:** extraer el logo de Sudematin de sus PDF con `pdfimages -all archivo.pdf out` (igual que se
   hizo con Sumigases) y guardarlo como `lib/ux/sudematin-logo.ts`.
2. **Datos fijos:** crear una constante `EMPRESA_SUDEMATIN` con su RIF, dirección y sub-bloque.
3. **Selector por empresa activa:** las plantillas deben recibir un parámetro `empresa` (o leer
   `getActiveCompany()`), y elegir el logo + datos fijos correspondientes. Hoy `EMPRESA` está
   cableado a Sumigases; refactorizar a `EMPRESAS[empresaActiva]`.
4. **Correlativos independientes por empresa** (ya se contempla en `documents-correlativos.md`:
   secuencia por empresa + tipo). En la demo cada tipo lleva su `seq`; al haber 2 empresas, la clave
   de persistencia debe incluir la empresa (ej. `ne:seqNE:sudematin`).
5. **Verificar el formato real de Sudematin:** puede diferir del de Sumigases (encabezado, rubros).
   Pedir a Greeg un PDF de ejemplo de Sudematin antes de replicar.

## Notas

- El "guardar en PDF" se hace con `window.print()` sobre una ventana con el documento (el usuario
  elige "Guardar como PDF"). Fase siguiente: generación server-side de PDF (p. ej. con una lib) para
  descarga directa sin diálogo de impresión.
- La subida de PDF de Valery detecta el tipo por el nombre del archivo (NET→entrega, NC/crédito→
  devolución) y lo organiza por fecha en el registro. Parseo del contenido del PDF = fase siguiente.
