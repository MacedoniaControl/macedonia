// Anexar un documento a la deuda de un cliente desde su fila de la cartera.
//
// Es una cuenta por cobrar nueva con el cliente ya puesto: amplía lo que debe.
// Para que no haya fricción, el número se escribe como se lee en el papel
// («9150») y se guarda con su prefijo («NE-9150»), igual que lo que entra de
// Valery; y antes de guardar se mira que ese cliente no tenga ya ese número.

import type { ClaseCuenta } from "./retencion.ts";
import { numeroDocumento } from "./valery-cuentas.ts";

const PREFIJO: Partial<Record<ClaseCuenta, string>> = { nota_entrega: "NE", factura: "FAC", nota_debito: "ND" };

/** «9150» → «NE-9150»; «ne 9150» → «NE-9150»; lo que ya trae otro prefijo se respeta. */
export function documentoAnexo(clase: ClaseCuenta, texto: string): string {
  const t = texto.trim().toUpperCase().replace(/\s+/g, " ");
  const p = PREFIJO[clase];
  if (!t || !p) return t;
  if (/^\d[\d\-/.]*$/.test(t)) return `${p}-${t}`;
  const m = t.match(/^([A-Z]+)[\s\-#:.]*(\d.*)$/);
  return m && m[1] === p ? `${p}-${m[2]}` : t;
}

/** El número sin tipo ni sufijo de cliente: «NE-8463·BENITO» → «8463». */
const numero = (d: string) => numeroDocumento(d.split("·")[0]);

/** Los documentos del cliente que ya tienen ese número (vacío = se puede anexar). */
export function yaAnexados(documento: string, delCliente: string[]): string[] {
  const n = numero(documento);
  return n ? delCliente.filter((d) => numero(d) === n) : [];
}
