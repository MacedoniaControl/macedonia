// Listas que comparten los documentos: cotización, nota de entrega y devolución.
//
// Vivían copiadas en cada archivo de pantalla, y eso hizo que TRES arreglos
// distintos se aplicaran en un lado y sobrevivieran en el otro: la tasa del
// BCV, el vendedor fijo y los tipos de precio. `UNIDADES` incluso había
// divergido en el orden.
//
// Un valor que aparece en dos documentos del mismo negocio tiene que salir de
// un solo lugar, o los documentos empiezan a decir cosas distintas.

/** Los tres que usa el negocio. Definidos por Greeg el 26-ago-2026. */
export const TIPOS_PRECIO = ["Precio Mayorista", "Precio Oferta", "Detal"] as const;

export const DIVISAS = ["Bolívar", "Dólar"] as const;

export const UNIDADES = ["CILINDRO", "UNIDAD", "KG", "MT", "PAR", "CAJA"] as const;

// Motivos de un movimiento de inventario. Vivian en lib/ux/inventory-movements,
// un modulo que guardaba el kardex en el navegador; el kardex ya vive en
// Postgres (movimientos_inventario) y ese modulo quedo muerto salvo estas dos
// listas. Aca no dependen de un almacenamiento que ya no se usa.
export const MOTIVOS_ENTRADA = [
  "Ingreso manual por compra",
  "Devolución de cliente",
  "Traslado entre almacenes",
  "Corrección de conteo",
  "Otro",
] as const;

export const MOTIVOS_SALIDA = [
  "Salida manual por venta",
  "Merma / daño",
  "Traslado entre almacenes",
  "Consumo interno",
  "Corrección de conteo",
  "Otro",
] as const;
