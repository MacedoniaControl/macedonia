// Retencion de IVA y clases de documento.
//
// Vive aparte de cuentas-db porque es aritmetica pura: no toca la base, y asi
// se puede probar. cuentas-db importa el cliente de Supabase, y Node no puede
// cargar eso para una prueba.

export type ClaseCuenta = "factura" | "nota_entrega" | "nota_debito" | "nota_credito" | "ajuste";

export const CLASES: { id: ClaseCuenta; label: string }[] = [
  { id: "factura", label: "Factura" },
  { id: "nota_entrega", label: "Nota de entrega" },
  { id: "nota_debito", label: "Nota de débito" },
  { id: "nota_credito", label: "Nota de crédito" },
  // Un saldo anterior que el estado de cuenta declara sin documento detras.
  // Llamarlo "factura" seria mentir sobre un papel que no existe.
  { id: "ajuste", label: "Ajuste" },
];

/**
 * El comprador retiene el 75% del IVA y se lo entera al SENIAT, asi que al
 * proveedor le paga el total MENOS eso.
 *
 * Se guarda el resultado en la cuenta en vez de calcularlo siempre al vuelo:
 * el porcentaje puede cambiar por ley, y una cuenta vieja tiene que seguir
 * diciendo lo que se retuvo ENTONCES.
 */
export const PCT_RETENCION = 0.75;

export function retencionDe(iva: number | null, aplica: boolean): number {
  if (!aplica || !iva || iva <= 0) return 0;
  // A centimos: un tercer decimal no existe en dinero.
  return Math.round(iva * PCT_RETENCION * 100) / 100;
}

/**
 * Que clase de documento es, deducida de su prefijo.
 *
 * Es la MISMA regla que usa la migracion 21 para clasificar lo ya cargado, y
 * vive aqui para que la pantalla pueda mostrar la clase antes de que exista la
 * columna. Cuando la columna este, se usa esa; esto queda como respaldo para
 * las cuentas que se carguen sin clasificar.
 *
 * NDE es nota de DEBITO: en las cuentas por cobrar el prefijo de nota de
 * entrega es NE. Confundirlas clasificaria mal las 11 que ya estan cargadas.
 */
export function claseDeDocumento(documento: string): ClaseCuenta {
  const d = documento.trim().toUpperCase();
  if (d.startsWith("NDE-") || d.startsWith("NDE ")) return "nota_debito";
  if (d.startsWith("NDC-")) return "nota_credito";
  if (d.startsWith("NE-") || d.startsWith("NE ")) return "nota_entrega";
  if (d.startsWith("AJUSTE-")) return "ajuste";
  return "factura";
}
