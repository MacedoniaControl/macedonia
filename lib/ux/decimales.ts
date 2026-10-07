// Cuántos decimales lleva un monto (dólares o bolívares).
//
// Es una herramienta administrativa: no se redondea a centavos. La base guarda
// 4 decimales y en pantalla se ven 3 como mínimo. Lo único que se recorta es
// el ruido de la coma flotante (0,1 + 0,2 = 0,30000000000000004).

export const DECIMALES_MONTO = 4;

/** Un monto llevado a los 4 decimales que guarda la base. */
export const aMonto = (n: number) => Math.round(n * 1e4) / 1e4;

/** Por debajo de esto un saldo es cero (medio diezmilésimo). */
export const CASI_CERO = 0.00005;
