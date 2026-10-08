// El vencimiento de las notas de entrega, por cobrar y por pagar (regla del
// usuario, 08-10-2026): vencen EL MISMO DÍA DEL MES SIGUIENTE (13-08 → 13-09).
// Cuando la emisión es un 31 o el último día de febrero —o el mes siguiente no
// tiene ese día (29 o 30 de enero)— se cumplen 30 días exactos desde la
// emisión (31-07 → 30-08, 28-02 → 30-03). Al crearlas o anexarlas solo se pide
// la emisión, y al importarlas manda esta regla, no la fecha del archivo.

export const DIAS_NOTA_ENTREGA = 30;

/** aaaa-mm-dd + n días, en calendario (sin horas ni zonas). */
export function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** El vencimiento de una nota de entrega emitida en `emitida`. */
export function venceNotaEntrega(emitida: string): string {
  const [a, m, d] = emitida.split("-").map(Number);
  const finDeFebrero = m === 2 && d === diasDelMes(a, 2);
  const [a2, m2] = m === 12 ? [a + 1, 1] : [a, m + 1];
  if (d === 31 || finDeFebrero || d > diasDelMes(a2, m2)) return sumarDias(emitida, DIAS_NOTA_ENTREGA);
  return `${a2}-${String(m2).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
