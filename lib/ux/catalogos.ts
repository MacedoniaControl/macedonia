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
