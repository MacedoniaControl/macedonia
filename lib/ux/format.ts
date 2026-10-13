// Todo con los separadores de Venezuela: punto para miles, coma para decimales.
// fmtUsd escribia "$2,447,086" (formato de EE. UU.) al lado de "855,66 Bs" y de
// las descargas en "$1.052,55": la misma pantalla con dos formatos. El "$" va a
// mano porque el formato de moneda de es-VE escribe "USD 2.447.086".

// La base guarda 4 decimales y con ellos se hacen todas las cuentas; en
// pantalla, en las descargas y en lo impreso, dólares y bolívares se ven con 2
// ($72,36), pedido del usuario (13-10-2026). Solo se redondea lo que se ve:
// los campos donde se escribe un monto (fmtMonto) y la tasa BCV (fmtTasa)
// siguen mostrando hasta 4, para que nada se pierda al guardar.
const DECIMALES = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
const DECIMALES_TASA = { minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;
const exacto = (n: number) => Math.abs(n).toLocaleString("es-VE", DECIMALES);

export function fmtUsd(n: number): string {
  return `${n < 0 ? "-" : ""}$${exacto(n)}`;
}

/** Igual que fmtUsd. */
export function fmtUsdCentavos(n: number): string {
  return fmtUsd(n);
}

export function fmtBs(n: number): string {
  return `${n < 0 ? "-" : ""}${exacto(n)} Bs`;
}

/** Bolívares completos, sin abreviar ni redondear (antes «millones de Bs»). */
export function fmtBsCorto(n: number): string {
  return fmtBs(n);
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

/** La tasa BCV, con sus decimales (2 como mínimo, hasta 4). Sin «Bs». */
export function fmtTasa(n: number): string {
  return n.toLocaleString("es-VE", DECIMALES_TASA);
}
