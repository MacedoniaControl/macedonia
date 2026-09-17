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

/**
 * Tolerancia al comparar el desglose contra el monto.
 *
 * Las relaciones traen la base y el IVA con cuatro decimales; al pasarlos a
 * centimos, base + IVA puede quedar a un centimo del total sin que nada este
 * mal. Sin esta holgura, casi toda factura normal saldria marcada y la marca
 * dejaria de significar algo.
 */
const HOLGURA = 0.02;

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * La parte de la factura que no lleva IVA.
 *
 * FEBECA y LA FUENTE venden alimentos: parte de cada factura va exenta. Esa
 * porcion no se calcula, se lee -es el hueco entre el total y lo que suman la
 * base y el IVA-, porque el sistema no guarda el renglon exento aparte.
 */
export function parteExenta(monto: number, base: number | null, iva: number | null): number {
  if (base == null) return 0;
  const hueco = cent(monto - base - (iva ?? 0));
  return Math.abs(hueco) <= HOLGURA ? 0 : hueco;
}

export type Revision =
  | { atipico: false }
  | { atipico: true; motivo: "exento"; exento: number }
  | { atipico: true; motivo: "tasa"; tasa: number };

/**
 * Si el desglose de una cuenta se aparta del 16% plano, y por que.
 *
 * Greeg pidio que estas cuentas queden marcadas. El calculo automatico asume
 * que toda la factura esta gravada, y para las 32 facturas gravadas al 16% de
 * las relaciones da exacto. Para las de alimentos no, y cargarlas con el
 * automatico inflaria el IVA y con el la retencion, que es plata que se entera
 * al SENIAT: un error ahi no es cosmetico.
 *
 * Son dos formas de la misma anomalia, segun como venga la hoja. Cuando trae
 * columna de exento, la base es solo lo gravado y el hueco aparece contra el
 * total. Cuando no la trae, lo exento queda sumado dentro de la base y lo que
 * delata es la tasa: el IVA no llega al 16% de esa base.
 */
export function revisarDesglose(monto: number, base: number | null, iva: number | null): Revision {
  if (base == null || !iva) return { atipico: false };

  const exento = parteExenta(monto, base, iva);
  if (exento > 0) return { atipico: true, motivo: "exento", exento };

  const esperado = cent(base * PCT_IVA);
  if (Math.abs(esperado - iva) <= HOLGURA) return { atipico: false };
  return { atipico: true, motivo: "tasa", tasa: base > 0 ? iva / base : 0 };
}
