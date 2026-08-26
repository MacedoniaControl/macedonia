// Normalización del RIF.
//
// Vive fuera de directorio-db.ts porque ese archivo es "use server" y ahí solo
// pueden exportarse funciones asíncronas. Además esto lo necesita el cliente
// para comparar sin ir al servidor.

/** Sin espacios y en mayúsculas: `J-123` y `j 123` son el mismo RIF. */
export function normalizarRif(rif: string): string {
  return rif.trim().toUpperCase().replace(/\s+/g, "");
}
