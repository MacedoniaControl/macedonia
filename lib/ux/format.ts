// Todo con los separadores de Venezuela: punto para miles, coma para decimales.
// fmtUsd escribia "$2,447,086" (formato de EE. UU.) al lado de "855,66 Bs" y de
// las descargas en "$1.052,55": la misma pantalla con dos formatos. El "$" va a
// mano porque el formato de moneda de es-VE escribe "USD 2.447.086".

export function fmtUsd(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString("es-VE")}`;
}

export function fmtBs(n: number): string {
  return `${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(n)} Bs`;
}

/**
 * Bolívares que caben en una tarjeta. Con la tasa en cientos, un año de ventas
 * pasa los diez dígitos y puede llegar a dieciséis: hasta 999.999.999 se
 * escribe entero; de ahí en más, en millones o en billones (10¹² en español).
 */
export function fmtBsCorto(n: number): string {
  const a = Math.abs(n), signo = n < 0 ? "-" : "";
  if (a < 1e9) return `${signo}${Math.round(a).toLocaleString("es-VE")} Bs`;
  if (a < 1e12) return `${signo}${(a / 1e6).toLocaleString("es-VE", { maximumFractionDigits: 1 })} millones de Bs`;
  return `${signo}${(a / 1e12).toLocaleString("es-VE", { maximumFractionDigits: 2 })} billones de Bs`;
}

/** Un monto en dólares, en bolívares a la tasa del día. Sin tasa, null. */
export function enBs(usd: number, tasa: number | null | undefined): string | null {
  return tasa ? fmtBsCorto(usd * tasa) : null;
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-VE").format(n);
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
