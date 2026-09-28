// Números y fechas escritos como se escriben aquí, para la importación de
// cuentas. La importación en sí solo admite la plantilla de Macedonia: ver
// plantilla-cuentas.ts (antes este archivo leía cualquier CSV con columnas
// parecidas, y eso dejaba pasar exportes con significados distintos).

/** Un número que puede venir "1.234,56" (es-VE) o "1234.56". */
export function aNumero(v: string): number | null {
  const t = v.trim().replace(/[$\s]/g, "");
  if (!t) return null;
  // Si hay coma y punto, el ÚLTIMO separador es el decimal.
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  let normal = t;
  if (coma >= 0 && punto >= 0) {
    normal = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    // Sola: decimal si deja 1 o 2 dígitos detrás, si no es de miles.
    normal = t.length - coma - 1 <= 2 ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Fecha en ISO. Acepta aaaa-mm-dd, dd/mm/aaaa y dd-mm-aaaa. */
export function aFecha(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
