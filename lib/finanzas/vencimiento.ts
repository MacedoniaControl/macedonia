// Las notas de entrega por cobrar vencen 30 días después de emitidas (regla de
// la empresa, 07-10-2026): al crearlas o anexarlas solo se pide la emisión.

export const DIAS_NOTA_ENTREGA = 30;

/** aaaa-mm-dd + n días, en calendario (sin horas ni zonas). */
export function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** El vencimiento de una nota de entrega emitida en `emitida`. */
export const venceNotaEntrega = (emitida: string) => sumarDias(emitida, DIAS_NOTA_ENTREGA);
