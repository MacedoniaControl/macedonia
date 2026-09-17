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

/**
 * Clases que comparten pestaña en el filtro.
 *
 * Greeg pidio que en cuentas por pagar las notas de debito salgan bajo «Nota
 * de entrega». La distincion que le importa al usar la pantalla es factura
 * contra todo lo demas: la factura es el documento fiscal, las notas no.
 *
 * Agrupa la PESTAÑA, no reclasifica: cada cuenta conserva su clase real, que
 * se sigue viendo en su fila y en su detalle. Cambiar la clase seria perder el
 * dato de que esas once son notas de debito, que el propio Greeg confirmo.
 */
const AGRUPADAS: Partial<Record<ClaseCuenta, ClaseCuenta>> = {
  nota_debito: "nota_entrega",
  nota_credito: "nota_entrega",
};

/** Bajo que pestaña cae una clase. */
export function grupoDeClase(clase: ClaseCuenta): ClaseCuenta {
  return AGRUPADAS[clase] ?? clase;
}

/** IVA general en Venezuela. Si cambia por ley, cambia aqui. */
export const PCT_IVA = 0.16;

export type Desglose = { base: number; iva: number; total: number; retencion: number };

/**
 * Desglosa un monto.
 *
 * El monto que se escribe es el TOTAL del documento: es la cifra que aparece
 * en la factura y la que se debe. Con IVA, la base sale de dividir por 1,16 y
 * el IVA es el resto; sin IVA -una compra exenta- la base ES el total.
 *
 * Se calcula asi y no multiplicando por 0,16 porque el total es el dato duro:
 * si se sumara el IVA encima, el monto dejaria de ser el que dice el papel.
 */
export function desglosar(total: number, conIva: boolean, retiene: boolean): Desglose {
  const cent = (n: number) => Math.round(n * 100) / 100;
  if (!conIva || total <= 0) {
    return { base: cent(total), iva: 0, total: cent(total), retencion: 0 };
  }
  const base = cent(total / (1 + PCT_IVA));
  // El IVA es el resto, no base * 0,16: al redondear cada uno por separado,
  // base + iva podia dar un centimo distinto del total.
  const iva = cent(total - base);
  return { base, iva, total: cent(total), retencion: retencionDe(iva, retiene) };
}
